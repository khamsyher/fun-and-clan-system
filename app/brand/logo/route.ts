import { queryOne } from "@/lib/db";

/**
 * The platform logo. Public, because the sign-in page shows it before anyone signs in.
 * Its URL carries a version (?v=), so browsers may keep it for good.
 */
export async function GET() {
  const logo = await queryOne<{ logo_data: Buffer | null; logo_type: string | null }>(
    `SELECT logo_data, logo_type FROM platform_settings WHERE id = 1`,
  );
  if (!logo?.logo_data || !logo.logo_type) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(logo.logo_data), {
    headers: {
      "Content-Type": logo.logo_type,
      "Content-Length": String(logo.logo_data.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
