import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await db()`SELECT 1`;
    return NextResponse.json({ ok: true, db: "connected" });
  } catch (error) {
    console.error("[GET /api/health]", error);
    return NextResponse.json(
      {
        ok: false,
        db: "error",
        error: error instanceof Error ? error.message : "Unknown database error.",
      },
      { status: 500 }
    );
  }
}
