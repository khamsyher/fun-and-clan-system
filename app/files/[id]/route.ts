import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { queryOne } from "@/lib/db";

/**
 * Serves an uploaded file (e.g. meeting minutes) to signed-in users of the same clan only.
 * Unknown ids and other clans' files both answer 404, so ids can't be probed.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/files/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id) || !user.clanId) return new Response("Not found", { status: 404 });

  const file = await queryOne<{ file_name: string; content_type: string; data: Buffer; purpose: string; uploaded_by: string | null }>(
    `SELECT file_name, content_type, data, purpose, uploaded_by FROM files WHERE id = $1 AND clan_id = $2`,
    [id, user.clanId],
  );
  if (!file) return new Response("Not found", { status: 404 });
  // Transfer slips are private: only the member who uploaded one and the clan leader may see it.
  if (file.purpose === "slip" && user.role !== "clan_admin" && file.uploaded_by !== user.id) {
    return new Response("Not found", { status: 404 });
  }

  const headers: Record<string, string> = {
    // Only JPG/PNG/WebP/PDF are ever stored (checked by content on upload), and nosniff stops reinterpretation.
    "Content-Type": file.content_type,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
    "Content-Length": String(file.data.length),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  };
  // Images get a locked-down policy; PDFs don't, because a strict CSP breaks the browser's PDF viewer.
  if (file.content_type.startsWith("image/")) headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'";

  return new Response(new Uint8Array(file.data), { headers });
}
