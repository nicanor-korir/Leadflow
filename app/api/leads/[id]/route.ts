import { NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureReady } from "@/lib/db";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Write-back endpoint for the optional automation layer: n8n / Make marks a
 * lead `synced` here (and can overwrite the score) once the CRM upsert lands.
 * Unused when no automation is wired up.
 */
const PatchSchema = z.object({
  score: z.coerce.number().int().min(0).max(100).optional(),
  temperature: z.enum(["hot", "warm", "cold"]).optional(),
  ai_reason: z.string().trim().max(2000).optional(),
  status: z.enum(["captured", "synced"]).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid lead id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { score, temperature, ai_reason, status } = parsed.data;

  try {
    await ensureReady();
    const sql = db();

    // COALESCE keeps this a single static statement — omitted fields are left
    // untouched, so there is no dynamically built SQL.
    const rows = await sql`
      UPDATE leads SET
        score       = COALESCE(${score ?? null}::int, score),
        temperature = COALESCE(${temperature ?? null}::text, temperature),
        ai_reason   = COALESCE(${ai_reason ?? null}::text, ai_reason),
        status      = COALESCE(${status ?? null}::text, status)
      WHERE id = ${id}
      RETURNING id, created_at, name, email, company, team_size, budget,
                timeline, message, score, temperature, ai_reason, status
    `;

    const lead = (rows as unknown as Lead[])[0];
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    return NextResponse.json({ lead });
  } catch (error) {
    console.error("[PATCH /api/leads/:id]", error);
    const detail = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
