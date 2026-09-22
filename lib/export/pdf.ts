import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { fmt, type Dictionary, type Locale } from "../i18n/config";
import { formatDate } from "../format";
import { ledgerDetail, summaryRows } from "../report-text";
import type { ClanReport, PlatformReport } from "../reports";

// Public Sans for Latin (English, Hmong RPA, numbers); Noto Sans Lao for Lao script.
// The Kip sign is in neither font, so amounts use the word from the dictionary instead.
const FONT_DIR = join(process.cwd(), "node_modules", "@fontsource");
const FONT_FILES = {
  lat: "public-sans/files/public-sans-latin-400-normal.woff",
  latB: "public-sans/files/public-sans-latin-700-normal.woff",
  lao: "noto-sans-lao/files/noto-sans-lao-lao-400-normal.woff",
  laoB: "noto-sans-lao/files/noto-sans-lao-lao-700-normal.woff",
} as const;
let fontCache: Record<keyof typeof FONT_FILES, Buffer> | null = null;
const fonts = () =>
  (fontCache ??= Object.fromEntries(Object.entries(FONT_FILES).map(([k, f]) => [k, readFileSync(join(FONT_DIR, f))])) as Record<
    keyof typeof FONT_FILES,
    Buffer
  >);

const INK = "#0d1830";
const MUTED = "#5b6680";
const BRAND = "#12357a";
const WASH = "#e6edfb";
const LINE = "#dce2ed";
const RED = "#a3342a";
const GREEN = "#23694a";

// Landscape A4.
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const M = 40;
const CONTENT_W = PAGE_W - M * 2;
const BOTTOM = PAGE_H - 56;

type Col = { label: string; width: number; align?: "left" | "right" };
type Opts = { size?: number; bold?: boolean; color?: string; width?: number; align?: "left" | "right" | "center" };

class Report {
  doc: PDFKit.PDFDocument;
  y = M;
  private num = new Intl.NumberFormat("en-US");

  constructor(private t: Dictionary) {
    this.doc = new PDFDocument({ size: "A4", layout: "landscape", margin: M, bufferPages: true, info: { Title: "Clan Fund report", Creator: "Clan Fund" } });
    const f = fonts();
    for (const [name, data] of Object.entries(f)) this.doc.registerFont(name, data);
  }

  kip(n: number) {
    return `${n < 0 ? "−" : ""}${this.num.format(Math.abs(n))} ${this.t.reports.currency}`;
  }

  /** Splits text into Lao / non-Lao runs so each gets a font that has its glyphs. */
  private runs(text: string) {
    return text.split(/([຀-໿]+)/).filter(Boolean);
  }
  private face(run: string, bold: boolean) {
    const lao = /[຀-໿]/.test(run);
    return lao ? (bold ? "laoB" : "lao") : bold ? "latB" : "lat";
  }
  width(text: string, size: number, bold = false) {
    return this.runs(text).reduce((w, r) => w + this.doc.font(this.face(r, bold)).fontSize(size).widthOfString(r), 0);
  }

  /** Draws one line of mixed-script text with its baseline at y, shortened with … if it doesn't fit. */
  text(text: string, x: number, y: number, o: Opts = {}) {
    const size = o.size ?? 9;
    const bold = o.bold ?? false;
    let s = text;
    if (o.width) {
      while (s.length > 1 && this.width(s, size, bold) > o.width) s = s.slice(0, -2) + "…";
    }
    const w = this.width(s, size, bold);
    let cx = x;
    if (o.width && o.align === "right") cx = x + o.width - w;
    if (o.width && o.align === "center") cx = x + (o.width - w) / 2;
    for (const run of this.runs(s)) {
      this.doc
        .font(this.face(run, bold))
        .fontSize(size)
        .fillColor(o.color ?? INK)
        .text(run, cx, y, { lineBreak: false, baseline: "alphabetic" });
      cx += this.doc.widthOfString(run);
    }
  }

  ensure(h: number) {
    if (this.y + h > BOTTOM) {
      this.doc.addPage();
      this.y = M + 10;
      return true;
    }
    return false;
  }

  banner(title: string, subtitle: string, generated: string) {
    this.doc.rect(0, 0, PAGE_W, 96).fill(BRAND);
    this.text("Clan Fund", M, 34, { size: 10, color: "#c2d3f5" });
    this.text(title, M, 60, { size: 18, bold: true, color: "#ffffff", width: CONTENT_W });
    this.text(subtitle, M, 80, { size: 10, color: "#e6edfb", width: CONTENT_W });
    this.y = 118;
    this.text(generated, M, this.y, { size: 8, color: MUTED, width: CONTENT_W });
    this.y += 10;
  }

  section(title: string) {
    this.ensure(60);
    this.y += 22;
    this.text(title, M, this.y, { size: 12, bold: true, color: BRAND });
    this.y += 6;
    this.doc.moveTo(M, this.y).lineTo(M + CONTENT_W, this.y).lineWidth(0.8).strokeColor(BRAND).stroke();
    this.y += 4;
  }

  note(text: string, color = MUTED) {
    this.ensure(20);
    this.y += 14;
    this.text(text, M, this.y, { size: 9, color, width: CONTENT_W });
    this.y += 4;
  }

  /** Label/amount rows (the summary). */
  keyValues(rows: { label: string; value: number; bold?: boolean; wash?: boolean; indent?: boolean; heading?: boolean }[]) {
    for (const r of rows) {
      this.ensure(20);
      if (r.wash) this.doc.rect(M, this.y + 2, CONTENT_W, 18).fill(WASH);
      const base = this.y + 15;
      if (r.heading) {
        this.text(r.label, M + 6, base, { size: 9.5, bold: true, color: BRAND });
      } else {
        this.text(r.label, M + (r.indent ? 18 : 6), base, { size: 9.5, bold: r.bold, width: CONTENT_W * 0.6 });
        this.text(this.kip(r.value), M + CONTENT_W * 0.6, base, {
          size: 9.5,
          bold: r.bold,
          width: CONTENT_W * 0.4 - 6,
          align: "right",
          color: r.value < 0 ? RED : INK,
        });
      }
      this.y += 20;
    }
  }

  /** A table that breaks across pages and repeats its header. Cells are single-line. */
  table(cols: Col[], rows: (string | { text: string; color?: string; bold?: boolean })[][]) {
    const scale = CONTENT_W / cols.reduce((s, c) => s + c.width, 0);
    const widths = cols.map((c) => c.width * scale);
    const head = () => {
      this.doc.rect(M, this.y + 2, CONTENT_W, 20).fill(WASH);
      let x = M;
      cols.forEach((c, i) => {
        this.text(c.label, x + 5, this.y + 16, { size: 8, bold: true, color: BRAND, width: widths[i] - 10, align: c.align });
        x += widths[i];
      });
      this.y += 22;
    };
    this.ensure(44);
    head();
    rows.forEach((row) => {
      if (this.ensure(18)) head();
      let x = M;
      row.forEach((cell, i) => {
        const c = typeof cell === "string" ? { text: cell } : cell;
        this.text(c.text, x + 5, this.y + 12.5, { size: 8.5, width: widths[i] - 10, align: cols[i].align, color: c.color, bold: c.bold });
        x += widths[i];
      });
      this.y += 17;
      this.doc.moveTo(M, this.y).lineTo(M + CONTENT_W, this.y).lineWidth(0.4).strokeColor(LINE).stroke();
    });
  }

  /** Page numbers on every page, added once the page count is known. */
  footer(left: string) {
    const range = this.doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      this.doc.switchToPage(i);
      this.text(left, M, PAGE_H - 28, { size: 7.5, color: MUTED, width: CONTENT_W * 0.7 });
      this.text(fmt(this.t.reports.page, { n: i + 1, total: range.count }), M, PAGE_H - 28, {
        size: 7.5,
        color: MUTED,
        width: CONTENT_W,
        align: "right",
      });
    }
  }

  toBuffer(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on("data", (c: Buffer) => chunks.push(c));
      this.doc.on("end", () => resolve(Buffer.concat(chunks)));
      this.doc.on("error", reject);
      this.doc.end();
    });
  }
}

export async function clanPdf(r: ClanReport, t: Dictionary, locale: Locale, generatedBy: string) {
  const rt = t.reports;
  const p = new Report(t);
  const period = fmt(rt.period, { from: formatDate(r.from, locale), to: formatDate(r.to, locale) });
  const generated = fmt(rt.generated, { date: formatDate(new Date(), locale), name: generatedBy });
  p.banner(fmt(rt.reportTitle, { clan: `${r.clan.name} (${r.clan.code})` }), period, generated);

  const { income, expenses } = summaryRows(r, t);
  p.section(t.events.summary);
  p.keyValues([
    { label: rt.opening, value: r.openingBalance, bold: true, wash: true },
    { label: rt.income, value: 0, heading: true },
    ...income.map((i) => ({ label: i.label, value: i.amount, indent: true })),
    { label: rt.totalIncome, value: r.income, bold: true },
    { label: rt.expenses, value: 0, heading: true },
    ...expenses.map((e) => ({ label: e.label, value: e.amount, indent: true })),
    { label: rt.totalExpenses, value: r.expenses, bold: true },
    ...(r.corrections ? [{ label: rt.corrections, value: r.corrections }] : []),
    { label: rt.closing, value: r.closingBalance, bold: true, wash: true },
  ]);
  p.note(
    r.outstanding.total > 0 ? fmt(rt.outstandingBody, { amount: p.kip(r.outstanding.total), n: r.outstanding.members }) : rt.nothingOwed,
    r.outstanding.total > 0 ? RED : GREEN,
  );

  p.section(rt.events);
  if (r.events.length === 0) p.note(rt.noEvents);
  else
    p.table(
      [
        { label: rt.colEvent, width: 7 },
        { label: rt.colDeceased, width: 22 },
        { label: rt.colDate, width: 13 },
        { label: rt.colStatus, width: 14 },
        { label: rt.colPaid, width: 10, align: "right" },
        { label: rt.colCollected, width: 13, align: "right" },
        { label: rt.colFee, width: 10, align: "right" },
        { label: rt.colPayout, width: 13, align: "right" },
      ],
      r.events.map((e) => [
        `#${e.event_no}`,
        e.deceased_name,
        formatDate(e.date_of_death, locale),
        t.events.status[e.status],
        e.fund_mode === "B" ? `${e.bills_paid}/${e.bills_total}` : "—",
        p.kip(Number(e.collected)),
        p.kip(Number(e.fee)),
        p.kip(Number(e.payout)),
      ]),
    );

  if (r.contributions.length) {
    p.section(rt.contributions);
    p.table(
      [
        { label: rt.colPeriod, width: 20 },
        { label: rt.colMembers, width: 15, align: "right" },
        { label: rt.colPaidCount, width: 15, align: "right" },
        { label: rt.colCollected, width: 25, align: "right" },
        { label: t.events.raised, width: 25, align: "right" },
      ],
      r.contributions.map((c) => [c.label, c.members, c.paid, p.kip(Number(c.collected)), p.kip(Number(c.expected))]),
    );
  }

  p.section(rt.ledger);
  if (r.ledger.length === 0) p.note(rt.noEntries);
  else
    p.table(
      [
        { label: rt.colDateTime, width: 13 },
        { label: rt.colType, width: 15 },
        { label: rt.colDetail, width: 50 },
        { label: rt.colAmount, width: 18, align: "right" },
      ],
      r.ledger.map((l) => {
        const amount = Number(l.amount);
        return [
          formatDate(l.created_at, locale),
          t.fund.type[l.entry_type],
          ledgerDetail(l, t),
          { text: p.kip(amount), color: amount < 0 ? RED : GREEN, bold: true },
        ];
      }),
    );

  p.footer(`${r.clan.name} · ${period}`);
  return p.toBuffer();
}

export async function platformPdf(r: PlatformReport, t: Dictionary, locale: Locale, generatedBy: string) {
  const rt = t.reports;
  const p = new Report(t);
  const period = fmt(rt.period, { from: formatDate(r.from, locale), to: formatDate(r.to, locale) });
  p.banner(rt.adminReportTitle, period, fmt(rt.generated, { date: formatDate(new Date(), locale), name: generatedBy }));

  p.section(rt.clans);
  p.table(
    [
      { label: rt.colClan, width: 26 },
      { label: rt.colMode, width: 6 },
      { label: rt.colMembersNow, width: 9, align: "right" },
      { label: rt.colEvents, width: 8, align: "right" },
      { label: rt.colCollected, width: 14, align: "right" },
      { label: rt.colPayout, width: 14, align: "right" },
      { label: rt.colFeesOwed, width: 12, align: "right" },
      { label: rt.colFeesReceived, width: 12, align: "right" },
    ],
    [
      ...r.clans.map((c) => [
        `${c.name} (${c.code})`,
        c.fund_mode,
        c.members,
        c.events,
        p.kip(Number(c.collected)),
        p.kip(Number(c.paid_out)),
        p.kip(Number(c.fees_owed)),
        p.kip(Number(c.fees_received)),
      ]),
      [
        { text: rt.totals, bold: true },
        "",
        { text: String(r.totals.members), bold: true },
        { text: String(r.totals.events), bold: true },
        { text: p.kip(r.totals.collected), bold: true },
        { text: p.kip(r.totals.paidOut), bold: true },
        { text: p.kip(r.totals.feesOwed), bold: true },
        { text: p.kip(r.totals.feesReceived), bold: true },
      ],
    ],
  );

  p.section(rt.feesByMonth);
  if (r.months.length === 0) p.note(t.admin.noFees);
  else
    p.table(
      [
        { label: rt.colMonth, width: 25 },
        { label: rt.colEvents, width: 15, align: "right" },
        { label: rt.colFeesTotal, width: 30, align: "right" },
        { label: rt.colFeesReceived, width: 30, align: "right" },
      ],
      r.months.map((m) => [m.month, m.events, p.kip(Number(m.fees)), p.kip(Number(m.received))]),
    );

  p.footer(`${rt.adminReportTitle} · ${period}`);
  return p.toBuffer();
}
