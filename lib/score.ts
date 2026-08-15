/**
 * Lead qualification scoring.
 *
 * `scoreLead()` is a deterministic rubric that runs server-side with no API key
 * and no network — it is the default path and always works.
 *
 * `scoreLeadSmart()` uses an LLM *only* when OPENAI_API_KEY is set, and falls
 * back to the rubric on any error (bad key, rate limit, malformed JSON, timeout).
 * The app must never crash or hang because the key is missing or the API is down.
 */

export type Temperature = "hot" | "warm" | "cold";

export interface ScoreInput {
  name: string;
  email: string;
  company?: string | null;
  team_size?: number | null;
  budget?: number | null;
  timeline?: number | null;
  message?: string | null;
}

export interface ScoreResult {
  score: number;
  temperature: Temperature;
  reason: string;
}

const FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
];

const PAIN_KEYWORDS = [
  "manual",
  "hours",
  "waste",
  "copy",
  "paste",
  "spreadsheet",
  "urgent",
  "asap",
  "slow",
  "error",
  "hire",
  "scale",
  "integrate",
  "automate",
];

export function temperatureFor(score: number): Temperature {
  if (score >= 70) return "hot";
  if (score >= 45) return "warm";
  return "cold";
}

function emailDomain(email: string): string {
  return (email.split("@")[1] || "").trim().toLowerCase();
}

export function isFreeEmail(email: string): boolean {
  return FREE_EMAIL_DOMAINS.includes(emailDomain(email));
}

/**
 * The rubric. Starts at 30 and adds signal. Clamped to 2–99 so the demo never
 * shows an absolute 0 or 100 — every lead keeps a little nuance.
 */
export function scoreLead(input: ScoreInput): ScoreResult {
  const budget = Number(input.budget ?? 0);
  const teamSize = Number(input.team_size ?? 0);
  const timeline = Number(input.timeline ?? 0);
  const message = (input.message ?? "").toLowerCase();

  let score = 30;
  const signals: string[] = [];

  // Budget — the strongest single signal.
  if (budget >= 50000) {
    score += 28;
    signals.push("enterprise budget");
  } else if (budget >= 10000) {
    score += 22;
    signals.push("strong budget");
  } else if (budget >= 2000) {
    score += 14;
    signals.push("solid budget");
  } else if (budget >= 500) {
    score += 6;
    signals.push("modest budget");
  } else {
    signals.push("no stated budget");
  }

  // Team size — a proxy for how much manual work there is to remove.
  if (teamSize >= 200) {
    score += 16;
    signals.push("large team");
  } else if (teamSize >= 50) {
    score += 11;
    signals.push("mid-size team");
  } else if (teamSize >= 10) {
    score += 6;
    signals.push("growing team");
  }

  // Timeline urgency.
  if (timeline >= 3) {
    score += 18;
    signals.push("urgent timeline");
  } else if (timeline === 2) {
    score += 12;
    signals.push("near-term timeline");
  } else if (timeline === 1) {
    score += 6;
    signals.push("this-quarter timeline");
  } else {
    signals.push("still researching");
  }

  // Business vs. free email.
  if (isFreeEmail(input.email)) {
    score -= 6;
    signals.push("free email address");
  } else if (emailDomain(input.email)) {
    score += 8;
    signals.push("business email");
  }

  // Pain signals in the message — +4 each, capped at +12.
  const matched = PAIN_KEYWORDS.filter((word) => message.includes(word));
  if (matched.length > 0) {
    score += Math.min(matched.length * 4, 12);
    signals.push(`pain signals (${matched.join(", ")})`);
  }

  score = Math.max(2, Math.min(99, score));
  const temperature = temperatureFor(score);

  const verdict =
    temperature === "hot"
      ? "Strong fit — follow up today"
      : temperature === "warm"
        ? "Worth nurturing"
        : "Low intent for now";

  return { score, temperature, reason: `${verdict}: ${signals.join(", ")}.` };
}

const SYSTEM_PROMPT = `You are a B2B sales qualification engine. Score inbound leads 0-100 on how likely they are to buy soon.

Apply this rubric. Start at 30, then:
- Budget (monthly USD): >=50000 +28, >=10000 +22, >=2000 +14, >=500 +6, else +0.
- Team size: >=200 +16, >=50 +11, >=10 +6.
- Timeline (0 research .. 3 urgent): 3 +18, 2 +12, 1 +6.
- Business email +8; free email (gmail/yahoo/hotmail/outlook/icloud/proton) -6.
- Pain keywords in the message (manual, hours, waste, copy, paste, spreadsheet, urgent, asap, slow, error, hire, scale, integrate, automate): +4 each, capped at +12. Name the matched words in the reason.
Clamp the final score to 2-99. Temperature: hot >= 70, warm 45-69, cold < 45.

Reply ONLY with JSON: {"score": <int>, "temperature": "hot"|"warm"|"cold", "reason": "<one sentence>"}`;

/**
 * Uses the LLM path when OPENAI_API_KEY is set, otherwise the rubric.
 * Any failure — missing key, network error, bad JSON — silently falls back.
 */
export async function scoreLeadSmart(input: ScoreInput): Promise<ScoreResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return scoreLead(input);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              `Name: ${input.name}`,
              `Email: ${input.email}`,
              `Company: ${input.company ?? ""}`,
              `Team size: ${input.team_size ?? 0}`,
              `Monthly budget (USD): ${input.budget ?? 0}`,
              `Timeline code (0 research .. 3 urgent): ${input.timeline ?? 0}`,
              `Message: ${input.message ?? ""}`,
            ].join("\n"),
          },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) throw new Error(`OpenAI responded ${res.status}`);

    const payload = await res.json();
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}");

    const score = Math.max(2, Math.min(99, Math.round(Number(parsed.score))));
    if (!Number.isFinite(score)) throw new Error("Model returned a non-numeric score");

    const temperature: Temperature = ["hot", "warm", "cold"].includes(parsed.temperature)
      ? parsed.temperature
      : temperatureFor(score);

    return {
      score,
      temperature,
      reason: String(parsed.reason || "").trim() || scoreLead(input).reason,
    };
  } catch (error) {
    console.warn("[score] LLM path failed, using the deterministic rubric:", error);
    return scoreLead(input);
  }
}
