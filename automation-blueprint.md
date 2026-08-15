# LeadFlow — Automation Blueprint

**Business problem:** a team is manually copying inbound leads into their CRM — slow, error-prone, and hot leads go cold before anyone follows up.

**Solution:** a lead is captured once, and everything after that runs itself — enrichment, AI qualification, CRM sync, and a real-time alert to sales. No human touches a spreadsheet.

```
Intake form  →  Supabase (leads table)  →  [DB webhook]  →  n8n workflow
                                                              ├─ enrich (company from domain)
                                                              ├─ AI score 0–100 + reason
                                                              ├─ upsert → GoHighLevel (tagged by score)
                                                              ├─ write score/status back → Supabase
                                                              └─ if HOT → Slack alert to sales
```

This blueprint is deliberately tool-agnostic at the edges: the orchestration ships as an **importable n8n workflow** (`n8n-workflow.json`) and the same logic is described for **Make.com** and **Zapier** below.

---

## 1. Supabase setup (backend + database)

Create the table the form writes to and the automation reads/writes:

```sql
create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  name        text not null,
  email       text not null,
  company     text,
  size        int,          -- team size
  budget      int,          -- monthly USD
  timeline    int,          -- 0 research .. 3 urgent
  message     text,
  -- filled in by the automation:
  score       int,
  temperature text,         -- hot | warm | cold
  ai_reason   text,
  status      text default 'captured'   -- captured -> synced
);

-- Row Level Security: allow the public form to INSERT, restrict reads to the app.
alter table public.leads enable row level security;

create policy "anon can insert" on public.leads
  for insert to anon with check (true);

create policy "authenticated can read" on public.leads
  for select to authenticated using (true);
```

Then create a **Database Webhook** (Supabase → Database → Webhooks): trigger on `INSERT` to `public.leads`, method `POST`, URL = your n8n webhook URL. Supabase sends `{ "type": "INSERT", "record": { ... } }` — which is exactly what the workflow's first node expects.

---

## 2. n8n workflow — node by node

Import `n8n-workflow.json` (n8n → *Workflows* → *Import from File*). Nodes:

| # | Node | Type | What it does |
|---|------|------|--------------|
| 1 | **Supabase: New Lead** | Webhook | Receives the INSERT payload from Supabase. |
| 2 | **Normalize Fields** | Set | Flattens `body.record.*` into clean fields; derives `company`/`domain` from the email if blank. |
| 3 | **AI Score** | HTTP Request → Gemini | Sends the lead to an LLM with a scoring rubric; forces JSON output `{score, temperature, reason}`. |
| 4 | **Parse AI Result** | Code | Parses the JSON, clamps the score 0–100, and re-attaches the lead fields. |
| 5 | **Upsert to GoHighLevel** | HTTP Request | Creates/updates the contact (idempotent on email), tags it `hot/warm/cold` + `ai-score-NN`. |
| 6 | **Write Score → Supabase** | HTTP Request (PATCH) | Saves score/temperature/reason back so the dashboard shows it. |
| 7 | **Route by Temperature** | Switch | Branches `hot` vs everything else. |
| 8 | **Alert Sales (Slack)** | HTTP Request | Fires only for hot leads, with the AI's one-line reason. |

**Credentials to add before activating:** Gemini (Header Auth `x-goog-api-key`), GoHighLevel (OAuth2).
**Placeholders to replace:** Slack Incoming Webhook URL, GHL `locationId`, and `YOUR_PROJECT.supabase.co`.

### The AI scoring prompt (the heart of it)

The LLM is instructed to weigh budget, team size, timeline urgency, business-vs-free email, and pain signals in the message, and to return strict JSON:

```json
{ "score": 82, "temperature": "hot", "reason": "Enterprise budget with an urgent timeline and clear manual-work pain." }
```

Because the output schema is fixed, you can swap Gemini for Claude or any model without changing the rest of the flow. The interactive demo (`leadflow-mvp.html`) implements the *same* rubric in plain JavaScript so you can see the scoring logic live without any API keys.

---

## 3. Make.com equivalent (same logic, different platform)

If the team prefers Make.com, build this scenario:

1. **Webhooks → Custom webhook** — paste its URL into the Supabase Database Webhook.
2. **Supabase → Watch Rows** *(alternative trigger if you skip the DB webhook).*
3. **HTTP → Gemini** — same rubric prompt, `response_format.mime_type` = `application/json`. (Make has no native Gemini scoring module; use an HTTP request module.)
4. **Tools → Set variable** / **JSON → Parse JSON** — extract `score`, `temperature`, `reason`.
5. **GoHighLevel → Upsert Contact** (native module) — map fields + tags.
6. **Supabase → Update a Row** — write score/status back.
7. **Router** — one route filtered to `temperature = hot`.
8. **Slack → Create a Message** on the hot route.

**Zapier** version is the same shape: *Webhooks by Zapier (Catch Hook)* → *Webhooks: POST to Gemini* → *Formatter (Utilities → Import JSON)* → *GoHighLevel (Create/Update Contact)* → *Filter (only continue if hot)* → *Slack*.

---

## 4. Reliability built in

- **Error workflow** — attach an n8n error trigger that logs failed runs to a `lead_errors` table and retries CRM/API calls with backoff, so a bad API response never loses a lead.
- **Idempotent CRM upsert** — keyed on email; re-running the workflow never creates duplicate contacts.
- **Status write-back** — every lead carries `captured → synced`, visible on the dashboard for at-a-glance observability.

## 5. Easy extensions (no re-architecture - optional)

Add SMS to hot leads via Twilio · auto-book a call using GHL's calendar link · a weekly digest of leads by temperature · dedupe against existing CRM contacts before upsert · route by territory. Each is one or two extra nodes.
