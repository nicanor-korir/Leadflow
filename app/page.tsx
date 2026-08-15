import { Workflow } from "lucide-react";
import Dashboard from "@/components/Dashboard";
import { listLeads } from "@/lib/db";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let initialLeads: Lead[] = [];
  let initialError: string | null = null;

  try {
    // Creates the table and seeds the samples on a cold database, so the
    // dashboard paints with data on the very first load.
    initialLeads = await listLeads();
  } catch (error) {
    initialError = error instanceof Error ? error.message : "Unknown database error.";
  }

  const automationOn = Boolean(process.env.N8N_WEBHOOK_URL?.trim());
  const llmOn = Boolean(process.env.GEMINI_API_KEY?.trim());

  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-end text-white shadow-[0_6px_16px_-8px_rgba(79,70,229,0.9)]">
            <Workflow className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="text-[19px] font-semibold leading-tight tracking-tight text-ink">LeadFlow</h1>
            <p className="text-[13px] text-muted">AI lead intake &amp; qualification</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge on={llmOn} onLabel="LLM scoring" offLabel="Rubric scoring" />
          <Badge on={automationOn} onLabel="Automation on" offLabel="Automation off" />
        </div>
      </header>

      <Dashboard initialLeads={initialLeads} initialError={initialError} />

      <footer className="mt-8 rounded-2xl border border-line bg-card px-5 py-4 text-[12.5px] leading-relaxed text-muted shadow-card">
        <p>
          <span className="font-semibold text-ink">How this runs in production:</span> the intake form
          POSTs to a Next.js route handler, which validates with zod, scores the lead (deterministic
          rubric by default, Gemini when <code className="rounded bg-[#f1f2f7] px-1 py-0.5">GEMINI_API_KEY</code>{" "}
          is set) and inserts it into Neon Postgres. Neon has no database triggers, so that same route
          is the automation trigger — when{" "}
          <code className="rounded bg-[#f1f2f7] px-1 py-0.5">N8N_WEBHOOK_URL</code> is set it
          fire-and-forgets the lead to n8n, which enriches it, upserts the contact into GoHighLevel,
          writes <code className="rounded bg-[#f1f2f7] px-1 py-0.5">status=synced</code> back through{" "}
          <code className="rounded bg-[#f1f2f7] px-1 py-0.5">PATCH /api/leads/:id</code>, and Slack-alerts
          sales on hot leads. Everything optional is a no-op when unset.
        </p>
      </footer>
    </main>
  );
}

function Badge({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span
      className={[
        "pill border",
        on ? "border-good/25 bg-good/10 text-good" : "border-line bg-[#fbfbfe] text-muted",
      ].join(" ")}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-good" : "bg-muted/50"}`} />
      {on ? onLabel : offLabel}
    </span>
  );
}
