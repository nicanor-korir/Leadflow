# LeadFlow — AI lead intake & qualification

A public form captures a lead, the backend stores it in **Neon Postgres**, scores it **0–100** with an AI qualification rubric, tags it **hot / warm / cold**, and shows it on a live dashboard. An optional n8n / Make layer syncs hot leads to a CRM and alerts Slack.

**Stack:** Next.js 14 (App Router, TypeScript) · Neon serverless Postgres · Tailwind CSS · zod · lucide-react · deployed on Vercel.

**Zero-config demo.** The only thing you need is one env var, `DATABASE_URL`. On first load the app creates the `leads` table if it doesn't exist and seeds 5 sample leads if the table is empty — the dashboard is never blank. No login anywhere. Scoring works with no API key.

---

## 1. Get a Neon database

1. Go to [neon.tech](https://neon.tech) and create a free account.
2. Create a project (any name, any region).
3. Open **Connection Details** and copy the connection string. It looks like:
   ```
   postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```

> On Vercel you can skip this: **Storage → Create Database → Neon**. Vercel injects `DATABASE_URL` into the project automatically.

## 2. Run locally

```bash
npm install
cp .env.example .env.local     # then paste your connection string into DATABASE_URL
npm run dev
```

Open <http://localhost:3000>. The table auto-creates and the 5 sample leads auto-seed on the first request — there is no migration step and no seed script to run.

Confirm the database connection at any time:

```bash
curl http://localhost:3000/api/health
# {"ok":true,"db":"connected"}
```

## 3. Deploy to Vercel

**Option A — dashboard**

1. Push this repo to GitHub.
2. On Vercel: **Add New → Project → Import** the repo.
3. Add one environment variable: `DATABASE_URL` = your Neon connection string.
4. **Deploy.**

**Option B — CLI**

```bash
npm i -g vercel
vercel                       # link the project
vercel env add DATABASE_URL  # paste the Neon string
vercel --prod
```

That's it — one command, one env var.

## 4. Optional automation layer

Everything below is **optional**. With `N8N_WEBHOOK_URL` unset the app runs completely standalone.

Neon has no built-in database webhooks (unlike Supabase), so **the API route is the trigger**: when `N8N_WEBHOOK_URL` is set, `POST /api/leads` fire-and-forgets the full lead JSON to that URL after the insert. A slow or broken webhook never blocks or fails the response.

**Enable it:**

1. In n8n, import `n8n-workflow.json` (*Workflows → Import from File*).
2. Copy the Webhook node's Production URL.
3. Set it as `N8N_WEBHOOK_URL` locally or on Vercel, and redeploy.

**The n8n workflow, node by node:**

| # | Node | What it does |
|---|------|--------------|
| 1 | **LeadFlow: New Lead** (Webhook) | Receives the flat lead JSON from `POST /api/leads`. |
| 2 | **Normalize Fields** (Code) | Flattens the payload, derives company/domain from the email when blank, and builds the Gemini request. |
| 3 | **AI Score (Gemini)** | Re-scores against the same rubric with a forced JSON schema. |
| 4 | **Parse AI Result** (Code) | Reads whichever response envelope came back, clamps the score, and builds the CRM/Slack/write-back payloads. |
| 5 | **Upsert to GoHighLevel** | Idempotent on email; tags `hot`/`warm`/`cold` + `ai-score-NN`. |
| 6 | **Write Score → LeadFlow** (PATCH) | Calls `PATCH /api/leads/:id` to set `status='synced'`. |
| 7 | **Route by Temperature** (Switch) | Branches `hot` vs. everything else. |
| 8 | **Alert Sales** (Slack) | Fires only for hot leads, with the AI's one-line reason. |

Four things to set before activating — all called out on the sticky note in the canvas:

1. `LEADFLOW_BASE_URL` at the top of **Normalize Fields**.
2. A **Header Auth** credential named `x-goog-api-key` holding your Gemini key, attached to **AI Score**.
3. The **GoHighLevel OAuth2** credential, and `YOUR_GHL_LOCATION_ID` inside **Parse AI Result**.
4. Your **Slack Incoming Webhook** URL.

Two details worth knowing: every HTTP body is built with `JSON.stringify`, so a quote or newline in a lead's message can't break the request; and if Gemini fails, **Parse AI Result** keeps the score the app already computed rather than overwriting a hot lead with a zero.

> For the Make.com and Zapier equivalents, see `automation-blueprint.md`. For the full production hardening path, see **[docs/ai-workflows.md](docs/ai-workflows.md)**.

## 5. How the demo works

Submit the form and the pipeline strip animates through **Captured → Enriched → AI scored → Synced** while the request is in flight. The API validates the body with zod, runs the scoring rubric, inserts the row into Neon, and returns the created lead — the new row appears in the table (ranked by score, highlighted) and a toast confirms `✅ {name} scored {score}/100 — {temp} synced`.

**Scoring** lives in `lib/score.ts` and is deterministic by default, so the same lead always produces the same number — no API key, no network call, nothing to break on stage. Starting at 30 it adds points for budget (up to +28), team size (up to +16), timeline urgency (up to +18) and a business email domain (+8), subtracts 6 for a free email domain, and adds +4 per pain keyword in the message (capped at +12) — naming the matched words in the reason. The result is clamped to 2–99: **hot ≥ 70**, **warm 45–69**, **cold < 45**.

Set `GEMINI_API_KEY` and the same rubric is handed to **Gemini** instead, via the Interactions API with a `response_format` schema that forces `{score, temperature, reason}`. Any failure — bad key, rate limit, timeout, malformed JSON, or an unrecognised response envelope — silently falls back to the deterministic path. The header badges show which mode is live.

Grab a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

### Environment variables

| Variable | Required | Effect when unset |
|---|---|---|
| `DATABASE_URL` | **Yes** | The app shows a readable "could not reach the database" banner. |
| `GEMINI_API_KEY` | No | Uses the built-in deterministic rubric. |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.7-flash`. Use `gemini-3.5-flash-lite` for cheaper high-volume scoring. |
| `N8N_WEBHOOK_URL` | No | No webhook fires; the app runs standalone. |

### Tests

```bash
npm test
```

Covers the rubric's boundaries and every Gemini failure mode — bad key, HTTP error, network throw, malformed JSON, unknown response envelope — asserting each one falls back to the rubric rather than dropping the lead.

### API

| Route | Purpose |
|---|---|
| `GET /api/leads` | All leads, highest score first. Auto-creates + auto-seeds. |
| `POST /api/leads` | Validate → score → insert → fire optional webhook → return the lead. |
| `PATCH /api/leads/:id` | Write-back for the automation layer (score, temperature, reason, status, outcome). |
| `POST /api/leads/:id/rescore` | Re-runs qualification against the stored lead. |
| `GET /api/leads/export` | CSV download. Accepts `q` and `temperature` to match the dashboard filters. |
| `GET /api/health` | `{ ok: true, db: "connected" }`. |

## 6. Working with a lead

**Export.** The toolbar's export button downloads exactly the rows you're looking at — the search box and temperature filter are passed through as `q` and `temperature`, and the button shows the count. The file is RFC-4180 escaped (a prospect's message routinely contains commas, quotes and newlines) and carries a UTF-8 BOM so Excel reads names correctly. Both raw values and human labels are included, so `budget_usd_monthly` stays sortable while `budget_label` stays readable.

**Open a lead** by clicking its row to get everything the table has no room for: the full message, team size, budget and timeline as labels, when it was captured, and whether the score came from Gemini or the rubric. Two actions:

- **Re-score with AI.** Scoring silently falls back to the rubric whenever Gemini is unavailable, so a lead captured during an outage keeps a rubric score forever with nothing to flag it. Re-scoring is the repair, and the `score_source` badge tells you whether it worked this time.
- **Record the outcome** — *Won*, *Lost*, or *No response*. This is the piece that makes the scores falsifiable: until you know what actually happened, nobody can say whether a 90 converts better than a 50. Export the CSV once you have a few dozen and the answer is a pivot table.

Both columns (`score_source`, `outcome`) are added by `ALTER TABLE … ADD COLUMN IF NOT EXISTS` on startup, so there is still no migration step.

## 7. Architecture

```
┌──────────────┐   POST /api/leads   ┌────────────────────┐   INSERT   ┌──────────────┐
│  Intake form │ ──────────────────▶ │  Next.js API route │ ─────────▶ │  Neon        │
│  (light UI)  │                     │  • zod validate    │            │  Postgres    │
└──────────────┘                     │  • AI score (rubric│ ◀───────── │  (leads)     │
        ▲                            │    or Gemini)      │   SELECT   └──────────────┘
        │  GET /api/leads            │  • fire webhook*   │
        │  (dashboard)               └─────────┬──────────┘
        │                                      │ *only if N8N_WEBHOOK_URL set
        │                                      ▼
        │                         ┌────────────────────────┐
        │                         │  n8n / Make (optional) │
        │                         │  enrich → upsert CRM → │
        │                         │  write-back → Slack    │
        │                         └───────┬─────────┬──────┘
        │                                 ▼         ▼
        │                          GoHighLevel   Slack alert (hot)
        └──────────────── all runs on Vercel ─────────────────
```

```mermaid
flowchart TD
  A[Intake form - light UI] -->|POST /api/leads| B[Next.js API route on Vercel]
  B -->|zod validate + AI score| B
  B -->|INSERT / SELECT| C[(Neon Postgres)]
  A -->|GET /api/leads| C
  B -.->|only if N8N_WEBHOOK_URL set| D{n8n / Make}
  D --> E[GoHighLevel upsert]
  D --> F[Slack alert if hot]
  D -.->|write-back status=synced| C
```

```mermaid
sequenceDiagram
  participant U as Prospect
  participant UI as LeadFlow UI
  participant API as /api/leads
  participant DB as Neon
  participant N as n8n (optional)
  U->>UI: submit form
  UI->>API: POST lead
  API->>API: validate + score (rubric/LLM)
  API->>DB: INSERT lead
  API-->>N: POST webhook (if configured)
  API-->>UI: created lead (score, temp)
  UI->>API: GET /api/leads (refresh)
  API->>DB: SELECT
  API-->>UI: leads → dashboard
```

## 8. Project structure

```
├─ app/
│  ├─ layout.tsx              # Inter via next/font, light body, metadata
│  ├─ page.tsx                # server component: loads leads, renders the dashboard
│  ├─ globals.css             # Tailwind + light-theme component classes
│  └─ api/
│     ├─ leads/route.ts               # GET + POST
│     ├─ leads/[id]/route.ts          # PATCH — automation write-back + outcome
│     ├─ leads/[id]/rescore/route.ts  # POST — re-run qualification
│     ├─ leads/export/route.ts        # GET  — filtered CSV
│     └─ health/route.ts
├─ components/
│  ├─ Dashboard.tsx           # client shell: state, refresh, toast, drawer
│  ├─ LeadForm.tsx            # intake form + submit animation
│  ├─ LeadDrawer.tsx          # lead detail panel: re-score + record outcome
│  ├─ Pipeline.tsx            # 4-step animated pipeline strip
│  ├─ StatTiles.tsx           # total / hot / avg score / synced
│  └─ LeadTable.tsx           # search, filter, export, ranked table
├─ lib/
│  ├─ db.ts                   # neon() client, ensureSchema(), seedIfEmpty()
│  ├─ score.ts                # scoring rubric + optional Gemini path
│  ├─ csv.ts                  # RFC-4180 CSV serialisation
│  ├─ filter.ts               # search/temperature filter shared by table + export
│  └─ types.ts                # Lead type + form option lists
├─ n8n-workflow.json          # importable automation workflow
├─ automation-blueprint.md    # Make.com / Zapier equivalents, reliability notes
└─ .env.example
```

## Notes & decisions

- **Neon HTTP driver** (`@neondatabase/serverless`) with plain parameterized SQL and no ORM — nothing to configure, nothing to migrate, ideal for Vercel's serverless functions.
- **Schema/seed on demand.** `ensureReady()` is memoised per process and reset on failure, so a transient error doesn't poison later requests. Seeding is a single `INSERT … WHERE NOT EXISTS` so concurrent cold starts can't double-seed.
- **`PATCH /api/leads/:id`** was included (it is optional in the spec) because the automation layer needs somewhere to write `status='synced'` back to.
- **The submit animation runs concurrently with the request**, so it never makes the app feel slower than it is. On error the strip resets and an inline message appears.
- **Light theme is enforced** via `color-scheme: light`, so the OS dark preference can't wash out a projector demo.
