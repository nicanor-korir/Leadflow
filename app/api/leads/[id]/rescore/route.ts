import { NextResponse } from "next/server";
import { db, ensureReady } from "@/lib/db";
import { scoreLeadSmart } from "@/lib/score";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Re-runs qualification against the stored lead.
 *
 * The reason this exists: `scoreLeadSmart()` silently falls back to the
 * deterministic rubric whenever Gemini is unavailable, so a lead captured
 * during an outage keeps a rubric score forever with nothing to flag it.
 * Re-scoring is the repair, and `score_source` shows whether it worked.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid lead id." }, { status: 400 });
  }

  try {
    await ensureReady();
    const sql = db();

    const existing = (await sql`
      SELECT id, name, email, company, team_size, budget, timeline, message
      FROM leads WHERE id = ${id}
    `) as unknown as Lead[];

    const lead = existing[0];
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const { score, temperature, reason, source } = await scoreLeadSmart(lead);

    const rows = await sql`
      UPDATE leads
      SET score = ${score},
          temperature = ${temperature},
          ai_reason = ${reason},
          score_source = ${source}
      WHERE id = ${id}
      RETURNING id, created_at, name, email, company, team_size, budget,
                timeline, message, score, temperature, ai_reason, status,
                score_source, outcome
    `;

    return NextResponse.json({ lead: (rows as unknown as Lead[])[0], source });
  } catch (error) {
    console.error("[POST /api/leads/:id/rescore]", error);
    const detail = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
