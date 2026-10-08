import type { NextRequest } from "next/server";
import { queryOne } from "@/lib/db";

/**
 * The cover photo of a donation request, served publicly so shared links show a preview
 * on Facebook and WhatsApp. Only this one photo per request is public — never slips,
 * QR codes or any other upload.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/d/[id]/photo">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const file = await queryOne<{ data: Buffer; content_type: string }>(
    `SELECT f.data, f.content_type
       FROM donation_requests r JOIN files f ON f.id = r.photo_file_id
      WHERE r.id = $1 AND r.status <> 'cancelled' AND f.purpose = 'donation_photo'`,
    [id],
  );
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.content_type,
      "Content-Length": String(file.data.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'",
    },
  });
}
