# Rotating Savings Groups — Design

Date: 2026-10-15
Status: approved in chat, awaiting spec review

## Purpose

Let anyone signed in run a rotating savings group (ROSCA): N people each pay a fixed amount every
period, and each period one of them receives the whole pot. After N rounds everyone has paid
N × amount and received N × amount once.

Example: 10 people × 100,000 ₭ monthly → each month one person receives 1,000,000 ₭; after 10
months every member has received exactly once.

The platform records who paid whom and takes a fee from each receiver. Money never passes through
the platform: members transfer directly to the round's receiver, as with donations.

## Decisions (from the brainstorm)

| Topic | Decision |
|---|---|
| Who can use it | Every signed-in role that can donate (`DONOR_ROLES`: `member`, `clan_admin`, `user`). Not the super admin. |
| Joining | Organizer creates a group and shares an invite code/link. People request to join; organizer approves. Members may come from different clans or none. |
| Turn order | Organizer arranges it while forming (with a "shuffle" button for a random draw). Locked once the group starts. |
| Money flow | Each member transfers straight to the current round's receiver and uploads a slip. The receiver confirms or rejects each slip. |
| One turn each | Organizer is also a member and takes a turn. Rounds = number of members. |
| Fee | The receiver owes `pot × savings_fee_percent`. A separate platform setting (default 1.00%). Recorded as `owed` when a round completes; the super admin marks it `received`. |
| Out of scope | Bidding/auctions, editing an active group, leaving mid-cycle, the app holding money, automatic penalties. |

## Lifecycle

### Group
`forming` → `active` → `completed` (or `forming` → `cancelled`).

- **forming**: organizer edits settings, approves/declines join requests, removes members, arranges
  the order. Needs at least 2 approved members to start.
- **active**: settings and order locked. Started by the organizer; round 1 opens (`collecting`)
  immediately. `start_date` (today or later) is only round 1's due date — there is no scheduler.
- **completed**: set automatically when the last round completes.
- **cancelled**: only allowed while forming.

### Round
`upcoming` → `collecting` → `done`.

- Exactly one round is `collecting` at a time while the group is active.
- Each round has `due_date = start_date + (round_no − 1) × period` (weekly = 7 days, monthly = 1 calendar month).
- When the group starts, all rounds are created (`upcoming`) along with one `savings_payments` row
  per (round, payer) for every member except that round's receiver, all `unpaid`. Round 1 becomes
  `collecting`.
- A round becomes `done` when every payment in it is `confirmed`. In the same transaction:
  the fee row is written, and the next round (if any) becomes `collecting`; otherwise the group
  becomes `completed`.
- Rounds open strictly in order, not by date: round k+1 opens when round k is done, even if early or
  late. The due date is informational (shown, used to flag "late").

### Payment
`unpaid` → `pending` (slip uploaded) → `confirmed`, or `pending` → `rejected` → (re-upload) `pending`.

- The payer uploads a slip (image/PDF, existing upload rules) with transfer date.
- The receiver confirms or rejects (with optional note).
- The receiver may also mark an `unpaid`/`rejected` payment as confirmed with no slip
  ("received in cash"); `slip_file_id` stays null and `confirmed_without_slip = true`.
- The organizer can send a reminder to all `unpaid`/`rejected` payers of the collecting round
  (one notification each, at most once per round per day).

## Data model (additive, re-runnable, appended to `db/schema.sql`)

```sql
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS savings_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 1.00
  CHECK (savings_fee_percent >= 0 AND savings_fee_percent <= 100);

-- enums: savings_group_status ('forming','active','completed','cancelled'),
--        savings_period ('weekly','monthly'),
--        savings_member_status ('pending','approved','declined','removed'),
--        savings_round_status ('upcoming','collecting','done'),
--        savings_payment_status ('unpaid','pending','confirmed','rejected')

savings_groups (
  id UUID PK, organizer_id UUID → users, name VARCHAR(100), description TEXT NULL,
  amount BIGINT > 0,               -- per person per round, in kip
  period savings_period, start_date DATE,
  invite_code VARCHAR(8) UNIQUE,   -- uppercase, no ambiguous chars
  fee_percent NUMERIC(5,2) NULL,   -- copied from platform_settings when the group starts
  status savings_group_status DEFAULT 'forming',
  created_at, started_at, completed_at
)

savings_members (
  id UUID PK, group_id → savings_groups, user_id → users, UNIQUE (group_id, user_id),
  status savings_member_status DEFAULT 'pending',
  turn_no INT NULL,                -- 1..N, set while forming, UNIQUE (group_id, turn_no)
  bank_name, account_name, account_number NULL, qr_file_id → files NULL,  -- where to send *this* member's pot
  joined_at, decided_at
)

savings_rounds (
  id UUID PK, group_id, round_no INT, UNIQUE (group_id, round_no),
  receiver_member_id → savings_members, due_date DATE,
  status savings_round_status DEFAULT 'upcoming', opened_at, done_at,
  last_reminder_at TIMESTAMPTZ NULL
)

savings_payments (
  id UUID PK, round_id → savings_rounds, payer_member_id → savings_members,
  UNIQUE (round_id, payer_member_id),
  amount BIGINT > 0,               -- copied from the group; locked by trigger
  status savings_payment_status DEFAULT 'unpaid',
  slip_file_id → files NULL, transfer_date DATE NULL, confirmed_without_slip BOOLEAN DEFAULT FALSE,
  review_note TEXT NULL, submitted_at, reviewed_at
)

savings_fees (
  id UUID PK, round_id UNIQUE → savings_rounds, payer_user_id → users (the receiver),
  percent NUMERIC(5,2), base_amount BIGINT, fee_amount BIGINT >= 0,
  status fee_status DEFAULT 'owed', created_at, received_at, received_by → users
)
```

- Trigger (like `lock_donation_amount`): `savings_payments.amount`, `round_id` and `payer_member_id`
  cannot change after insert.
- The pot of a round = `amount × (approved members − 1)` (the receiver doesn't pay themself).
  Fee base = that pot.
- Files use the existing `files` table with `clan_id = NULL` and purposes `savings_slip` and
  `savings_qr`.

## File access (`app/files/[id]/route.ts`)

- `savings_qr`: any approved member of a group in which that member's row uses this file.
- `savings_slip`: the uploader, and the receiver of the round the payment belongs to. The organizer
  sees payment *status*, not slips.

Both checks go above the existing "upload with no clan" fallback.

## Code layout (mirrors donations)

- `lib/savings.ts` — read queries: my groups, group detail (members, order, rounds, current round
  with payments), join lookup by code, pot/fee helpers. Each read checks the viewer is the organizer
  or an approved member (pending members see only the group name and their own request).
- `app/actions/savings.ts` — server actions, each in a transaction where it touches several rows:
  `createGroup`, `updateGroup` (forming only), `cancelGroup`, `requestToJoin` (by code; includes
  the joiner's receiving details), `decideMember`, `removeMember`, `saveOrder` / `shuffleOrder`,
  `startGroup`, `uploadSlip`, `reviewPayment` (confirm / reject / confirm without slip),
  `remindUnpaid`, `updateMyReceivingDetails` (allowed until that member's round opens).
  Super admin: `setSavingsFeePercent`, `markSavingsFeeReceived` (in `app/actions/admin.ts`).
  Authorization in every action: `requireRole(...DONOR_ROLES)` plus an organizer/member/receiver
  check against the database row, not the form.
- Pages under `app/savings/`:
  - `page.tsx` — my groups (as organizer / as member / pending requests) + "Create" and "Join with code".
  - `new/page.tsx` — create form (name, description, amount, period, start date, my receiving details).
  - `join/page.tsx` — enter a code (also reached via `/savings/join?code=XXXX` share link).
  - `[id]/page.tsx` — group detail. Forming: settings, invite code + copy link, join requests,
    order arranger with shuffle, Start button. Active: current round card (receiver, pot, due
    date, where to pay, my payment status + upload), the receiver's review list, organizer's
    paid/unpaid list + Remind, full schedule of rounds. Completed: summary.
- `lib/navigation.ts` — a new area for every non-super-admin role, placed after donations:
  `{ href: "/savings", label: t.nav.areaSavings, note: t.nav.areaSavingsNote, icon: "savings" }`.
  A new `savings` icon in `components/icons.tsx`.
- Admin: savings fee % field in the existing platform settings form; owed/received savings fees on
  the admin overview beside funeral fees, with "Mark received".
- `lib/notify.ts` — new notification types (texts in all three dictionaries):
  `savings_join_request` (→ organizer), `savings_join_approved` / `savings_join_declined` (→ joiner),
  `savings_started` (→ all), `savings_round_open` (→ payers and receiver), `savings_slip_uploaded`
  (→ receiver), `savings_slip_confirmed` / `savings_slip_rejected` (→ payer), `savings_reminder`
  (→ payer), `savings_round_done` (→ receiver, with fee owed), `savings_completed` (→ all).

## i18n

A new `savings` section plus `nav.areaSavings` / `nav.areaSavingsNote` in `en.json`, `la.json`, `hm.json`.
Working names (to confirm with the user during review):
- English: "Savings group"
- Lao: "ກຸ່ມອອມເງິນ"
- Hmong: "Pab pawg txuag nyiaj"

## Error handling

- All form errors go back through the existing `FormState` pattern, localized.
- State-changing actions re-check status inside the transaction (`SELECT … FOR UPDATE` on the group
  or round) so double clicks or two people acting at once can't confirm twice, start twice, or
  complete a round twice.
- Joining: an unknown code, a group that is not forming, or someone already in the group each show a
  plain message.
- Starting needs ≥ 2 approved members, every approved member with a turn number, numbers 1..N with
  no gaps, and every member with receiving details (account or QR).
- If a member's account is disabled mid-cycle, their rows stay; the organizer sees it. (No automatic handling.)

## Testing

The repo has no automated test setup. Verification is manual in `next dev` with three accounts
(a general user, a member, a clan leader):
1. Create a group, join with the code from the other two, approve, shuffle, start.
2. Round 1: both payers upload slips; the receiver rejects one, it is re-uploaded, confirmed; the
   round completes, the fee appears on admin as owed, and round 2 opens.
3. Use "received in cash" for one payment in round 2.
4. Finish round 3 → the group is completed; mark the fees received in admin.
5. Check file access: a non-member gets 404 on a slip/QR URL.
6. Switch through all three languages on every new page.
Plus `npm run lint` and `npm run build` clean.

## Changes after the first build (2026-10-15, requested by the user)

- **Order stays locked after start** (tried reordering upcoming rounds, then removed at the user's request).
- **Terms locked once people join:** amount and period cannot change after anyone besides the
  organizer is approved (name, notes and start date still can).
- **Invite code:** every approved member sees it (group card and group page) while forming;
  hidden once the group starts.
- **Join requests:** "View details" shows the applicant's phone, clan, request date, bank,
  account name/number and QR to the organizer.
- **List page:** each group card shows the full receiving order with dates and status.
- **Person-to-person turn swaps:** after the start, a member may ask another member to trade turns
  (`savings_swaps`). Both must not have received any money yet: their round is `upcoming`, or
  `collecting` with every payment still `unpaid`. The other member's acceptance swaps the two
  rounds at once (payments rebuilt, turn numbers swapped, other open requests of either person
  cancelled); the whole group is notified, and if the round being collected changed hands its
  payers are told the new receiver. One open request per person; the asker may cancel it.
  The asker can add a short message (optional, 300 characters), shown to the other member and included in their notification.
