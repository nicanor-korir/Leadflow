import { scoreLead, scoreLeadSmart } from "../lib/score";

const LEAD = {
  name: "Priya Raman",
  email: "priya@northwind-logistics.com",
  company: "Northwind Logistics",
  team_size: 200,
  budget: 10000,
  timeline: 3,
  message: "We copy and paste leads, it is slow and we need to automate asap.",
};

const RUBRIC = scoreLead(LEAD);
const realFetch = globalThis.fetch;
let captured: { url: string; init: any } | null = null;

function stub(handler: () => any) {
  globalThis.fetch = (async (url: any, init: any) => {
    captured = { url: String(url), init };
    return handler();
  }) as any;
}

const ok = (body: any) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const MODEL_JSON = JSON.stringify({ score: 81, temperature: "hot", reason: "Enterprise urgency." });

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const good = JSON.stringify(actual) === JSON.stringify(expected);
  good ? pass++ : fail++;
  console.log(`${good ? "  ok  " : "  FAIL"} ${label}${good ? "" : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`);
}

// A — no key at all
delete process.env.GEMINI_API_KEY;
check("no key -> deterministic rubric", (await scoreLeadSmart(LEAD)).score, RUBRIC.score);
check("no key -> source is rubric", (await scoreLeadSmart(LEAD)).source, "rubric");
check("no key -> no HTTP call made", captured, null);

process.env.GEMINI_API_KEY = "test-key";

// B — SDK-style convenience field
stub(() => ok({ output_text: MODEL_JSON }));
check("output_text envelope", await scoreLeadSmart(LEAD), { score: 81, temperature: "hot", reason: "Enterprise urgency.", source: "gemini" });

// request shape, checked once
check("endpoint", captured!.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
check("api key header", captured!.init.headers["x-goog-api-key"], "test-key");
check("api revision pinned", captured!.init.headers["Api-Revision"], "2026-05-20");
const body = JSON.parse(captured!.init.body);
check("default model", body.model, "gemini-3.7-flash");
check("json mime requested", body.response_format.mime_type, "application/json");
check("schema enum forced", body.response_format.schema.properties.temperature.enum, ["hot", "warm", "cold"]);
check("prompt carries the lead", body.input.includes("priya@northwind-logistics.com"), true);

// C — Interactions API steps envelope
stub(() => ok({ id: "int_1", status: "completed", steps: [{ type: "thought", content: [] }, { type: "message", content: [{ type: "text", text: MODEL_JSON }] }] }));
check("steps[].content[].text envelope", (await scoreLeadSmart(LEAD)).score, 81);

// D — legacy generateContent envelope
stub(() => ok({ candidates: [{ content: { parts: [{ text: MODEL_JSON }] } }] }));
check("legacy candidates envelope", (await scoreLeadSmart(LEAD)).score, 81);

// E — model returns an out-of-range score
stub(() => ok({ output_text: JSON.stringify({ score: 250, temperature: "hot", reason: "x" }) }));
check("score clamped to 99", (await scoreLeadSmart(LEAD)).score, 99);
stub(() => ok({ output_text: JSON.stringify({ score: -40, temperature: "cold", reason: "x" }) }));
check("score clamped to 2", (await scoreLeadSmart(LEAD)).score, 2);

// F — temperature missing/invalid is derived from the score
stub(() => ok({ output_text: JSON.stringify({ score: 50, temperature: "lukewarm", reason: "x" }) }));
check("bad temperature derived from score", (await scoreLeadSmart(LEAD)).temperature, "warm");

// G — failure modes all fall back to the rubric
stub(() => ok({ output_text: "not json at all" }));
check("unparseable JSON -> rubric", (await scoreLeadSmart(LEAD)).score, RUBRIC.score);

stub(() => ok({ unexpected: "shape" }));
check("unknown envelope -> rubric", (await scoreLeadSmart(LEAD)).score, RUBRIC.score);

stub(() => ok({ output_text: JSON.stringify({ score: "abc", temperature: "hot", reason: "x" }) }));
check("non-numeric score -> rubric", (await scoreLeadSmart(LEAD)).score, RUBRIC.score);

stub(() => ({ ok: false, status: 403, json: async () => ({}), text: async () => "PERMISSION_DENIED" }));
check("HTTP 403 -> rubric", (await scoreLeadSmart(LEAD)).score, RUBRIC.score);
check("HTTP 403 -> source is rubric", (await scoreLeadSmart(LEAD)).source, "rubric");

stub(() => { throw new Error("ECONNRESET"); });
check("network throw -> rubric", (await scoreLeadSmart(LEAD)).score, RUBRIC.score);

// H — live call with a deliberately invalid key: must fall back, not hang
globalThis.fetch = realFetch;
process.env.GEMINI_API_KEY = "definitely-not-a-valid-key";
const t0 = Date.now();
const live = await scoreLeadSmart(LEAD);
console.log(`\n  live call with bogus key took ${Date.now() - t0}ms`);
check("live bogus key -> rubric fallback", live.score, RUBRIC.score);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
