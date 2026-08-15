import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { scoreLead } from "./score";
import type { Lead } from "./types";

/**
 * Neon HTTP client. Lazy so that a missing DATABASE_URL produces a readable
 * error at request time instead of a cryptic crash at module load.
 */
let client: NeonQueryFunction<false, false> | null = null;

export function db(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local and paste your Neon connection string."
      );
    }
    // The Neon HTTP driver talks to Neon over `fetch`, and Next.js patches
    // `fetch` to cache responses in the Data Cache — which persists across
    // deployments. Without no-store, a query issued during the build gets
    // replayed forever and Server Components render permanently stale rows.
    // `dynamic = "force-dynamic"` does NOT cover this.
    client = neon(url, { fetchOptions: { cache: "no-store" } });
  }
  return client;
}

/**
 * Zero-config demo guarantee: the table creates itself and seeds itself on the
 * first query, so the dashboard is never blank. Memoised per process, and reset
 * on failure so a transient error doesn't poison every later request.
 */
let readyPromise: Promise<void> | null = null;

export function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = initialise().catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

async function initialise(): Promise<void> {
  await ensureSchema();
  await seedIfEmpty();
}

export async function ensureSchema(): Promise<void> {
  const sql = db();
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id          SERIAL PRIMARY KEY,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      name        TEXT NOT NULL,
      email       TEXT NOT NULL,
      company     TEXT,
      team_size   INTEGER,
      budget      INTEGER,
      timeline    INTEGER,
      message     TEXT,
      score       INTEGER,
      temperature TEXT,
      ai_reason   TEXT,
      status      TEXT DEFAULT 'captured'
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS leads_score_idx ON leads (score DESC, created_at DESC)`;
}

/** Sample leads, scored through the real rubric so the demo numbers hold up. */
const SAMPLE_LEADS = [
  {
    name: "Priya Raman",
    email: "priya@northwind-logistics.com",
    company: "Northwind Logistics",
    team_size: 200,
    budget: 10000,
    timeline: 3,
    message:
      "We copy and paste around 300 leads a week from our forms into the CRM. It is slow, error prone, and we need to automate it asap.",
    status: "synced",
    hoursAgo: 2,
  },
  {
    name: "Marcus Bell",
    email: "marcus@brightpathdental.com",
    company: "Brightpath Dental Group",
    team_size: 50,
    budget: 2000,
    timeline: 2,
    message:
      "Our front desk spends hours every week on manual data entry into spreadsheets instead of talking to patients.",
    status: "synced",
    hoursAgo: 9,
  },
  {
    name: "Tom Whitaker",
    email: "tomwhitaker@gmail.com",
    company: "Whitaker Fitness",
    team_size: 10,
    budget: 2000,
    timeline: 2,
    message: "Want to scale outreach without hiring another coordinator.",
    status: "captured",
    hoursAgo: 26,
  },
  {
    name: "Dana Osei",
    email: "dana@fernwoodstudio.co",
    company: "Fernwood Studio",
    team_size: 10,
    budget: 500,
    timeline: 1,
    message: "Looking to integrate our booking form with the CRM at some point this quarter.",
    status: "captured",
    hoursAgo: 33,
  },
  {
    name: "Elena Moreau",
    email: "elena.moreau@yahoo.com",
    company: null,
    team_size: 1,
    budget: 0,
    timeline: 0,
    message: "Just researching options for now, no rush.",
    status: "captured",
    hoursAgo: 52,
  },
];

export async function seedIfEmpty(): Promise<void> {
  const sql = db();
  const now = Date.now();

  const rows = SAMPLE_LEADS.map((lead) => {
    const { score, temperature, reason } = scoreLead(lead);
    return {
      created_at: new Date(now - lead.hoursAgo * 3_600_000).toISOString(),
      name: lead.name,
      email: lead.email,
      company: lead.company,
      team_size: lead.team_size,
      budget: lead.budget,
      timeline: lead.timeline,
      message: lead.message,
      score,
      temperature,
      ai_reason: reason,
      status: lead.status,
    };
  });

  // One atomic statement: the WHERE NOT EXISTS guard means concurrent cold
  // starts can't double-seed the table.
  await sql`
    INSERT INTO leads (
      created_at, name, email, company, team_size, budget,
      timeline, message, score, temperature, ai_reason, status
    )
    SELECT
      s.created_at, s.name, s.email, s.company, s.team_size, s.budget,
      s.timeline, s.message, s.score, s.temperature, s.ai_reason, s.status
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS s(
      created_at  TIMESTAMPTZ,
      name        TEXT,
      email       TEXT,
      company     TEXT,
      team_size   INTEGER,
      budget      INTEGER,
      timeline    INTEGER,
      message     TEXT,
      score       INTEGER,
      temperature TEXT,
      ai_reason   TEXT,
      status      TEXT
    )
    WHERE NOT EXISTS (SELECT 1 FROM leads)
  `;
}

export async function listLeads(): Promise<Lead[]> {
  await ensureReady();
  const sql = db();
  const rows = await sql`
    SELECT id, created_at, name, email, company, team_size, budget,
           timeline, message, score, temperature, ai_reason, status
    FROM leads
    ORDER BY score DESC NULLS LAST, created_at DESC
  `;
  return rows as unknown as Lead[];
}
