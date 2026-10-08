import "server-only";
import { headers } from "next/headers";

/**
 * Absolute address of this site, needed for share links and Facebook previews.
 * Set SITE_URL in .env.local for production; otherwise it is taken from the request.
 */
export async function siteUrl() {
  const configured = process.env.SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** The public, shareable link for a donation request. */
export async function shareUrl(requestId: string) {
  return `${await siteUrl()}/d/${requestId}`;
}
