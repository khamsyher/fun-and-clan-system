import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { platformPdf } from "@/lib/export/pdf";
import { platformWorkbook } from "@/lib/export/xlsx";
import { DICTIONARIES } from "@/lib/i18n/config";
import { getLocale } from "@/lib/i18n/server";
import { reportFileName } from "@/lib/report-text";
import { getPlatformReport, parseRange } from "@/lib/reports";

/** Downloads the platform statistics report (super admin only). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") return new Response("Forbidden", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const range = parseRange({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  if (!range.valid) return new Response("Invalid range", { status: 400 });
  const format = sp.get("format") === "pdf" ? "pdf" : "xlsx";

  const locale = await getLocale();
  const t = DICTIONARIES[locale];
  const report = await getPlatformReport(range);
  const body = format === "pdf" ? await platformPdf(report, t, locale, user.fullName) : await platformWorkbook(report, t, locale, user.fullName);

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${reportFileName("platform-report", range.from, range.to, format)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
