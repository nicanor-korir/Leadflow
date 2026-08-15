import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { db, ensureReady, listLeads } from "@/lib/db";
import { scoreLeadSmart } from "@/lib/score";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LeadSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("A valid email is required").max(200),
  company: z.string().trim().max(160).optional().nullable(),
  team_size: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  budget: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  timeline: z.coerce.number().int().min(0).max(3).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
});

export async function GET() {
  try {
    const leads = await listLeads();
    return NextResponse.json({ leads });
  } catch (error) {
    console.error("[GET /api/leads]", error);
    return NextResponse.json({ error: message(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid lead.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const input = parsed.data;

  try {
    await ensureReady();

    // Rubric by default; the Gemini path only when GEMINI_API_KEY is set.
    const { score, temperature, reason } = await scoreLeadSmart(input);

    const sql = db();
    const rows = await sql`
      INSERT INTO leads (name, email, company, team_size, budget, timeline, message,
                         score, temperature, ai_reason, status)
      VALUES (${input.name}, ${input.email}, ${input.company ?? null},
              ${input.team_size ?? null}, ${input.budget ?? null}, ${input.timeline ?? null},
              ${input.message ?? null}, ${score}, ${temperature}, ${reason}, 'captured')
      RETURNING id, created_at, name, email, company, team_size, budget,
                timeline, message, score, temperature, ai_reason, status
    `;
    const lead = (rows as unknown as Lead[])[0];

    // Neon has no database triggers, so this route *is* the automation trigger.
    // Fire-and-forget: a broken webhook must never fail or delay the response.
    notifyAutomation(lead);

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/leads]", error);
    return NextResponse.json({ error: message(error) }, { status: 500 });
  }
}

function notifyAutomation(lead: Lead): void {
  const url = process.env.N8N_WEBHOOK_URL?.trim();
  if (!url) return;

  const delivery = fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
    signal: AbortSignal.timeout(8_000),
  })
    .then((res) => {
      if (!res.ok) console.warn(`[webhook] delivery returned ${res.status} for lead ${lead.id}`);
    })
    .catch((error) => console.warn(`[webhook] delivery failed for lead ${lead.id}:`, error));

  // A bare un-awaited promise is not guaranteed to finish once the response is
  // sent — the serverless instance can be frozen first, silently dropping the
  // webhook. waitUntil keeps the invocation alive until delivery settles.
  // (On Next.js 15.1+ this becomes `after()` from next/server.)
  try {
    waitUntil(delivery);
  } catch {
    // Not running on Vercel (e.g. `next dev`) — the promise resolves normally.
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected server error.";
}
