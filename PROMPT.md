# Master Prompt for Claude Code — "LeadFlow" (Next.js + Neon + Vercel)

You are my senior full-stack engineer. Build a complete, production-quality but **demo-first** web app called **LeadFlow**. Follow this spec exactly. Ask me nothing until you have scaffolded and the app runs locally — make reasonable choices and note them in the README.

## 1. What we're building
An **AI lead intake & qualification** app. A public form captures a lead; the backend stores it in **Neon Postgres**, scores it 0–100 with an AI qualification rubric, tags it **hot / warm / cold**, and shows it on a live **dashboard**. It demonstrates: fast MVP build, Neon backend, REST APIs/webhooks, and an optional n8n/Make automation that syncs hot leads to a CRM and alerts a Slack channel.

## 2. Hard constraints (do not violate)
- **Stack:** Next.js 14 (App Router, TypeScript) + **Neon** (serverless Postgres) + Tailwind CSS. Deploy target: **Vercel**.
- **No authentication.** The dashboard and form are public. Do not add NextAuth, Clerk, or any login.
- **Light theme only.** Clean, bright, professional. White/near-white surfaces, subtle borders, one accent color (indigo/blue). Must look great when demoed on a projector.
- **Zero-config demo.** The only thing required to run is a single `DATABASE_URL`. On first run the app must **auto-create the table if it doesn't exist** and **auto-seed 5 sample leads if the table is empty**, so the dashboard is never blank in a demo.
- **AI scoring must work with no API key.** Implement a deterministic scoring rubric in TypeScript that runs server-side by default. If (and only if) `OPENAI_API_KEY` is set, use the LLM path instead; otherwise silently use the rubric. Never crash when the key is missing.
- **The app is self-contained.** All optional integrations (n8n, Slack, CRM) are behind optional env vars and must be no-ops when unset.
- Everything must deploy to Vercel with **one click / one `vercel` command** and **one env var** (`DATABASE_URL`).

## 3. Tech choices (use these exactly)
- `next@14` App Router, TypeScript, `app/` directory.
- **Neon driver:** `@neondatabase/serverless` (the HTTP `neon()` tagged-template client — best for Vercel serverless, no pooling setup).
- **Styling:** Tailwind CSS. No component library required; hand-build clean components. Font: Inter via `next/font`.
- **Validation:** `zod` for the API request body.
- **Icons:** `lucide-react`.
- No ORM needed — plain parameterized SQL via the Neon client keeps config minimal. (If you prefer Drizzle, it's allowed, but it must not add required setup steps.)

## 4. Data model
Create this table (the app must run `CREATE TABLE IF NOT EXISTS` automatically on server start / first query):

```sql
CREATE TABLE IF NOT EXISTS leads (
  id          SERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  company     TEXT,
  team_size   INTEGER,          -- 1,10,50,200,1000
  budget      INTEGER,          -- monthly USD bucket: 0,500,2000,10000,50000
  timeline    INTEGER,          -- 0 research .. 3 urgent
  message     TEXT,
  score       INTEGER,          -- 0-100
  temperature TEXT,             -- hot | warm | cold
  ai_reason   TEXT,
  status      TEXT DEFAULT 'captured'  -- captured | synced
);
```

## 5. AI scoring rubric (implement in `lib/score.ts`)
`scoreLead(input)` returns `{ score: 0–100, temperature, reason }`. Start at 30, then:
- **Budget:** ≥50000 +28 · ≥10000 +22 · ≥2000 +14 · ≥500 +6 · else +0.
- **Team size:** ≥200 +16 · ≥50 +11 · ≥10 +6.
- **Timeline:** 3 (urgent) +18 · 2 +12 · 1 +6.
- **Business email** (not gmail/yahoo/hotmail/outlook/icloud/proton) +8; **free email** −6.
- **Pain keywords** in message (manual, hours, waste, copy, paste, spreadsheet, urgent, asap, slow, error, hire, scale, integrate, automate): +4 each, cap +12. Include the matched words in `reason`.
- Clamp 2–99. Temperature: **hot ≥70**, **warm 45–69**, **cold <45**. `reason` = a one-line human explanation.

If `OPENAI_API_KEY` is set, instead call the model (`gpt-4o-mini`, `response_format: json_object`) with the same rubric as the system prompt and parse `{score, temperature, reason}`; fall back to the deterministic function on any error.

## 6. API routes (App Router route handlers)
- `POST /api/leads` — validate body with zod → score with `lib/score.ts` → `INSERT` into Neon → **if `N8N_WEBHOOK_URL` is set, fire-and-forget POST** the full lead JSON to it (do not block or fail the response if it errors) → return the created lead. This app-level webhook call replaces Supabase's database webhook, since Neon has no built-in triggers.
- `GET /api/leads` — return all leads, newest/highest-score first. Auto-create table + auto-seed if empty here (and on `POST`).
- `GET /api/health` — returns `{ ok: true, db: 'connected' }`; used to confirm the Neon connection.

## 7. UI / pages (light theme)
Single dashboard page at `/` with two columns (stack on mobile):
- **Left — "New lead" card:** the intake form (name, work email, company, team size `<select>`, monthly budget `<select>`, timeline `<select>`, message `<textarea>`). Above it, a 4-step **pipeline strip** — *Captured → Enriched → AI scored → Synced* — that animates as the submission is processed. On submit: POST to `/api/leads`, animate the steps, then refresh the list and show a toast (`✅ {name} scored {score}/100 — {temp} synced`).
- **Right — "Sales dashboard" card:** four stat tiles (Total leads, Hot 🔥, Avg AI score, Synced count), a search box + temperature filter, and a table (Lead, Company, AI score with reason, Temperature pill, CRM status). Rows sorted by score. Color pills: hot=red, warm=amber, cold=blue, on light backgrounds.
- Include a small footer note explaining the real pipeline (Form → Neon → API → optional n8n → CRM/Slack).

**Design tokens (light):** page background `#f6f7fb`; cards `#ffffff` with `#e6e8f0` borders and soft shadow; text `#1a1f36`, muted `#6b7280`; accent `#4f46e5` (indigo) with a `#4f46e5→#7c3aed` gradient on the primary button; hot `#ef4444`, warm `#f59e0b`, cold `#3b82f6`, good `#10b981`. Rounded corners (~12px), generous spacing, Inter font. It must look polished and bright.

## 8. Project structure
```
leadflow/
├─ app/
│  ├─ layout.tsx           # Inter font, light <body>, metadata
│  ├─ page.tsx             # dashboard (client components for form + table)
│  ├─ globals.css          # Tailwind + light theme base
│  └─ api/
│     ├─ leads/route.ts    # GET + POST
│     └─ health/route.ts
├─ components/
│  ├─ LeadForm.tsx
│  ├─ Pipeline.tsx
│  ├─ StatTiles.tsx
│  └─ LeadTable.tsx
├─ lib/
│  ├─ db.ts                # neon() client + ensureSchema() + seedIfEmpty()
│  └─ score.ts             # scoring rubric (+ optional LLM path)
├─ .env.example
├─ .env.local              # gitignored
├─ README.md               # setup: Neon, local, Vercel, optional n8n
├─ package.json
└─ next.config.js
```

## 9. Environment variables
Create `.env.example` with comments:
```bash
# REQUIRED — Neon connection string (Vercel → Storage → Neon, or neon.tech dashboard)
DATABASE_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"

# OPTIONAL — real LLM scoring (leave unset to use the built-in rubric)
OPENAI_API_KEY=""

# OPTIONAL — fire the automation on new leads (leave unset to run standalone)
N8N_WEBHOOK_URL=""
```
Only `DATABASE_URL` is required. The app must run and demo fully with the other two blank.

## 10. Deliverables & README
Generate a `README.md` containing, in this order, copy-pasteable steps:
1. **Get a Neon database** — go to neon.tech (free tier), create a project, copy the connection string into `DATABASE_URL`. (Or use Vercel's Neon integration under Storage.)
2. **Run locally** — `npm install`, put `DATABASE_URL` in `.env.local`, `npm run dev`, open `localhost:3000`. Note that the table auto-creates and sample leads auto-seed.
3. **Deploy to Vercel** — push to GitHub, "Import Project" on Vercel, add the single `DATABASE_URL` env var, deploy. (Or `npm i -g vercel && vercel && vercel --prod`.)
4. **Optional automation** — how to enable the n8n/Make layer (Section 11).
5. A short "How the demo works" paragraph and the architecture diagram (Section 12).

## 11. Optional automation layer (document in README, don't require it)
Because Neon has no built-in database webhooks, the **Next.js API route is the trigger**: when `N8N_WEBHOOK_URL` is set, `POST /api/leads` fires the new lead to that URL. The downstream workflow then enriches, (re)scores, syncs to CRM, and alerts Slack.

**n8n workflow to create:**
1. **Webhook** (POST) — copy its URL into `N8N_WEBHOOK_URL` on Vercel.
2. **Set / Edit Fields** — normalize the incoming lead JSON.
3. **HTTP Request → OpenAI** (or reuse the app's score) — confirm/enrich the AI score.
4. **HTTP Request → GoHighLevel** `POST /contacts/upsert` — upsert contact, tag `hot/warm/cold` + `ai-score-NN` (idempotent on email).
5. **HTTP Request (PATCH) → your app** `/api/leads/:id` *(add this route if you want write-back)* or a Neon SQL node — set `status='synced'`.
6. **Switch** on `temperature = hot`.
7. **HTTP Request → Slack Incoming Webhook** — alert sales on hot leads with the AI reason.

**Make.com / Zapier equivalent:** *Custom Webhook (Catch Hook)* → *OpenAI* → *Parse JSON* → *GoHighLevel: Upsert Contact* → *Router/Filter: only hot* → *Slack: Create Message*.

Keep the app working perfectly when `N8N_WEBHOOK_URL` is unset.

## 12. Diagrams (put both in the README)

**Architecture (data flow):**
```
┌──────────────┐   POST /api/leads   ┌────────────────────┐   INSERT   ┌──────────────┐
│  Intake form │ ──────────────────▶ │  Next.js API route │ ─────────▶ │  Neon        │
│  (light UI)  │                     │  • zod validate    │            │  Postgres    │
└──────────────┘                     │  • AI score (rubric│ ◀───────── │  (leads)     │
        ▲                            │    or OpenAI)      │   SELECT   └──────────────┘
        │  GET /api/leads            │  • fire webhook*   │
        │  (dashboard)               └─────────┬──────────┘
        │                                      │ *only if N8N_WEBHOOK_URL set
        │                                      ▼
        │                         ┌────────────────────────┐
        │                         │  n8n / Make (optional)  │
        │                         │  enrich → upsert CRM →  │
        │                         │  write-back → Slack     │
        │                         └───────┬─────────┬───────┘
        │                                 ▼         ▼
        │                          GoHighLevel   Slack alert (hot)
        └──────────────── all runs on Vercel ─────────────────
```

**Mermaid version (for GitHub rendering):**
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

**Request sequence:**
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

## 13. Acceptance checklist (verify before telling me you're done)
- [ ] `npm run dev` works with only `DATABASE_URL` set; table auto-creates; 5 sample leads appear.
- [ ] Submitting the form animates the pipeline and adds a scored row live.
- [ ] Light theme throughout; looks clean and professional; responsive on mobile.
- [ ] No login anywhere. No crash when `OPENAI_API_KEY` / `N8N_WEBHOOK_URL` are unset.
- [ ] `GET /api/health` returns db connected.
- [ ] `README.md` has Neon + local + Vercel + optional n8n steps and both diagrams.
- [ ] Builds cleanly (`npm run build`) and is Vercel-ready.

## 14. Build order
1. Scaffold Next.js + Tailwind + deps; set up Inter and light `globals.css`.
2. `lib/db.ts` (neon client, `ensureSchema`, `seedIfEmpty`) and `lib/score.ts`.
3. API routes (`/api/leads`, `/api/health`).
4. Components + dashboard page with the light UI and pipeline animation.
5. `.env.example`, `README.md` with setup steps + diagrams.
6. Run the acceptance checklist, fix issues, then summarize what you built and the exact commands for me to run.
