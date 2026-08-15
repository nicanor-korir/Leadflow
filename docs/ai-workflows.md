# Automating LeadFlow into a real AI workflow

The demo already runs the whole loop: capture → score → store → notify. This document is about the gap between that and something you'd let a paying client depend on — where leads are never lost, the AI's output is trustworthy, and a failure somewhere at 2am doesn't quietly swallow a hot lead.

It's written against this codebase specifically. File paths and node names are real.

---

## 1. Where the automation is triggered, and why it matters

Supabase gives you database webhooks: a row lands, Postgres fires an HTTP call. **Neon has no equivalent.** There is no trigger, no `pg_net`, no built-in outbound HTTP.

So in LeadFlow the API route *is* the trigger:

```
POST /api/leads
  ├─ zod validate
  ├─ score (rubric, or Gemini when GEMINI_API_KEY is set)
  ├─ INSERT into Neon
  ├─ fire N8N_WEBHOOK_URL   ← the trigger
  └─ 201 { lead }
```

This is a deliberate trade-off, and understanding it is the key to everything below.

| | Database webhook (Supabase) | App-level trigger (this app) |
|---|---|---|
| Fires on | Any insert, including manual SQL | Only inserts through the API |
| Survives app crash | Yes | No |
| Payload | `{type, record}` envelope | Flat lead object |
| Coupling | DB → automation | App → automation |
| Retries | Managed by the platform | **Yours to build** |

The consequence: **anything that writes to `leads` without going through `POST /api/leads` is invisible to the automation.** A row you insert by hand in the Neon console will never reach your CRM. If that matters, see the outbox pattern in §3.

### The `waitUntil` trap

The obvious implementation is wrong on serverless:

```ts
fetch(webhookUrl, { ... });   // ✗ not guaranteed to complete
return NextResponse.json({ lead });
```

Once the response is sent, Vercel is free to freeze the instance. An un-awaited promise can be killed mid-flight, and the lead silently never syncs — with no error anywhere, because the `.catch()` never runs either.

`app/api/leads/route.ts` handles this:

```ts
import { waitUntil } from "@vercel/functions";

const delivery = fetch(url, { ... }).then(...).catch(...);
waitUntil(delivery);   // keeps the invocation alive until it settles
```

On **Next.js 15.1+** this becomes `after()` from `next/server`, which is the recommended API. On Next 14 (where this app sits), `waitUntil` is correct.

This buys you *best-effort* delivery — the request will actually be attempted. It does **not** buy you durability. If n8n returns a 500, the lead stays `captured` forever and nobody finds out.

---

## 2. The contract between the app and the workflow

The workflow's real interface is two things: **the payload shape** and **the JSON schema the model must return.** Keep both stable and you can swap every other piece.

### Outbound payload

`POST /api/leads` sends the created row verbatim:

```json
{
  "id": 6, "created_at": "2026-08-15T10:46:42.077Z",
  "name": "Sara Nkomo", "email": "sara@apexfreight.com",
  "company": "Apex Freight", "team_size": 200, "budget": 50000, "timeline": 3,
  "message": "Our team wastes hours on manual spreadsheet work...",
  "score": 99, "temperature": "hot",
  "ai_reason": "Strong fit — follow up today: enterprise budget, ...",
  "status": "captured"
}
```

n8n wraps this under `body`, which is why **Normalize Fields** starts with `$json.body ?? $json` — that fallback also lets you paste the raw JSON into the node for testing.

### The model's output schema

Every scoring implementation — `lib/score.ts`, the n8n Gemini node, a future Make scenario — returns exactly:

```json
{ "score": 82, "temperature": "hot", "reason": "One sentence." }
```

`lib/score.ts` enforces this with Gemini's `response_format.schema`; the n8n node sends the same schema. Because the shape is pinned, **swapping Gemini for Claude or a local model is a one-node change.** Nothing downstream knows or cares which model produced the numbers.

Pin the API revision too. `lib/score.ts` sends `Api-Revision: 2026-05-20`, so a future change to Google's response envelope can't silently alter parsing.

### Parse defensively

Response envelopes change. `extractText()` in `lib/score.ts` — and the matching code in the n8n **Parse AI Result** node — tries three shapes in order:

1. `output_text` (SDK-style convenience field)
2. `steps[].content[].text` (Interactions API)
3. `candidates[0].content.parts[].text` (legacy `generateContent`)

and falls back to the deterministic rubric if none match. This is why `npm test` asserts all three envelopes plus five failure modes: an API change should degrade the score, never drop the lead.

---

## 3. Delivery guarantees: from best-effort to durable

This is the single biggest gap between the demo and production. Three levels:

### Level 1 — best-effort (what ships today)

`waitUntil` + a `.catch()` that logs. Good enough for a demo. **Lost on:** n8n down, n8n 500, function timeout, deploy mid-request.

### Level 2 — at-least-once with an outbox

The standard fix, and it fits this schema with one table:

```sql
CREATE TABLE IF NOT EXISTS lead_events (
  id           SERIAL PRIMARY KEY,
  lead_id      INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event        TEXT NOT NULL DEFAULT 'lead.created',
  payload      JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | delivered | failed
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_events_due_idx
  ON lead_events (status, next_retry_at) WHERE status = 'pending';
```

`POST /api/leads` writes the lead **and** the event in one transaction, then still attempts immediate delivery via `waitUntil`. A Vercel Cron hitting `/api/events/drain` every minute picks up anything still `pending` and retries with exponential backoff (`next_retry_at = now() + 2^attempts minutes`), marking `failed` after ~6 attempts.

Two properties this gives you that the demo lacks:

- **Nothing is lost.** If n8n is down for an hour, every lead syncs when it returns.
- **You can see the failures.** `SELECT * FROM lead_events WHERE status = 'failed'` is your dead-letter queue.

The cost is that downstream must be idempotent — which it already is (§4).

### Level 3 — a real queue

If volume justifies it, replace the cron drain with a queue (Upstash QStash is the lowest-friction on Vercel: it does the retries and backoff for you, and signs its callbacks). The outbox table stays as your audit log.

**Don't skip to level 3.** Level 2 handles four orders of magnitude of lead volume and costs one table.

---

## 4. Idempotency: why retries are safe

At-least-once delivery means the same lead *will* be processed twice eventually. Every downstream step must tolerate that.

| Step | Why a repeat is harmless |
|---|---|
| **GoHighLevel upsert** | Keyed on email. Re-running updates the same contact rather than creating a duplicate. |
| **`PATCH /api/leads/:id`** | Writes absolute values (`status='synced'`), not deltas. Applying it twice is identical to once. |
| **Gemini scoring** | Pure function of the input. Costs a second call, but the result is stable. |
| **Slack alert** | ⚠️ **Not idempotent.** A retry posts the message again. |

That last row is the one to fix. Guard the Slack node on a state transition rather than on temperature alone — only alert when the lead is *becoming* hot, e.g. add an `alerted_at TIMESTAMPTZ` column and have the write-back set it with `WHERE alerted_at IS NULL`, so the second delivery finds nothing to update and the Switch's hot branch is skipped.

The general rule: **make each step a function of desired end state, not of "what just happened."**

---

## 5. Failure handling, step by step

The workflow has four independent things that can fail. Each should degrade rather than abort.

| Fails | Current behaviour | What to add |
|---|---|---|
| **Gemini** | `Parse AI Result` keeps the app's rubric score and marks `ai_ok: false`. The lead still syncs. | Track the fallback rate — see §6. |
| **GoHighLevel** | The run stops; the lead stays `captured`. | n8n **Error Trigger** workflow → log to `lead_errors`, retry with backoff. |
| **Write-back** | CRM has the contact, dashboard still shows `captured`. Cosmetic drift. | Retry; the PATCH is idempotent. |
| **Slack** | Nobody gets alerted; everything else succeeded. | Lowest severity — log and move on. |

The Gemini node sets `neverError: true` deliberately: **a scoring outage must not stop a CRM sync.** The app has already computed a perfectly good rubric score, and `Parse AI Result` falls back to it rather than overwriting a hot lead with a zero. Losing score *precision* is acceptable; losing the *lead* is not.

Wire up an n8n error workflow once and it covers every node:

1. Create a workflow whose trigger is **Error Trigger**.
2. Insert the failing execution's JSON into a `lead_errors` table (or POST it to an admin endpoint).
3. In the main workflow: **Settings → Error Workflow →** select it.

---

## 6. Knowing whether the AI is actually working

The most dangerous failure in this design is the silent one. `scoreLeadSmart()` catches everything and falls back to the rubric — so if your Gemini key expires, **the app keeps working perfectly and every score is quietly rubric-generated.** The header badge still says "LLM scoring", because it only checks that the env var is set.

Three cheap fixes, in order of value:

1. **Record which path produced the score.** Add `score_source TEXT` (`'rubric' | 'gemini'`) and `score_version TEXT` to `leads`. One column turns an invisible failure into a query:
   ```sql
   SELECT score_source, count(*) FROM leads
   WHERE created_at > now() - interval '1 day' GROUP BY 1;
   ```
2. **Make the badge honest.** Have it reflect the last actual outcome rather than the presence of an env var.
3. **Alert on the fallback rate.** If `gemini` drops below ~90% of scores in a day, something is broken.

`score_version` matters more than it looks: the moment you change a weight in the rubric, old scores stop being comparable to new ones. Without a version column you can never answer "did the change help?"

---

## 7. Making the scores mean something

Right now the rubric is an *assertion*. Nobody has checked whether leads scoring 85 close more often than leads scoring 55. Until you close that loop, "AI scoring" is a plausible-looking number.

**Add the outcome.** One nullable column — `outcome TEXT` (`won | lost | no_response`) — written back from the CRM when a deal closes. That single field unlocks:

- **Calibration.** Do hot leads actually convert at a higher rate? Bucket by score band and compare.
- **Threshold tuning.** Maybe hot should start at 65, not 70. This is measurable rather than a guess.
- **Rubric vs. model.** Score every historical lead both ways and see which correlates better with `outcome`. That's the honest way to decide whether the LLM earns its cost.

**Build a golden set.** Fifty leads with hand-agreed scores, committed as a fixture. Run both scorers against it in CI. Now a prompt change is a diff you can review instead of a vibe.

Once you have this, "enrichment" becomes worth doing for real. The pipeline strip currently shows an **Enriched** step that does nothing — the honest version fills company size and industry from the email domain (Clearbit, Apollo, or plain DNS/MX lookups) and feeds those into the score.

---

## 8. Security of the automation surface

Two things to fix before pointing real traffic at this.

**`PATCH /api/leads/:id` is unauthenticated.** Anyone who can reach your domain can rewrite any lead's score and status. The spec's "no authentication" rule is about the dashboard and form — it was never meant to cover a machine-to-machine endpoint. Add a shared secret without breaking zero-config:

```ts
const secret = process.env.AUTOMATION_SECRET?.trim();
if (secret && request.headers.get("x-automation-secret") !== secret) {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}
```

Unset → open, exactly as today. Set → enforced. Then add the header to the n8n **Write Score → LeadFlow** node.

**`POST /api/leads` is an open, unauthenticated write.** Nothing stops a script inserting a million rows — each one costing you a Gemini call. Minimum viable protection: a hidden honeypot field the form leaves empty, plus per-IP rate limiting (`ipAddress()` from `@vercel/functions` + Upstash Redis, or a Vercel WAF rate-limit rule).

Also worth deciding deliberately: **the public dashboard displays every lead's full email address.** That's fine for seeded demo data and a problem the moment a real person fills in the form.

---

## 9. Porting to Make.com or Zapier

The shape is identical; only the node names change. The two things that must not drift are the payload contract (§2) and idempotency (§4).

**Make.com**

1. **Webhooks → Custom webhook** — its URL goes into `N8N_WEBHOOK_URL`.
2. **Tools → Set multiple variables** — flatten and derive `domain` from the email.
3. **HTTP → Make a request** — POST to `https://generativelanguage.googleapis.com/v1beta/interactions` with an `x-goog-api-key` header. (Make has no native Gemini scoring module; use raw HTTP so you keep the `response_format` schema.)
4. **JSON → Parse JSON** — extract `score`, `temperature`, `reason`.
5. **GoHighLevel → Upsert Contact** — native module, map tags.
6. **HTTP → Make a request (PATCH)** — write back to `/api/leads/:id`.
7. **Router** — one route filtered to `temperature = hot`.
8. **Slack → Create a Message** on that route.

**Zapier:** *Webhooks by Zapier (Catch Hook)* → *Webhooks by Zapier (POST to Gemini)* → *Formatter → Utilities → Import JSON* → *GoHighLevel (Create/Update Contact)* → *Filter (only continue if hot)* → *Slack*.

Zapier's Filter step silently ends the run for non-hot leads, so put the CRM upsert and write-back **before** the filter or they'll only ever run for hot leads.

---

## 10. Cost and latency

Scoring is one small call per lead — a few hundred input tokens, a few dozen out. Notes that actually matter at volume:

- **Two models, not one.** `gemini-3.5-flash-lite` handles the vast majority; reserve `gemini-3.7-flash` for leads near a threshold (say 60–80) where precision changes the routing. Set the default with `GEMINI_MODEL`.
- **The rubric is free.** It runs in microseconds with no network call. Consider it the primary scorer and the LLM a second opinion on ambiguous cases, rather than calling the model on every lead.
- **Double-scoring is the norm here.** The app scores on insert *and* n8n re-scores. That's intentional (the workflow can enrich first), but it's two calls per lead — drop the n8n scoring node if you don't need it.
- **Timeouts are already bounded**: 12s on Gemini (`lib/score.ts`), 8s on the webhook. Keep them well under your function's `maxDuration`, since `waitUntil` promises share the invocation's deadline.

---

## 11. A checklist for going live

- [ ] `AUTOMATION_SECRET` set, and the header added to the n8n write-back node
- [ ] Rate limiting + honeypot on `POST /api/leads`
- [ ] Decide what the public dashboard may show (emails?)
- [ ] `lead_events` outbox + cron drain, so no lead is lost
- [ ] n8n Error Trigger workflow wired to the main workflow
- [ ] Slack alert made idempotent (`alerted_at`)
- [ ] `score_source` + `score_version` columns, and an alert on fallback rate
- [ ] Separate Neon branches for dev and production
- [ ] CI running `npm test` and `npm run build` on every push

Sequenced with effort estimates and acceptance criteria in **[roadmap.md](roadmap.md)**.
