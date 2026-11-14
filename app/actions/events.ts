"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { audit, feeFor, isPastDate, lockClan, settleCarried, UUID_RE } from "@/lib/funds";
import { clanMemberIds, notifyMany } from "@/lib/notify";
import { formatKip } from "@/lib/format";
import { isStaffRole, STAFF_ROLES } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";
import type { FormState } from "@/lib/definitions";

class Refused extends Error {}

async function eventOperator(formData: FormData) {
  const user = await requireRole("clan_admin", ...STAFF_ROLES);
  const clanId = user.role === "clan_admin" ? user.clanId ?? "" : String(formData.get("clanId") ?? "");
  if (!UUID_RE.test(clanId)) return null;
  return { user, clanId };
}

function refreshEventRoutes() {
  revalidatePath("/clan", "layout");
  revalidatePath("/member", "layout");
  revalidatePath("/admin/events", "layout");
  revalidatePath("/admin");
}

/**
 * Reports a death. Copies the clan's current rate, mode and platform fee into the event
 * (locked by a trigger). Mode B bills every active member account at once; Mode A goes
 * straight to payout from the central fund.
 */
export async function reportDeath(_state: FormState, formData: FormData): Promise<FormState> {
  const reporter = await requireRole("clan_admin", "member", ...STAFF_ROLES);
  const t = (await getT()).events;
  const clanId =
    reporter.role === "clan_admin" || reporter.role === "member"
      ? reporter.clanId ?? ""
      : String(formData.get("clanId") ?? "");
  if (!UUID_RE.test(clanId)) return { message: t.errState };

  const who = String(formData.get("who") ?? "");
  const dateOfDeath = String(formData.get("dateOfDeath") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  const values = { who, dateOfDeath, note: note ?? "" };

  const [kind, personId] = who.split(":");
  const memberId = reporter.role === "member" ? reporter.id : null;
  const errors: Record<string, string[]> = {};
  if (!["m", "d"].includes(kind) || !UUID_RE.test(personId ?? "")) errors.who = [t.errWho];
  if (!isPastDate(dateOfDeath)) errors.dateOfDeath = [t.errDate];
  if (Object.keys(errors).length) return { errors, values };

  let eventId: string;
  try {
    eventId = await transaction(async (db) => {
      await lockClan(db, clanId);

      // Resolve the deceased strictly inside this clan.
      const person =
        kind === "m"
          ? (
              await db.query<{ name: string; family_id: string; relationship: null }>(
                `SELECT full_name AS name, id AS family_id, NULL AS relationship FROM users
                  WHERE id = $1 AND clan_id = $2 AND role = 'member' AND status = 'active' AND deceased_at IS NULL
                    AND ($3::uuid IS NULL OR id = $3)`,
                [personId, clanId, memberId],
              )
            ).rows[0]
          : (
              await db.query<{ name: string; family_id: string; relationship: string }>(
                `SELECT d.full_name AS name, d.member_id AS family_id, d.relationship FROM dependents d
                   JOIN users u ON u.id = d.member_id
                  WHERE d.id = $1 AND u.clan_id = $2 AND u.role = 'member' AND d.is_active AND d.deceased_at IS NULL AND u.status = 'active'
                    AND ($3::uuid IS NULL OR d.member_id = $3)`,
                [personId, clanId, memberId],
              )
            ).rows[0];
      if (!person) throw new Refused(memberId ? t.errWho : t.errAlready);

      const clan = (
        await db.query<{ fund_mode: "A" | "B"; contribution_amount: string; rate_version: number }>(
          `SELECT fund_mode, contribution_amount, rate_version FROM clans WHERE id = $1 AND is_active`,
          [clanId],
        )
      ).rows[0];
      if (!clan) throw new Refused(t.errState);
      const fee = (await db.query<{ p: string }>(`SELECT platform_fee_percent AS p FROM platform_settings WHERE id = 1`)).rows[0].p;
      const nextNo = (
        await db.query<{ n: number }>(`SELECT COALESCE(MAX(event_no), 0) + 1 AS n FROM death_events WHERE clan_id = $1`, [clanId])
      ).rows[0].n;

      const event = await db.query<{ id: string }>(
        `INSERT INTO death_events
           (clan_id, event_no, deceased_member_id, deceased_dependent_id, family_member_id, deceased_name,
            deceased_relationship, date_of_death, note, fund_mode, rate_version, rate_amount, platform_fee_percent,
            status, reported_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          clanId, nextNo, kind === "m" ? personId : null, kind === "d" ? personId : null, person.family_id,
          person.name, person.relationship, dateOfDeath, note, clan.fund_mode, clan.rate_version,
          clan.contribution_amount, fee, clan.fund_mode === "B" ? "collecting" : "awaiting_payout", reporter.id,
        ],
      );
      const id = event.rows[0].id;

      if (kind === "m") {
        await db.query(`UPDATE users SET deceased_at = $2 WHERE id = $1`, [personId, dateOfDeath]);
      } else {
        await db.query(`UPDATE dependents SET deceased_at = $2 WHERE id = $1`, [personId, dateOfDeath]);
      }

      if (clan.fund_mode === "B") {
        // One bill per living, active account in the clan, showing any debt carried from earlier
        // events. The clan leader's household pays too, like every member's.
        await db.query(
          `INSERT INTO event_bills (clan_id, event_id, member_id, amount, carried_in)
           SELECT $1, $2, u.id, $3,
                  COALESCE((SELECT SUM(b.amount) FROM event_bills b WHERE b.member_id = u.id AND b.status = 'carried'), 0)
             FROM users u
            WHERE u.clan_id = $1 AND u.role IN ('member', 'clan_admin') AND u.status = 'active' AND u.deceased_at IS NULL`,
          [clanId, id, clan.contribution_amount],
        );
      }

      await audit(db, clanId, reporter.id, "event.reported", id, { event_no: nextNo, mode: clan.fund_mode });
      // Mode B bills everyone at once, so tell every member what they owe.
      if (clan.fund_mode === "B") {
        await notifyMany(db, await clanMemberIds(db, clanId), "event_new", {
          name: person.name,
          amount: formatKip(clan.contribution_amount),
        }, `/member/events/${id}`);
      }
      return id;
    });
  } catch (err) {
    if (err instanceof Refused) {
      return err.message === t.errState ? { message: err.message, values } : { errors: { who: [err.message] }, values };
    }
    // The unique index stops a person being reported twice even under a race.
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "23505") {
      return { errors: { who: [t.errAlready] }, values };
    }
    throw err;
  }

  refreshEventRoutes();
  const base = reporter.role === "member" ? "/member" : isStaffRole(reporter.role) ? "/admin" : "/clan";
  redirect(`${base}/events/${eventId}`);
}

/** Leader records that a member paid this event's bill (cash or transfer), optionally with their earlier debt. */
export async function recordBillPayment(_state: FormState, formData: FormData): Promise<FormState> {
  const scope = await eventOperator(formData);
  const t = (await getT()).events;
  if (!scope) return { message: t.errState };
  const { user: leader, clanId } = scope;
  const billId = String(formData.get("billId") ?? "");
  const method = formData.get("method") === "transfer" ? "transfer" : "cash";
  const includeDebt = formData.get("includeDebt") === "on";
  if (!UUID_RE.test(billId)) return { message: t.errState };

  const ok = await transaction(async (db) => {
    await lockClan(db, clanId);
    const bill = (
      await db.query<{ id: string; member_id: string; amount: string; event_id: string }>(
        `UPDATE event_bills b SET status = 'paid', paid_at = now(), paid_method = $3, recorded_by = $4
           FROM death_events e
          WHERE b.id = $1 AND b.clan_id = $2 AND b.status = 'unpaid'
            AND e.id = b.event_id AND e.clan_id = $2 AND e.status = 'collecting'
          RETURNING b.id, b.member_id, b.amount, b.event_id`,
        [billId, clanId, method, leader.id],
      )
    ).rows[0];
    if (!bill) return false;

    await db.query(
      `INSERT INTO fund_ledger (clan_id, entry_type, amount, event_id, bill_id, note, created_by)
       VALUES ($1, 'collection', $2, $3, $4, $5, $6)`,
      [clanId, bill.amount, bill.event_id, bill.id, method, leader.id],
    );
    if (includeDebt) await settleCarried(db, clanId, leader.id, bill.member_id, method);
    await audit(db, clanId, leader.id, "bill.paid", bill.id, { method, includeDebt });
    return true;
  });

  if (!ok) return { message: t.errState };
  refreshEventRoutes();
  return { success: "ok" };
}

/** Reverses a payment recorded by mistake, while the collection is still open. */
export async function undoBillPayment(_state: FormState, formData: FormData): Promise<FormState> {
  const scope = await eventOperator(formData);
  const t = (await getT()).events;
  if (!scope) return { message: t.errState };
  const { user: leader, clanId } = scope;
  const billId = String(formData.get("billId") ?? "");
  if (!UUID_RE.test(billId)) return { message: t.errState };

  const ok = await transaction(async (db) => {
    await lockClan(db, clanId);
    const bill = (
      await db.query<{ id: string; amount: string; event_id: string }>(
        `UPDATE event_bills b SET status = 'unpaid', paid_at = NULL, paid_method = NULL, recorded_by = $3
           FROM death_events e
          WHERE b.id = $1 AND b.clan_id = $2 AND b.status = 'paid'
            AND e.id = b.event_id AND e.clan_id = $2 AND e.status = 'collecting'
            AND NOT EXISTS (SELECT 1 FROM payment_slips s WHERE s.bill_id = b.id AND s.status = 'approved')
          RETURNING b.id, b.amount, b.event_id`,
        [billId, clanId, leader.id],
      )
    ).rows[0];
    if (!bill) return false;
    // The ledger is append-only, so the correction is a negative entry.
    await db.query(
      `INSERT INTO fund_ledger (clan_id, entry_type, amount, event_id, bill_id, note, created_by)
       VALUES ($1, 'adjustment', $2, $3, $4, 'undo payment', $5)`,
      [clanId, -Number(bill.amount), bill.event_id, bill.id, leader.id],
    );
    await audit(db, clanId, leader.id, "bill.payment_undone", bill.id);
    return true;
  });

  if (!ok) return { message: t.errState };
  refreshEventRoutes();
  return { success: "ok" };
}

/**
 * Ends a Mode B collection: unpaid bills become carried debt, and the platform fee on the
 * amount collected is recorded as owed and taken out of the fund.
 */
export async function closeCollection(_state: FormState, formData: FormData): Promise<FormState> {
  const scope = await eventOperator(formData);
  const t = (await getT()).events;
  if (!scope) return { message: t.errState };
  const { user: leader, clanId } = scope;
  const eventId = String(formData.get("eventId") ?? "");
  if (!UUID_RE.test(eventId)) return { message: t.errState };

  const ok = await transaction(async (db) => {
    await lockClan(db, clanId);
    const event = (
      await db.query<{ id: string; platform_fee_percent: string }>(
        `SELECT id, platform_fee_percent FROM death_events
          WHERE id = $1 AND clan_id = $2 AND status = 'collecting' FOR UPDATE`,
        [eventId, clanId],
      )
    ).rows[0];
    if (!event) return false;

    await db.query(`UPDATE event_bills SET status = 'carried' WHERE event_id = $1 AND clan_id = $2 AND status = 'unpaid'`, [eventId, clanId]);
    const gross = Number(
      (
        await db.query<{ s: string }>(
          `SELECT COALESCE(SUM(amount), 0) AS s FROM event_bills WHERE event_id = $1 AND clan_id = $2 AND status = 'paid'`,
          [eventId, clanId],
        )
      )
        .rows[0].s,
    );
    const fee = feeFor(gross, event.platform_fee_percent);

    await db.query(
      `UPDATE death_events SET status = 'awaiting_payout', gross_collected = $2, fee_amount = $3, closed_by = $4, closed_at = now()
        WHERE id = $1 AND clan_id = $5`,
      [eventId, gross, fee, leader.id, clanId],
    );
    await db.query(
      `INSERT INTO platform_fees (clan_id, event_id, percent, base_amount, fee_amount) VALUES ($1, $2, $3, $4, $5)`,
      [clanId, eventId, event.platform_fee_percent, gross, fee],
    );
    if (fee > 0) {
      await db.query(
        `INSERT INTO fund_ledger (clan_id, entry_type, amount, event_id, note, created_by)
         VALUES ($1, 'platform_fee', $2, $3, $4, $5)`,
        [clanId, -fee, eventId, `${event.platform_fee_percent}%`, leader.id],
      );
    }
    // Whoever did not pay now carries a debt: tell them.
    const carried = await db.query<{ member_id: string; amount: string }>(
      `SELECT b.member_id, b.amount FROM event_bills b WHERE b.event_id = $1 AND b.clan_id = $2 AND b.status = 'carried'`,
      [eventId, clanId],
    );
    const name = (await db.query<{ deceased_name: string }>(`SELECT deceased_name FROM death_events WHERE id = $1 AND clan_id = $2`, [eventId, clanId])).rows[0]
      .deceased_name;
    for (const row of carried.rows) {
      await notifyMany(db, [row.member_id], "event_debt", { name, amount: formatKip(row.amount) }, "/member/payments");
    }
    await audit(db, clanId, leader.id, "event.collection_closed", eventId, { gross, fee });
    return true;
  });

  if (!ok) return { message: t.errState };
  refreshEventRoutes();
  return { success: "ok" };
}

/** Cancels an event reported by mistake — only while no money has moved for it. */
export async function cancelEvent(_state: FormState, formData: FormData): Promise<FormState> {
  const scope = await eventOperator(formData);
  const t = (await getT()).events;
  if (!scope) return { message: t.errState };
  const { user: leader, clanId } = scope;
  const eventId = String(formData.get("eventId") ?? "");
  if (!UUID_RE.test(eventId)) return { message: t.errState };

  const ok = await transaction(async (db) => {
    await lockClan(db, clanId);
    const event = (
      await db.query<{ deceased_member_id: string | null; deceased_dependent_id: string | null }>(
        `SELECT e.deceased_member_id, e.deceased_dependent_id FROM death_events e
          WHERE e.id = $1 AND e.clan_id = $2 AND e.status IN ('collecting', 'awaiting_payout')
            AND e.closed_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM fund_ledger l WHERE l.event_id = e.id)
            AND NOT EXISTS (SELECT 1 FROM payouts p WHERE p.event_id = e.id AND p.status <> 'rejected')
          FOR UPDATE`,
        [eventId, clanId],
      )
    ).rows[0];
    if (!event) return false;

    await db.query(`UPDATE event_bills SET status = 'void' WHERE event_id = $1 AND clan_id = $2`, [eventId, clanId]);
    // Slips still waiting for this event's bills can no longer apply.
    await db.query(
      `UPDATE payment_slips SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), review_note = 'event cancelled'
        WHERE clan_id = $3 AND status = 'pending' AND bill_id IN (SELECT id FROM event_bills WHERE event_id = $1 AND clan_id = $3)`,
      [eventId, leader.id, clanId],
    );
    await db.query(`UPDATE death_events SET status = 'cancelled', cancelled_by = $2, cancelled_at = now() WHERE id = $1 AND clan_id = $3`, [
      eventId,
      leader.id,
      clanId,
    ]);
    if (event.deceased_member_id) await db.query(`UPDATE users SET deceased_at = NULL WHERE id = $1`, [event.deceased_member_id]);
    if (event.deceased_dependent_id)
      await db.query(`UPDATE dependents SET deceased_at = NULL WHERE id = $1`, [event.deceased_dependent_id]);
    await audit(db, clanId, leader.id, "event.cancelled", eventId);
    return true;
  });

  if (!ok) return { message: t.errState };
  refreshEventRoutes();
  return { success: "ok" };
}
