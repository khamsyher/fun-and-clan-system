import "server-only";
import ExcelJS from "exceljs";
import { fmt, type Dictionary, type Locale } from "../i18n/config";
import { formatDate } from "../format";
import { ledgerDetail, summaryRows } from "../report-text";
import type { ClanReport, PlatformReport } from "../reports";

const BRAND = "FF12357A";
const WASH = "FFE6EDFB";
const KIP = '#,##0 "₭";[Red]-#,##0 "₭"';

function header(ws: ExcelJS.Worksheet, labels: string[], widths: number[]) {
  ws.columns = widths.map((width) => ({ width }));
  const row = ws.addRow(labels);
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    c.alignment = { vertical: "middle" };
  });
  row.height = 22;
  ws.views = [{ state: "frozen", ySplit: row.number }];
}

function titleBlock(ws: ExcelJS.Worksheet, title: string, subtitle: string) {
  ws.addRow([title]).font = { bold: true, size: 16, color: { argb: BRAND } };
  ws.addRow([subtitle]).font = { color: { argb: "FF5B6680" } };
  ws.addRow([]);
}

function money(row: ExcelJS.Row, ...cols: number[]) {
  for (const c of cols) row.getCell(c).numFmt = KIP;
}

export async function clanWorkbook(r: ClanReport, t: Dictionary, locale: Locale, generatedBy: string) {
  const rt = t.reports;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Clan Fund";
  wb.created = new Date();
  const period = fmt(rt.period, { from: formatDate(r.from, locale), to: formatDate(r.to, locale) });
  const subtitle = `${period} · ${fmt(rt.generated, { date: formatDate(new Date(), locale), name: generatedBy })}`;

  // Summary
  const s = wb.addWorksheet(rt.sheetSummary);
  s.columns = [{ width: 36 }, { width: 20 }];
  titleBlock(s, fmt(rt.reportTitle, { clan: `${r.clan.name} (${r.clan.code})` }), subtitle);
  const { income, expenses } = summaryRows(r, t);
  const line = (label: string, amount: number, opts: { bold?: boolean; wash?: boolean } = {}) => {
    const row = s.addRow([label, amount]);
    money(row, 2);
    if (opts.bold) row.font = { bold: true };
    if (opts.wash) row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WASH } }));
  };
  line(rt.opening, r.openingBalance, { bold: true, wash: true });
  s.addRow([rt.income]).font = { bold: true, color: { argb: BRAND } };
  income.forEach((i) => line(`   ${i.label}`, i.amount));
  line(rt.totalIncome, r.income, { bold: true });
  s.addRow([rt.expenses]).font = { bold: true, color: { argb: BRAND } };
  expenses.forEach((e) => line(`   ${e.label}`, e.amount));
  line(rt.totalExpenses, r.expenses, { bold: true });
  if (r.corrections) line(rt.corrections, r.corrections);
  line(rt.closing, r.closingBalance, { bold: true, wash: true });
  s.addRow([]);
  const owed = s.addRow([rt.outstanding, r.outstanding.total]);
  money(owed, 2);

  // Events
  const e = wb.addWorksheet(rt.sheetEvents);
  header(e, [rt.colEvent, rt.colDeceased, rt.colDate, rt.colStatus, rt.colPaid, rt.colCollected, rt.colFee, rt.colPayout], [10, 28, 16, 18, 16, 16, 16, 18]);
  for (const ev of r.events) {
    const row = e.addRow([
      ev.event_no,
      ev.deceased_name,
      formatDate(ev.date_of_death, locale),
      t.events.status[ev.status],
      ev.fund_mode === "B" ? `${ev.bills_paid} / ${ev.bills_total}` : "—",
      Number(ev.collected),
      Number(ev.fee),
      Number(ev.payout),
    ]);
    money(row, 6, 7, 8);
  }

  // Contributions (Mode A)
  if (r.contributions.length) {
    const c = wb.addWorksheet(rt.sheetContributions);
    header(c, [rt.colPeriod, rt.colMembers, rt.colPaidCount, rt.colCollected, t.events.raised], [14, 12, 12, 18, 18]);
    for (const p of r.contributions) money(c.addRow([p.label, Number(p.members), Number(p.paid), Number(p.collected), Number(p.expected)]), 4, 5);
  }

  // Ledger
  const l = wb.addWorksheet(rt.sheetLedger);
  header(l, [rt.colDateTime, rt.colType, rt.colDetail, rt.colBy, rt.colAmount], [18, 18, 48, 22, 18]);
  for (const x of r.ledger) {
    const row = l.addRow([new Date(x.created_at), t.fund.type[x.entry_type], ledgerDetail(x, t), x.created_by_name ?? "", Number(x.amount)]);
    row.getCell(1).numFmt = "dd/mm/yyyy hh:mm";
    money(row, 5);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function platformWorkbook(r: PlatformReport, t: Dictionary, locale: Locale, generatedBy: string) {
  const rt = t.reports;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Clan Fund";
  wb.created = new Date();
  const period = fmt(rt.period, { from: formatDate(r.from, locale), to: formatDate(r.to, locale) });

  const c = wb.addWorksheet(rt.sheetClans);
  titleBlock(c, rt.adminReportTitle, `${period} · ${fmt(rt.generated, { date: formatDate(new Date(), locale), name: generatedBy })}`);
  header(
    c,
    [rt.colClan, rt.colMode, rt.colMembersNow, rt.colEvents, rt.colCollected, rt.colPayout, rt.colFeesOwed, rt.colFeesReceived],
    [30, 8, 12, 10, 18, 18, 16, 16],
  );
  for (const x of r.clans) {
    const row = c.addRow([`${x.name} (${x.code})`, x.fund_mode, Number(x.members), Number(x.events), Number(x.collected), Number(x.paid_out), Number(x.fees_owed), Number(x.fees_received)]);
    money(row, 5, 6, 7, 8);
  }
  const total = c.addRow([rt.totals, "", r.totals.members, r.totals.events, r.totals.collected, r.totals.paidOut, r.totals.feesOwed, r.totals.feesReceived]);
  total.font = { bold: true };
  money(total, 5, 6, 7, 8);

  const f = wb.addWorksheet(rt.sheetFees);
  header(f, [rt.colMonth, rt.colEvents, rt.colFeesTotal, rt.colFeesReceived], [12, 10, 16, 16]);
  for (const m of r.months) money(f.addRow([m.month, Number(m.events), Number(m.fees), Number(m.received)]), 3, 4);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
