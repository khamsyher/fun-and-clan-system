import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { queryOne } from "@/lib/db";

/**
 * Serves an uploaded file. Who may see what:
 *  - donation photos and QR codes: every signed-in user (donation requests are cross-clan)
 *  - donation slips: the donor who uploaded it and the person who asked for the donation
 *  - transfer slips: the member who uploaded it and their clan leader
 *  - everything else (meeting minutes, payout proofs): signed-in users of the same clan
 * Anything not allowed answers 404, so ids can't be probed.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/files/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const file = await queryOne<{
    file_name: string;
    content_type: string;
    data: Buffer;
    purpose: string;
    uploaded_by: string | null;
    clan_id: string | null;
  }>(`SELECT file_name, content_type, data, purpose, uploaded_by, clan_id FROM files WHERE id = $1`, [id]);
  if (!file) return new Response("Not found", { status: 404 });

  const allowed = await canRead(id, file, user);
  if (!allowed) return new Response("Not found", { status: 404 });

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

async function canRead(
  fileId: string,
  file: { purpose: string; uploaded_by: string | null; clan_id: string | null },
  user: { id: string; role: string; clanId: string | null },
) {
  if (file.purpose === "donation_photo" || file.purpose === "donation_qr") return true;

  if (file.purpose === "donation_slip") {
    if (file.uploaded_by === user.id) return true;
    // The person who asked for the donation can open slips sent to their own request.
    const owner = await queryOne(
      `SELECT 1 FROM donations d JOIN donation_requests r ON r.id = d.request_id
        WHERE d.slip_file_id = $1 AND r.created_by = $2`,
      [fileId, user.id],
    );
    return Boolean(owner);
  }

  // An upload with no clan came from a general user; only they can open it.
  if (file.clan_id === null) return file.uploaded_by === user.id;
  if (file.clan_id !== user.clanId) return false;
  if (file.purpose === "slip" && user.role !== "clan_admin" && file.uploaded_by !== user.id) return false;
  return true;
}
