# LeadFlow — improvement research & phased plan

An audit of the shipped app and a sequenced plan to take it from *convincing demo* to *system a client can depend on*.

Every finding below was verified against the code, not assumed. Where something is already fine, it isn't listed.

---

## Where it stands today

**Genuinely solid.** Zero-config startup (schema + seed on first query, guarded by `INSERT … WHERE NOT EXISTS` so concurrent cold starts can't double-seed). Scoring degrades safely — `npm test` proves all three Gemini response envelopes and five failure modes fall back to the rubric rather than dropping a lead. Parameterised SQL throughout. The build is clean and the light theme holds up on a projector.

**The honest gaps.** It has no defences against abuse, no durability for the automation hand-off, no way to tell whether the AI is working or has silently failed, and no evidence that a score of 85 means anything at all.

### Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | `PATCH /api/leads/:id` is completely unauthenticated — anyone can rewrite any lead's score and status | no auth check in `app/api/leads/[id]/route.ts` | **Critical** |
| 2 | `POST /api/leads` is an open write with no rate limit, captcha, or honeypot — each abusive request can cost a Gemini call | `app/api/leads/route.ts` | **Critical** |
| 3 | Public dashboard renders every lead's full email address | `components/LeadTable.tsx:96` | **High** (privacy) |
| 4 | Webhook delivery is best-effort only; an n8n outage loses the sync permanently, with no dead-letter | `notifyAutomation()` logs and moves on | **High** |
| 5 | Silent AI failure — an expired key falls back to the rubric forever while the badge still reads "LLM scoring" | badge checks only that the env var is set (`app/page.tsx:21`) | **High** |
| 6 | No duplicate protection — the same person submitting twice creates two leads | no `UNIQUE` in `lib/db.ts`; **two identical live rows (ids 8, 9) already exist in production** | Medium |
| 7 | Scores are unfalsifiable — no outcome data, so nobody knows if hot leads convert better | no `outcome` column | Medium |
| 8 | Dev and production share one Neon database | single `DATABASE_URL` across all three Vercel environments | Medium |
| 9 | `listLeads()` is an unbounded `SELECT` with no `LIMIT` | `lib/db.ts` | Medium |
| 10 | Dashboard only refreshes after *your own* submit — a second viewer never sees new leads | single `void refresh()` in `components/Dashboard.tsx:50` | Medium |
| 11 | No CI — nothing runs `npm test` or `npm run build` on push | no `.github/workflows` | Medium |
| 12 | The **Enriched** pipeline step is decorative; nothing enriches anything | `components/Pipeline.tsx` | Low |
| 13 | Changing a rubric weight silently invalidates comparisons with historic scores | no `score_version` column | Low |
| 14 | `created_at` is stored but never displayed — no "when" column, no recency sort | not referenced in `components/` | Low |
| 15 | Slack alerts aren't idempotent; a retried delivery posts twice | n8n workflow | Low |
| 16 | Toast claims "synced" while the row correctly shows `captured` | spec-mandated string | Cosmetic |

---

## Phase 1 — Make it safe to expose (≈ half a day)

**Goal:** nothing here can be abused, and no personal data leaks. Do this before the URL goes in a proposal.

Addresses findings 1, 2, 3.

### 1.1 Authenticate the write-back endpoint

Optional-by-default, so zero-config is preserved:

```ts
// app/api/leads/[id]/route.ts
const secret = process.env.AUTOMATION_SECRET?.trim();
if (secret && request.headers.get("x-automation-secret") !== secret) {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}
```

Unset → behaves exactly as today. Set → enforced. Add the header to the n8n **Write Score → LeadFlow** node.

### 1.2 Rate-limit and honeypot the intake

- Hidden field the real form leaves empty; reject any submission that fills it. Costs nothing, stops naive bots.
- Per-IP limit via `ipAddress()` from `@vercel/functions` — 5/min, 50/hour. Upstash Redis, or a Vercel WAF rule if you'd rather not add a dependency.
- Score *after* the rate-limit check so abuse can't run up an AI bill.

### 1.3 Decide what the dashboard may show

Mask by default (`s•••@apexfreight.com`), with a `SHOW_FULL_EMAILS=true` escape hatch for local demos. Choosing to display them is fine — doing it unintentionally isn't.

**Done when:** an unauthenticated PATCH returns 401 with the secret set; a script firing 100 submissions gets throttled; no full email addresses in the public HTML.

---

## Phase 2 — Never lose a lead (≈ 1 day)

**Goal:** every captured lead reaches the CRM, even through an outage — and failures are visible.

Addresses findings 4, 8, 11.

### 2.1 Outbox + retry

Add the `lead_events` table from [ai-workflows.md §3](ai-workflows.md#3-delivery-guarantees-from-best-effort-to-durable). Write the lead and its event in one transaction; attempt immediate delivery as now; add `/api/events/drain` on a one-minute Vercel Cron to retry `pending` rows with exponential backoff and mark `failed` after ~6 attempts.

`SELECT * FROM lead_events WHERE status = 'failed'` becomes your dead-letter queue.

### 2.2 n8n error workflow

An **Error Trigger** workflow that records failed executions, attached via **Settings → Error Workflow**. One-time setup, covers every node.

### 2.3 Split the databases

Neon branching gives a prod-shaped copy in seconds. Point Vercel's **development** and **preview** environments at a `dev` branch and leave `main` for production. Right now `npm run dev` writes to the same rows the live demo serves.

### 2.4 CI

GitHub Actions on push: `npm ci`, `npm run build`, `npm test`, `npx tsc --noEmit`. The test suite already exists and catches real regressions — nothing runs it automatically.

**Done when:** with n8n stopped, submitting a lead leaves a `pending` event that delivers automatically once n8n returns; CI is green on a PR.

---

## Phase 3 — Make the AI trustworthy (≈ 2 days)

**Goal:** know that the model is running, and that its numbers predict something.

Addresses findings 5, 7, 12, 13.

### 3.1 Observability for the scorer

Add `score_source TEXT` (`rubric | gemini`) and `score_version TEXT`. Populate from `scoreLeadSmart()`. Make the header badge reflect the last real outcome rather than the presence of an env var. Alert if the Gemini share drops below ~90% in a day.

This converts the app's most dangerous failure — silent, invisible, indefinite — into a query.

### 3.2 Close the outcome loop

Add `outcome TEXT` (`won | lost | no_response`), written back from the CRM. Then measure:

```sql
SELECT width_bucket(score, 0, 100, 5) AS band,
       count(*) FILTER (WHERE outcome = 'won')::float / count(*) AS win_rate
FROM leads WHERE outcome IS NOT NULL GROUP BY band ORDER BY band;
```

If that curve isn't monotonic, the rubric is decorative — and now you can prove it and fix it.

### 3.3 A golden set and an eval

~50 leads with hand-agreed scores as a committed fixture. Run rubric and model against it in CI; report mean absolute error and temperature-bucket agreement. A prompt change becomes a reviewable diff instead of a guess.

This is also how you honestly answer *"is the LLM worth its cost over the free rubric?"* — today there is no evidence either way.

### 3.4 Real enrichment

Make the **Enriched** step true: resolve company size and industry from the email domain and feed them into the score. Until then the pipeline strip is showing the client something that isn't happening.

**Done when:** a dashboard query shows the rubric/Gemini split; the win-rate-by-band query returns a monotonic curve, or you know why not.

---

## Phase 4 — Scale and operate (≈ 1–2 days)

**Goal:** stays fast and observable past a few thousand leads.

Addresses findings 6, 9, 10, 14, 15, 16.

- **Pagination.** `LIMIT`/`OFFSET` (or keyset on `(score, id)`) on `listLeads()`, server-side search and temperature filter. The `leads_score_idx` index already exists to support it.
- **Live dashboard.** Poll `/api/leads` every 10s while the tab is visible; SSE if it needs to feel instant. Today a second viewer never sees anything new.
- **Deduplicate.** `UNIQUE (lower(email))` plus `ON CONFLICT` to update the existing lead and keep the higher score — matching the CRM's upsert semantics. Two duplicate rows already exist in production.
- **Idempotent Slack.** `alerted_at TIMESTAMPTZ` set via `WHERE alerted_at IS NULL`, so a retry can't double-post.
- **Show recency.** Render `created_at` as a relative "2h ago" column and allow sorting by it — a stored field the UI currently ignores.
- **Fix the toast.** `✅ {name} scored {score}/100 — {temp}, captured` matches what the row actually says. Deliberate deviation from the spec string, which claims "synced" before anything has synced.

**Done when:** the dashboard is responsive with 10k seeded rows; a duplicate submission updates rather than inserts.

---

## Sequencing

```
Phase 1  Safety        ██              half a day   ← before any public link
Phase 2  Reliability   ████            1 day        ← before a client depends on it
Phase 3  AI quality    ████████        2 days       ← before calling it "AI qualification"
Phase 4  Scale         ██████          1–2 days     ← before real volume
```

Phases 1 and 2 are prerequisites for real traffic and should not be reordered. Phase 3 is what turns the demo's central claim into something defensible — it's the highest-value work, and the easiest to skip. Phase 4 is genuinely deferrable until volume demands it.

**If you only do one thing:** Phase 1.1. An open endpoint that lets anyone rewrite lead scores is the difference between a demo and a liability.
