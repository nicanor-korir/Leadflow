import { listLeads } from "@/lib/db";
import { csvFilename, leadsToCsv } from "@/lib/csv";
import { filterLeads, isFilter } from "@/lib/filter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * CSV export. Accepts the same `q` and `temperature` params the dashboard
 * toolbar holds, so the file matches the rows on screen rather than always
 * dumping the whole table.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = params.get("q") ?? "";
    const temperature = params.get("temperature");

    const leads = await listLeads();
    const rows = filterLeads(leads, query, isFilter(temperature) ? temperature : "all");

    return new Response(leadsToCsv(rows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename()}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[GET /api/leads/export]", error);
    const detail = error instanceof Error ? error.message : "Unexpected server error.";
    return Response.json({ error: detail }, { status: 500 });
  }
}
