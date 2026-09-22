import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { clanPdf } from "@/lib/export/pdf";
import { clanWorkbook } from "@/lib/export/xlsx";
import { DICTIONARIES } from "@/lib/i18n/config";
import { getLocale } from "@/lib/i18n/server";
import { reportFileName } from "@/lib/report-text";
import { getClanReport, parseRange } from "@/lib/reports";

/** Downloads the clan's account report as Excel or PDF, for the leader of that clan only. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "clan_admin" || !user.clanId) return new Response("Forbidden", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const range = parseRange({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  if (!range.valid) return new Response("Invalid range", { status: 400 });
  const format = sp.get("format") === "pdf" ? "pdf" : "xlsx";

  const locale = await getLocale();
  const t = DICTIONARIES[locale];
  const report = await getClanReport(user.clanId, range);
  const body = format === "pdf" ? await clanPdf(report, t, locale, user.fullName) : await clanWorkbook(report, t, locale, user.fullName);

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${reportFileName(`clan-report-${report.clan.code}`, range.from, range.to, format)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
