import { requireSessionIdentity } from "@/lib/auth";
import { buildMyDataExport } from "@/lib/privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const identity = await requireSessionIdentity();
    const data = await buildMyDataExport(identity);
    const date = new Date().toISOString().slice(0,10);
    return new Response(JSON.stringify(data,null,2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="bandwagon-data-${date}.json"`,
        "cache-control": "no-store, private",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to export account data" },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }
}
