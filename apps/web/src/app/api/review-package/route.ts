import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const fileName = "BandWagon_Organization_Proposal_and_Review_Package.docx";

export async function GET() {
  try {
    const file = await readFile(path.join(process.cwd(), "public", "documents", fileName));
    return new Response(file, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Review package download failed", error);
    return Response.json({ error: "The review package is temporarily unavailable." }, { status: 503 });
  }
}
