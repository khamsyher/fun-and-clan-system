# Rotating Savings Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every signed-in non-admin user organize or join a rotating savings group: members pay the current round's receiver directly, the receiver confirms slips, rounds advance automatically, and the receiver owes the platform a fee per pot.

**Architecture:** Five new PostgreSQL tables appended to `db/schema.sql`. Pure rules (invite codes, order checks, dates) go in `lib/savings-rules.ts` and are unit tested with Node's test runner through `tsx`. Reads go in `lib/savings.ts` and server actions in `app/actions/savings.ts`, mirroring the donations feature. Pages live under `app/savings/`, the feature gets a new area in `lib/navigation.ts`, and fee handling is added to the existing admin page.

**Tech Stack:** Next.js 16.3 App Router (server components + server actions + `useActionState`), React 19.2, Tailwind v4, PostgreSQL via `pg` (no ORM), `tsx` 4 / Node 24 `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-15-rotating-savings-groups-design.md`

## Global Constraints

- Roles: every action and page uses `requireRole(...DONOR_ROLES)` (`member`, `clan_admin`, `user`). The super admin never sees savings pages, only the fee admin.
- Money is whole kip (`BIGINT`), parsed with `parseKip` from `lib/funds.ts`, and displayed with `formatKip`.
- Pot = `amount × (approved members − 1)`. The receiver never pays themself.
- Platform fee = `feeFor(pot, group.fee_percent)`. `fee_percent` is copied from `platform_settings.savings_fee_percent` (default `1.00`) when the group starts.
- Rounds open strictly in order. Round 1 opens when the organizer presses Start, and round k+1 opens when every payment of round k is `confirmed`. There is no scheduler.
- All user-facing text lives in `lib/i18n/en.json`, `la.json` and `hm.json`. `la.json` and `hm.json` are typed as `typeof en`, so a missing key fails the build.
- Savings files are stored with `clan_id = NULL` and purpose `savings_slip` or `savings_qr`.
- Audit rows for savings use `clan_id = NULL`.
- Schema changes are additive and re-runnable (`IF NOT EXISTS`, `DO $$ … duplicate_object`).
- Read `node_modules/next/dist/docs/` for anything you write that has no existing pattern in this repo (AGENTS.md). Every pattern in this plan is copied from existing files: `app/donations/**` and `app/actions/donations.ts`.
- Small refinements of the spec, made while planning:
  - Instead of a separate `savings_started` notice, starting a group sends round 1's `savings_round_open` to the payers and a new `savings_your_turn` to the receiver.
  - A new `savings_cancelled` notice tells members when a forming group is cancelled.
  - Every approved member sees who has paid in the current round. Only the receiver can open slips.
- Commits: stage only the files the task names. `lib/i18n/*.json`, `lib/navigation.ts` and others already carry the user's own uncommitted edits. Do not commit until the user has decided what to do with those (see the handoff note).

## Review Focus

1. **Two confirms at once.** The receiver confirms the last two payments in two tabs at the same moment. The round must complete exactly once, with one fee row and one next round. This is guarded by `FOR UPDATE` on group, round and payment, a status re-check, and `ON CONFLICT (round_id) DO NOTHING`. Checked in Task 10, step 4.
2. **Stale page.** A payer uploads a slip after the receiver has already marked them "received in cash", or after the round closed. The action must refuse with `errState` and must not overwrite. Checked in Task 10, step 5.
3. **Old invite link.** Someone opens a code after the group started, or re-joins after being declined. The first case shows the "no group with this code" message. The second reuses their old row and sets it back to `pending`. Checked in Task 10, step 2.
4. **Missing receiving details or an expired start date at Start.** The organizer sees which names are missing, or is told to pick a new date. Nothing is half-created. Checked in Task 10, step 3.
5. **Slip or QR URL opened by a non-member.** Answers 404. Checked in Task 10, step 7.

---

### Task 1: Pure rules with unit tests

**Files:**
- Create: `lib/savings-rules.ts`
- Create: `lib/savings-rules.test.ts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces:
  - `INVITE_ALPHABET: string`
  - `INVITE_LENGTH: 6`
  - `makeInviteCode(rand?: () => number): string`
  - `normalizeInviteCode(raw: string): string | null`
  - `potFor(amount: number, members: number): number`
  - `isCompleteOrder(turns: (number | null)[]): boolean`
  - `shuffled<T>(items: readonly T[], rand?: () => number): T[]`
  - `canRemind(last: Date | null, now: Date): boolean`
  - `todayInLaos(now?: Date): string` (returns `YYYY-MM-DD`)
  - `isTodayOrLater(value: string, today: string): boolean`

- [ ] **Step 1: Write the failing test** — `lib/savings-rules.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVITE_ALPHABET,
  INVITE_LENGTH,
  canRemind,
  isCompleteOrder,
  isTodayOrLater,
  makeInviteCode,
  normalizeInviteCode,
  potFor,
  shuffled,
} from "./savings-rules";

test("makeInviteCode uses only unambiguous characters", () => {
  for (let i = 0; i < 200; i++) {
    const code = makeInviteCode();
    assert.equal(code.length, INVITE_LENGTH);
    for (const ch of code) assert.ok(INVITE_ALPHABET.includes(ch), ch);
  }
});

test("makeInviteCode is driven by the random source", () => {
  assert.equal(makeInviteCode(() => 0), "AAAAAA");
  assert.equal(makeInviteCode(() => 0.9999), "999999");
});

test("normalizeInviteCode accepts what people type", () => {
  assert.equal(normalizeInviteCode(" ab3-k7m "), "AB3K7M");
  assert.equal(normalizeInviteCode("ab3 k7m"), "AB3K7M");
  assert.equal(normalizeInviteCode("AB3K7"), null); // too short
  assert.equal(normalizeInviteCode("AB3K7O"), null); // O is not in the alphabet
  assert.equal(normalizeInviteCode(""), null);
});

test("potFor: the receiver does not pay themself", () => {
  assert.equal(potFor(100_000, 10), 900_000);
  assert.equal(potFor(100_000, 2), 100_000);
});

test("isCompleteOrder needs 1..n with no gaps or repeats", () => {
  assert.equal(isCompleteOrder([2, 1, 3]), true);
  assert.equal(isCompleteOrder([1]), false); // a group needs two people
  assert.equal(isCompleteOrder([1, 1]), false);
  assert.equal(isCompleteOrder([1, 3]), false);
  assert.equal(isCompleteOrder([1, null]), false);
  assert.equal(isCompleteOrder([0, 1]), false);
});

test("shuffled keeps every item and leaves the input alone", () => {
  const input = ["a", "b", "c", "d"];
  const out = shuffled(input, () => 0);
  assert.deepEqual([...out].sort(), input);
  assert.deepEqual(input, ["a", "b", "c", "d"]);
  assert.deepEqual(out, ["b", "c", "d", "a"]);
});

test("canRemind allows one reminder a day", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  assert.equal(canRemind(null, now), true);
  assert.equal(canRemind(new Date("2026-10-15T01:00:00Z"), now), false);
  assert.equal(canRemind(new Date("2026-10-14T12:00:00Z"), now), true);
});

test("isTodayOrLater", () => {
  assert.equal(isTodayOrLater("2026-10-15", "2026-10-15"), true);
  assert.equal(isTodayOrLater("2026-10-16", "2026-10-15"), true);
  assert.equal(isTodayOrLater("2026-10-14", "2026-10-15"), false);
  assert.equal(isTodayOrLater("2026-02-30", "2026-01-01"), false); // not a real date
  assert.equal(isTodayOrLater("15/10/2026", "2026-01-01"), false);
  assert.equal(isTodayOrLater("2032-01-01", "2026-10-15"), false); // more than 5 years ahead
});
```

- [ ] **Step 2: Add the test script and run it to verify it fails**

In `package.json` `"scripts"`, add after `"lint": "eslint",`:

```json
    "test": "tsx --test lib/savings-rules.test.ts",
```

Run: `npm test`
Expected: FAIL — `Cannot find module './savings-rules'`.

- [ ] **Step 3: Write the implementation** — `lib/savings-rules.ts`

```ts
/**
 * Rules for rotating savings groups that need no database, kept apart so they can be unit
 * tested (`npm test`). Everything that reads or writes rows lives in lib/savings.ts and
 * app/actions/savings.ts.
 */

// No 0/O or 1/I/L: codes are read aloud and typed on phones.
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_LENGTH = 6;

const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export function makeInviteCode(rand: () => number = secureRandom) {
  let code = "";
  for (let i = 0; i < INVITE_LENGTH; i++) code += INVITE_ALPHABET[Math.floor(rand() * INVITE_ALPHABET.length)];
  return code;
}

/** Uppercases and drops spaces/dashes; null unless it could be a real code. */
export function normalizeInviteCode(raw: string) {
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== INVITE_LENGTH) return null;
  return [...code].every((c) => INVITE_ALPHABET.includes(c)) ? code : null;
}

/** What one round's receiver gets: everyone else pays them once. */
export const potFor = (amount: number, members: number) => amount * (members - 1);

/** Turn numbers are exactly 1..n, n ≥ 2, in any order. */
export function isCompleteOrder(turns: (number | null)[]) {
  if (turns.length < 2) return false;
  const sorted = [...turns].sort((a, b) => (a ?? 0) - (b ?? 0));
  return sorted.every((t, i) => t === i + 1);
}

/** Fisher–Yates on a copy. */
export function shuffled<T>(items: readonly T[], rand: () => number = secureRandom): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const DAY = 24 * 60 * 60 * 1000;

/** The organizer may nudge unpaid members at most once a day per round. */
export const canRemind = (last: Date | null, now: Date) => !last || now.getTime() - last.getTime() >= DAY;

/** Today's date in Laos as YYYY-MM-DD, whatever the server's time zone. */
export function todayInLaos(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Vientiane" });
}

/** A real YYYY-MM-DD date from `today` up to five years ahead. */
export function isTodayOrLater(value: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return value >= today && Number(value.slice(0, 4)) <= Number(today.slice(0, 4)) + 5;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: `# pass 8`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/savings-rules.ts lib/savings-rules.test.ts package.json
git commit -m "feat(savings): pure rules for rotating savings groups"
```

---

### Task 2: Database schema

**Files:**
- Modify: `db/schema.sql` (append at the end)

**Interfaces:**
- Produces:
  - Tables `savings_groups`, `savings_members`, `savings_rounds`, `savings_payments` and `savings_fees`, with columns exactly as below
  - Enums `savings_group_status`, `savings_period`, `savings_member_status`, `savings_round_status` and `savings_payment_status`
  - Column `platform_settings.savings_fee_percent`

- [ ] **Step 1: Append to `db/schema.sql`**

```sql
-- ===========================================================================
-- Rotating savings groups. Anyone signed in (not the platform owner) organizes a
-- group; members join with its code. Each round every member transfers straight to
-- that round's receiver, who confirms the slips; the receiver owes the platform a
-- fee on the pot. Money never passes through the platform. Additive and re-runnable.
-- ===========================================================================

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS savings_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 1.00
  CHECK (savings_fee_percent >= 0 AND savings_fee_percent <= 100);

DO $$ BEGIN
  CREATE TYPE savings_group_status AS ENUM ('forming', 'active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE savings_period AS ENUM ('weekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE savings_member_status AS ENUM ('pending', 'approved', 'declined', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE savings_round_status AS ENUM ('upcoming', 'collecting', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE savings_payment_status AS ENUM ('unpaid', 'pending', 'confirmed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS savings_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name         VARCHAR(100) NOT NULL,
  description  TEXT,
  amount       BIGINT NOT NULL CHECK (amount > 0), -- per person per round, in kip
  period       savings_period NOT NULL,
  start_date   DATE NOT NULL,                      -- round 1's due date
  invite_code  VARCHAR(8) NOT NULL UNIQUE,
  fee_percent  NUMERIC(5, 2),                      -- copied from platform_settings when the group starts
  status       savings_group_status NOT NULL DEFAULT 'forming',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS savings_groups_organizer_idx ON savings_groups (organizer_id);

-- One row per person per group. The organizer is a member too and takes a turn.
CREATE TABLE IF NOT EXISTS savings_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       UUID NOT NULL REFERENCES savings_groups(id) ON DELETE RESTRICT,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status         savings_member_status NOT NULL DEFAULT 'pending',
  turn_no        INT CHECK (turn_no IS NULL OR turn_no > 0),
  bank_name      VARCHAR(100),                     -- where this member receives their pot
  account_name   VARCHAR(150),
  account_number VARCHAR(50),
  qr_file_id     UUID REFERENCES files(id) ON DELETE RESTRICT,
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ,
  UNIQUE (group_id, user_id),
  -- Deferred so the whole order can be rewritten in one statement.
  CONSTRAINT savings_members_turn_unique UNIQUE (group_id, turn_no) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS savings_members_user_idx ON savings_members (user_id);

CREATE TABLE IF NOT EXISTS savings_rounds (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id           UUID NOT NULL REFERENCES savings_groups(id) ON DELETE RESTRICT,
  round_no           INT NOT NULL CHECK (round_no > 0),
  receiver_member_id UUID NOT NULL REFERENCES savings_members(id) ON DELETE RESTRICT,
  due_date           DATE NOT NULL,
  status             savings_round_status NOT NULL DEFAULT 'upcoming',
  opened_at          TIMESTAMPTZ,
  done_at            TIMESTAMPTZ,
  last_reminder_at   TIMESTAMPTZ,
  UNIQUE (group_id, round_no)
);
-- Only one round of a group collects at a time.
CREATE UNIQUE INDEX IF NOT EXISTS savings_rounds_one_collecting ON savings_rounds (group_id) WHERE status = 'collecting';

-- One row per payer per round (never the round's own receiver).
CREATE TABLE IF NOT EXISTS savings_payments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id               UUID NOT NULL REFERENCES savings_rounds(id) ON DELETE RESTRICT,
  payer_member_id        UUID NOT NULL REFERENCES savings_members(id) ON DELETE RESTRICT,
  amount                 BIGINT NOT NULL CHECK (amount > 0),
  status                 savings_payment_status NOT NULL DEFAULT 'unpaid',
  slip_file_id           UUID REFERENCES files(id) ON DELETE RESTRICT,
  transfer_date          DATE,
  confirmed_without_slip BOOLEAN NOT NULL DEFAULT FALSE, -- the receiver got cash
  review_note            TEXT,
  submitted_at           TIMESTAMPTZ,
  reviewed_at            TIMESTAMPTZ,
  UNIQUE (round_id, payer_member_id)
);
CREATE INDEX IF NOT EXISTS savings_payments_slip_idx ON savings_payments (slip_file_id) WHERE slip_file_id IS NOT NULL;

-- Who owes what and for which round is fixed once written; only the review may change.
CREATE OR REPLACE FUNCTION lock_savings_payment() RETURNS trigger AS $$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.round_id IS DISTINCT FROM OLD.round_id
     OR NEW.payer_member_id IS DISTINCT FROM OLD.payer_member_id THEN
    RAISE EXCEPTION 'A savings payment''s amount, round and payer cannot be changed';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS savings_payments_lock ON savings_payments;
CREATE TRIGGER savings_payments_lock BEFORE UPDATE ON savings_payments
  FOR EACH ROW EXECUTE FUNCTION lock_savings_payment();

-- Platform fee per completed round, owed by its receiver until the super admin marks it received.
CREATE TABLE IF NOT EXISTS savings_fees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id      UUID NOT NULL UNIQUE REFERENCES savings_rounds(id) ON DELETE RESTRICT,
  payer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  percent       NUMERIC(5, 2) NOT NULL,
  base_amount   BIGINT NOT NULL,
  fee_amount    BIGINT NOT NULL CHECK (fee_amount >= 0),
  status        fee_status NOT NULL DEFAULT 'owed',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at   TIMESTAMPTZ,
  received_by   UUID REFERENCES users(id) ON DELETE SET NULL
);
```

- [ ] **Step 2: Apply it twice (the second run proves it is re-runnable)**

Run: `npm run db:setup` and then `npm run db:setup` again.
Expected: both runs print `✓ Schema applied` with no error.

- [ ] **Step 3: Verify the tables exist**

Run:
```bash
node -e "process.loadEnvFile('.env.local');const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.query(\"SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'savings_%' ORDER BY 1\")).then(r=>{console.log(r.rows.map(x=>x.table_name).join(' '));return c.end()})"
```
Expected: `savings_fees savings_groups savings_members savings_payments savings_rounds`

- [ ] **Step 4: Commit**

```bash
git add db/schema.sql
git commit -m "feat(savings): database schema for rotating savings groups"
```

---

### Task 3: All text in three languages

**Files:**
- Modify: `lib/i18n/en.json`, `lib/i18n/la.json`, `lib/i18n/hm.json`

**Interfaces:**
- Produces:
  - Dictionary keys `t.savings.*` (below)
  - `t.nav.areaSavings` and `t.nav.areaSavingsNote`
  - `t.admin.savingsFee*`, `t.admin.noSavingsFees` and `t.admin.colGroup`
  - 12 new `t.notifications.types.savings_*` entries

In each file make four edits:
1. Add the two `nav` keys after `"areaDonationsNote"`.
2. Add the `admin` keys after `"markReceived"` (inside `"admin"`).
3. Add the notification types after `"kyc_revoked"` (inside `notifications.types`).
4. Add the whole `"savings"` object as the last top-level key.

JSON needs a comma after the key that precedes each insertion.

- [ ] **Step 1: `lib/i18n/en.json`**

`nav`:
```json
    "areaSavings": "Savings groups",
    "areaSavingsNote": "With people you trust",
```
`admin`:
```json
    "savingsFeeTitle": "Savings group fee",
    "savingsFeeLabel": "Fee on each pot (%)",
    "savingsFeeHint": "Owed by each round's receiver. A group keeps the rate it started with.",
    "saveSavingsFee": "Save savings fee",
    "savingsFeeSaved": "Savings group fee set to {fee}%.",
    "savingsFeesTitle": "Savings group fees",
    "noSavingsFees": "No savings group fees yet.",
    "colGroup": "Group",
```
`notifications.types`:
```json
      "savings_join_request": "{name} asks to join your savings group {group}.",
      "savings_join_approved": "You are in the savings group {group}.",
      "savings_join_declined": "{group} declined your request to join.",
      "savings_round_open": "{group}, round {round}: send {amount} to {receiver}.",
      "savings_your_turn": "{group}, round {round} is yours. You will receive {pot}.",
      "savings_slip_uploaded": "{name} sent a slip of {amount} for {group}. Please check it.",
      "savings_slip_confirmed": "{name} confirmed your payment of {amount} for {group}.",
      "savings_slip_rejected": "{name} did not accept your payment for {group}: {note}",
      "savings_reminder": "Reminder — {group}, round {round}: send {amount} to {receiver}.",
      "savings_round_done": "{group}, round {round} is complete. You received {pot}. Platform fee owed: {fee}.",
      "savings_completed": "{group} has finished. Every member has received their pot.",
      "savings_cancelled": "{group} was cancelled by the organizer."
```
Top level:
```json
  "savings": {
    "metaTitle": "Savings groups",
    "title": "Savings groups",
    "lede": "Save together with people you trust. Each round everyone pays the same amount, and one person receives the whole pot.",
    "create": "Start a group",
    "join": "Join with a code",
    "empty": "You are not in any savings group yet.",
    "emptyBody": "Start one and share its code, or join a group with the code someone gave you.",
    "organizing": "You organize",
    "organizedBy": "Organized by {name}",
    "waitingApproval": "Waiting for approval",
    "yourTurn": "Your turn: round {n}",
    "roundOf": "Round {n} of {total}",
    "roundNo": "Round {n}",
    "membersCount": "{n} members",
    "period": { "weekly": "every week", "monthly": "every month" },
    "periodLabel": { "weekly": "Weekly", "monthly": "Monthly" },
    "groupStatus": { "forming": "Getting ready", "active": "Running", "completed": "Finished", "cancelled": "Cancelled" },
    "roundStatus": { "upcoming": "Upcoming", "collecting": "Collecting", "done": "Done" },
    "paymentStatus": { "unpaid": "Not paid", "pending": "Waiting for check", "confirmed": "Received", "rejected": "Not accepted" },
    "back": "Savings groups",
    "newMetaTitle": "Start a savings group",
    "newTitle": "Start a savings group",
    "newLede": "Set the amount and how often people pay. You get a code to share, and you approve everyone who asks to join.",
    "editMetaTitle": "Edit group",
    "editTitle": "Edit group",
    "fName": "Group name",
    "fNamePlaceholder": "Family savings 2027",
    "fDescription": "Notes for members",
    "fAmount": "Each person pays per round (₭)",
    "fPeriod": "How often",
    "fStartDate": "First round due",
    "fStartDateHint": "Each later round is due one week or one month after the one before.",
    "receivingTitle": "Where you receive your pot",
    "receivingHint": "When it is your turn, members send your pot here. Give an account, a QR code, or both.",
    "fBank": "Bank",
    "fAccountName": "Account name",
    "fAccountNumber": "Account number",
    "fQr": "Payment QR code",
    "fQrHint": "A photo of your bank QR code.",
    "keepQr": "Leave empty to keep your current QR code.",
    "submitCreate": "Create group",
    "creating": "Creating…",
    "save": "Save",
    "saving": "Saving…",
    "saved": "Saved.",
    "errName": "Give the group a name (at least 3 letters).",
    "errAmount": "Enter the amount in kip, for example 100000.",
    "errPeriod": "Choose weekly or monthly.",
    "errStartDate": "Choose today or a later date.",
    "errReceiving": "Add an account name and number, or a QR code.",
    "errFile": "Use a JPG, PNG or WebP image under 5 MB.",
    "errSlipFile": "Use a JPG, PNG, WebP or PDF under 5 MB.",
    "errState": "This has changed since you opened the page. Reload and try again.",
    "joinMetaTitle": "Join a savings group",
    "joinTitle": "Join a savings group",
    "joinLede": "Enter the code the organizer gave you.",
    "fCode": "Group code",
    "findGroup": "Find group",
    "errCode": "No group is taking members with this code. Check it with the organizer.",
    "errAlready": "You are already in this group or waiting for approval.",
    "openGroup": "Open group",
    "joinAbout": "{organizer} organizes this group. {amount} {period}, {n} members so far.",
    "sendRequest": "Ask to join",
    "sending": "Sending…",
    "pendingTitle": "Waiting for the organizer",
    "pendingBody": "{organizer} has your request to join. You will get a notification when it is decided.",
    "inviteTitle": "Invite people",
    "inviteBody": "Share this code or link. You approve everyone who asks.",
    "copyLink": "Copy link",
    "copied": "Copied",
    "requestsTitle": "Asking to join",
    "approve": "Approve",
    "decline": "Decline",
    "remove": "Remove",
    "orderTitle": "Who receives when",
    "orderBody": "Round 1 goes to the first person, and so on. The order is locked when the group starts.",
    "waitingStart": "The organizer starts the group once everyone has joined. Until then the order may still change.",
    "moveUp": "Move up",
    "moveDown": "Move down",
    "saveOrder": "Save order",
    "shuffle": "Draw at random",
    "noReceiving": "No receiving details yet",
    "noClan": "No clan",
    "edit": "Edit group",
    "startTitle": "Start the group",
    "startBody": "{n} members, {rounds} rounds. Each round's pot is {pot}. Once started, nobody can join and the order cannot change.",
    "start": "Start now",
    "starting": "Starting…",
    "errTooFew": "A group needs at least 2 members.",
    "errOrder": "Save the order first.",
    "errMissingReceiving": "These members still need receiving details: {names}",
    "errStartPast": "The first due date has passed. Edit the group and choose a new date.",
    "cancelGroup": "Cancel group",
    "cancelConfirm": "Cancel this group for everyone?",
    "cancelYes": "Yes, cancel",
    "keep": "Keep",
    "currentRound": "Round {n} of {total}",
    "receives": "{name} receives {pot}",
    "due": "Due {date}",
    "late": "Late",
    "payTo": "Send {amount} to {name}",
    "youReceive": "This is your round. You receive {pot}.",
    "youPaid": "You have paid this round.",
    "waitingCheck": "Your slip was sent. Waiting for {name} to check it.",
    "fTransferDate": "Date of transfer",
    "fSlip": "Transfer slip",
    "fSlipHint": "A photo or PDF of the bank confirmation.",
    "sendSlip": "Send slip",
    "slipSent": "Slip sent. {name} will check it.",
    "errDate": "Enter the date you made the transfer.",
    "errSlip": "Add a photo of the transfer slip.",
    "rejectedNote": "Not accepted: {note}",
    "paymentsTitle": "Payments this round",
    "paidCount": "{paid} of {total} received",
    "viewSlip": "View slip",
    "confirm": "Received",
    "reject": "Not received",
    "markCash": "Received in cash",
    "reason": "Reason",
    "reasonPlaceholder": "For example: the amount is wrong",
    "errReason": "Say why, so they can fix it.",
    "confirmedMsg": "Marked as received.",
    "rejectedMsg": "They have been asked to send it again.",
    "cash": "Cash",
    "remind": "Remind who has not paid",
    "reminded": "Reminder sent to {n} people.",
    "errRemindedToday": "A reminder was already sent today.",
    "nobodyToRemind": "Everyone has sent a slip.",
    "scheduleTitle": "All rounds",
    "feeNote": "When this round is complete, the receiver owes a platform fee of {pct}% of the pot ({fee}).",
    "completedTitle": "Every member has received their pot.",
    "myReceiving": "My receiving details",
    "cancelled": "This group was cancelled."
  }
```

- [ ] **Step 2: `lib/i18n/la.json`** — same keys, Lao text

`nav`:
```json
    "areaSavings": "ກຸ່ມອອມເງິນ",
    "areaSavingsNote": "ກັບຄົນທີ່ທ່ານໄວ້ໃຈ",
```
`admin`:
```json
    "savingsFeeTitle": "ຄ່າທຳນຽມກຸ່ມອອມເງິນ",
    "savingsFeeLabel": "ຄ່າທຳນຽມຕໍ່ເງິນແຕ່ລະງວດ (%)",
    "savingsFeeHint": "ຜູ້ຮັບເງິນແຕ່ລະງວດເປັນຜູ້ຈ່າຍ. ກຸ່ມໃຊ້ອັດຕາທີ່ມີຕອນເລີ່ມ.",
    "saveSavingsFee": "ບັນທຶກຄ່າທຳນຽມ",
    "savingsFeeSaved": "ຕັ້ງຄ່າທຳນຽມກຸ່ມອອມເງິນເປັນ {fee}% ແລ້ວ.",
    "savingsFeesTitle": "ຄ່າທຳນຽມກຸ່ມອອມເງິນ",
    "noSavingsFees": "ຍັງບໍ່ມີຄ່າທຳນຽມກຸ່ມອອມເງິນ.",
    "colGroup": "ກຸ່ມ",
```
`notifications.types`:
```json
      "savings_join_request": "{name} ຂໍເຂົ້າຮ່ວມກຸ່ມອອມເງິນ {group} ຂອງທ່ານ.",
      "savings_join_approved": "ທ່ານເປັນສະມາຊິກກຸ່ມອອມເງິນ {group} ແລ້ວ.",
      "savings_join_declined": "{group} ປະຕິເສດຄຳຂໍເຂົ້າຮ່ວມຂອງທ່ານ.",
      "savings_round_open": "{group}, ງວດທີ {round}: ໂອນ {amount} ໃຫ້ {receiver}.",
      "savings_your_turn": "{group}, ງວດທີ {round} ເປັນຂອງທ່ານ. ທ່ານຈະໄດ້ຮັບ {pot}.",
      "savings_slip_uploaded": "{name} ສົ່ງສະລິບ {amount} ສຳລັບ {group}. ກະລຸນາກວດ.",
      "savings_slip_confirmed": "{name} ຢືນຢັນວ່າໄດ້ຮັບ {amount} ຂອງທ່ານສຳລັບ {group} ແລ້ວ.",
      "savings_slip_rejected": "{name} ບໍ່ຮັບການຈ່າຍຂອງທ່ານສຳລັບ {group}: {note}",
      "savings_reminder": "ເຕືອນ — {group}, ງວດທີ {round}: ໂອນ {amount} ໃຫ້ {receiver}.",
      "savings_round_done": "{group}, ງວດທີ {round} ສຳເລັດແລ້ວ. ທ່ານໄດ້ຮັບ {pot}. ຄ່າທຳນຽມລະບົບທີ່ຕ້ອງຈ່າຍ: {fee}.",
      "savings_completed": "{group} ສຳເລັດແລ້ວ. ທຸກຄົນໄດ້ຮັບເງິນຂອງຕົນ.",
      "savings_cancelled": "ຜູ້ຈັດຕັ້ງໄດ້ຍົກເລີກ {group}."
```
Top level:
```json
  "savings": {
    "metaTitle": "ກຸ່ມອອມເງິນ",
    "title": "ກຸ່ມອອມເງິນ",
    "lede": "ອອມເງິນຮ່ວມກັບຄົນທີ່ທ່ານໄວ້ໃຈ. ແຕ່ລະງວດທຸກຄົນຈ່າຍເທົ່າກັນ, ແລະ ມີໜຶ່ງຄົນໄດ້ຮັບເງິນທັງໝົດ.",
    "create": "ສ້າງກຸ່ມ",
    "join": "ເຂົ້າຮ່ວມດ້ວຍລະຫັດ",
    "empty": "ທ່ານຍັງບໍ່ໄດ້ຢູ່ໃນກຸ່ມອອມເງິນໃດເທື່ອ.",
    "emptyBody": "ສ້າງກຸ່ມ ແລ້ວແບ່ງປັນລະຫັດ, ຫຼື ເຂົ້າຮ່ວມກຸ່ມດ້ວຍລະຫັດທີ່ມີຄົນໃຫ້ທ່ານ.",
    "organizing": "ທ່ານເປັນຜູ້ຈັດຕັ້ງ",
    "organizedBy": "ຈັດຕັ້ງໂດຍ {name}",
    "waitingApproval": "ລໍຖ້າອະນຸມັດ",
    "yourTurn": "ຮອບຂອງທ່ານ: ງວດທີ {n}",
    "roundOf": "ງວດທີ {n} ຈາກ {total}",
    "roundNo": "ງວດທີ {n}",
    "membersCount": "{n} ຄົນ",
    "period": { "weekly": "ທຸກອາທິດ", "monthly": "ທຸກເດືອນ" },
    "periodLabel": { "weekly": "ລາຍອາທິດ", "monthly": "ລາຍເດືອນ" },
    "groupStatus": { "forming": "ກຳລັງກຽມ", "active": "ກຳລັງດຳເນີນ", "completed": "ສຳເລັດແລ້ວ", "cancelled": "ຍົກເລີກແລ້ວ" },
    "roundStatus": { "upcoming": "ຍັງບໍ່ເຖິງ", "collecting": "ກຳລັງເກັບ", "done": "ສຳເລັດ" },
    "paymentStatus": { "unpaid": "ຍັງບໍ່ຈ່າຍ", "pending": "ລໍຖ້າກວດ", "confirmed": "ໄດ້ຮັບແລ້ວ", "rejected": "ບໍ່ຮັບ" },
    "back": "ກຸ່ມອອມເງິນ",
    "newMetaTitle": "ສ້າງກຸ່ມອອມເງິນ",
    "newTitle": "ສ້າງກຸ່ມອອມເງິນ",
    "newLede": "ກຳນົດຈຳນວນເງິນ ແລະ ຄວາມຖີ່ຂອງການຈ່າຍ. ທ່ານຈະໄດ້ລະຫັດໄວ້ແບ່ງປັນ ແລະ ທ່ານເປັນຜູ້ອະນຸມັດທຸກຄົນທີ່ຂໍເຂົ້າຮ່ວມ.",
    "editMetaTitle": "ແກ້ໄຂກຸ່ມ",
    "editTitle": "ແກ້ໄຂກຸ່ມ",
    "fName": "ຊື່ກຸ່ມ",
    "fNamePlaceholder": "ກຸ່ມອອມຄອບຄົວ 2027",
    "fDescription": "ໝາຍເຫດສຳລັບສະມາຊິກ",
    "fAmount": "ແຕ່ລະຄົນຈ່າຍຕໍ່ງວດ (₭)",
    "fPeriod": "ຈ່າຍທຸກໆ",
    "fStartDate": "ວັນຄົບກຳນົດງວດທຳອິດ",
    "fStartDateHint": "ງວດຕໍ່ໄປຄົບກຳນົດຫຼັງງວດກ່ອນໜຶ່ງອາທິດ ຫຼື ໜຶ່ງເດືອນ.",
    "receivingTitle": "ບ່ອນທີ່ທ່ານຮັບເງິນ",
    "receivingHint": "ເມື່ອຮອດຮອບຂອງທ່ານ ສະມາຊິກຈະໂອນເງິນມາບ່ອນນີ້. ໃສ່ບັນຊີ, QR ຫຼື ທັງສອງ.",
    "fBank": "ທະນາຄານ",
    "fAccountName": "ຊື່ບັນຊີ",
    "fAccountNumber": "ເລກບັນຊີ",
    "fQr": "QR ຮັບເງິນ",
    "fQrHint": "ຮູບ QR ທະນາຄານຂອງທ່ານ.",
    "keepQr": "ປ່ອຍວ່າງໄວ້ ເພື່ອໃຊ້ QR ເດີມ.",
    "submitCreate": "ສ້າງກຸ່ມ",
    "creating": "ກຳລັງສ້າງ…",
    "save": "ບັນທຶກ",
    "saving": "ກຳລັງບັນທຶກ…",
    "saved": "ບັນທຶກແລ້ວ.",
    "errName": "ກະລຸນາຕັ້ງຊື່ກຸ່ມ (ຢ່າງໜ້ອຍ 3 ຕົວອັກສອນ).",
    "errAmount": "ກະລຸນາໃສ່ຈຳນວນເງິນເປັນກີບ, ຕົວຢ່າງ 100000.",
    "errPeriod": "ກະລຸນາເລືອກລາຍອາທິດ ຫຼື ລາຍເດືອນ.",
    "errStartDate": "ກະລຸນາເລືອກມື້ນີ້ ຫຼື ມື້ຕໍ່ໄປ.",
    "errReceiving": "ກະລຸນາໃສ່ຊື່ ແລະ ເລກບັນຊີ, ຫຼື ຮູບ QR.",
    "errFile": "ໃຊ້ຮູບ JPG, PNG ຫຼື WebP ບໍ່ເກີນ 5 MB.",
    "errSlipFile": "ໃຊ້ JPG, PNG, WebP ຫຼື PDF ບໍ່ເກີນ 5 MB.",
    "errState": "ມີການປ່ຽນແປງຕັ້ງແຕ່ທ່ານເປີດໜ້ານີ້. ກະລຸນາໂຫຼດໃໝ່ ແລ້ວລອງອີກຄັ້ງ.",
    "joinMetaTitle": "ເຂົ້າຮ່ວມກຸ່ມອອມເງິນ",
    "joinTitle": "ເຂົ້າຮ່ວມກຸ່ມອອມເງິນ",
    "joinLede": "ໃສ່ລະຫັດທີ່ຜູ້ຈັດຕັ້ງໃຫ້ທ່ານ.",
    "fCode": "ລະຫັດກຸ່ມ",
    "findGroup": "ຊອກຫາກຸ່ມ",
    "errCode": "ບໍ່ມີກຸ່ມທີ່ກຳລັງຮັບສະມາຊິກດ້ວຍລະຫັດນີ້. ກະລຸນາກວດກັບຜູ້ຈັດຕັ້ງ.",
    "errAlready": "ທ່ານຢູ່ໃນກຸ່ມນີ້ແລ້ວ ຫຼື ກຳລັງລໍຖ້າອະນຸມັດ.",
    "openGroup": "ເປີດກຸ່ມ",
    "joinAbout": "{organizer} ເປັນຜູ້ຈັດຕັ້ງກຸ່ມນີ້. {amount} {period}, ມີ {n} ຄົນແລ້ວ.",
    "sendRequest": "ຂໍເຂົ້າຮ່ວມ",
    "sending": "ກຳລັງສົ່ງ…",
    "pendingTitle": "ລໍຖ້າຜູ້ຈັດຕັ້ງ",
    "pendingBody": "{organizer} ໄດ້ຮັບຄຳຂໍຂອງທ່ານແລ້ວ. ທ່ານຈະໄດ້ຮັບແຈ້ງເຕືອນເມື່ອມີການຕັດສິນ.",
    "inviteTitle": "ເຊີນຄົນເຂົ້າຮ່ວມ",
    "inviteBody": "ແບ່ງປັນລະຫັດ ຫຼື ລິ້ງນີ້. ທ່ານເປັນຜູ້ອະນຸມັດທຸກຄົນທີ່ຂໍເຂົ້າ.",
    "copyLink": "ສຳເນົາລິ້ງ",
    "copied": "ສຳເນົາແລ້ວ",
    "requestsTitle": "ຂໍເຂົ້າຮ່ວມ",
    "approve": "ອະນຸມັດ",
    "decline": "ປະຕິເສດ",
    "remove": "ເອົາອອກ",
    "orderTitle": "ລຳດັບການຮັບເງິນ",
    "orderBody": "ງວດທີ 1 ເປັນຂອງຄົນທຳອິດ, ແລະ ຕໍ່ໆໄປ. ລຳດັບຈະລັອກເມື່ອເລີ່ມກຸ່ມ.",
    "waitingStart": "ຜູ້ຈັດຕັ້ງຈະເລີ່ມກຸ່ມເມື່ອທຸກຄົນເຂົ້າຮ່ວມແລ້ວ. ລຳດັບຍັງປ່ຽນໄດ້ຈົນກວ່າຈະເລີ່ມ.",
    "moveUp": "ຍ້າຍຂຶ້ນ",
    "moveDown": "ຍ້າຍລົງ",
    "saveOrder": "ບັນທຶກລຳດັບ",
    "shuffle": "ຈັບສະຫຼາກ",
    "noReceiving": "ຍັງບໍ່ມີຂໍ້ມູນຮັບເງິນ",
    "noClan": "ບໍ່ມີແຊ່ງ",
    "edit": "ແກ້ໄຂກຸ່ມ",
    "startTitle": "ເລີ່ມກຸ່ມ",
    "startBody": "{n} ຄົນ, {rounds} ງວດ. ແຕ່ລະງວດໄດ້ຮັບ {pot}. ເມື່ອເລີ່ມແລ້ວ ບໍ່ມີໃຜເຂົ້າຮ່ວມໄດ້ອີກ ແລະ ລຳດັບປ່ຽນບໍ່ໄດ້.",
    "start": "ເລີ່ມດຽວນີ້",
    "starting": "ກຳລັງເລີ່ມ…",
    "errTooFew": "ກຸ່ມຕ້ອງມີຢ່າງໜ້ອຍ 2 ຄົນ.",
    "errOrder": "ກະລຸນາບັນທຶກລຳດັບກ່ອນ.",
    "errMissingReceiving": "ສະມາຊິກເຫຼົ່ານີ້ຍັງບໍ່ມີຂໍ້ມູນຮັບເງິນ: {names}",
    "errStartPast": "ວັນຄົບກຳນົດງວດທຳອິດຜ່ານໄປແລ້ວ. ກະລຸນາແກ້ໄຂກຸ່ມ ແລະ ເລືອກວັນໃໝ່.",
    "cancelGroup": "ຍົກເລີກກຸ່ມ",
    "cancelConfirm": "ຍົກເລີກກຸ່ມນີ້ສຳລັບທຸກຄົນບໍ?",
    "cancelYes": "ແມ່ນ, ຍົກເລີກ",
    "keep": "ບໍ່",
    "currentRound": "ງວດທີ {n} ຈາກ {total}",
    "receives": "{name} ໄດ້ຮັບ {pot}",
    "due": "ຄົບກຳນົດ {date}",
    "late": "ຊ້າ",
    "payTo": "ໂອນ {amount} ໃຫ້ {name}",
    "youReceive": "ງວດນີ້ເປັນຂອງທ່ານ. ທ່ານຈະໄດ້ຮັບ {pot}.",
    "youPaid": "ທ່ານຈ່າຍງວດນີ້ແລ້ວ.",
    "waitingCheck": "ສົ່ງສະລິບແລ້ວ. ລໍຖ້າ {name} ກວດ.",
    "fTransferDate": "ວັນທີໂອນ",
    "fSlip": "ສະລິບການໂອນ",
    "fSlipHint": "ຮູບ ຫຼື PDF ຢືນຢັນຈາກທະນາຄານ.",
    "sendSlip": "ສົ່ງສະລິບ",
    "slipSent": "ສົ່ງສະລິບແລ້ວ. {name} ຈະກວດ.",
    "errDate": "ກະລຸນາໃສ່ວັນທີທີ່ທ່ານໂອນ.",
    "errSlip": "ກະລຸນາໃສ່ຮູບສະລິບການໂອນ.",
    "rejectedNote": "ບໍ່ຮັບ: {note}",
    "paymentsTitle": "ການຈ່າຍງວດນີ້",
    "paidCount": "ໄດ້ຮັບ {paid} ຈາກ {total}",
    "viewSlip": "ເບິ່ງສະລິບ",
    "confirm": "ໄດ້ຮັບແລ້ວ",
    "reject": "ບໍ່ໄດ້ຮັບ",
    "markCash": "ໄດ້ຮັບເງິນສົດ",
    "reason": "ເຫດຜົນ",
    "reasonPlaceholder": "ຕົວຢ່າງ: ຈຳນວນເງິນບໍ່ຖືກ",
    "errReason": "ກະລຸນາບອກເຫດຜົນ ເພື່ອໃຫ້ເຂົາແກ້ໄຂ.",
    "confirmedMsg": "ໝາຍວ່າໄດ້ຮັບແລ້ວ.",
    "rejectedMsg": "ໄດ້ແຈ້ງໃຫ້ເຂົາສົ່ງໃໝ່ແລ້ວ.",
    "cash": "ເງິນສົດ",
    "remind": "ເຕືອນຄົນທີ່ຍັງບໍ່ຈ່າຍ",
    "reminded": "ສົ່ງການເຕືອນໃຫ້ {n} ຄົນແລ້ວ.",
    "errRemindedToday": "ມື້ນີ້ໄດ້ສົ່ງການເຕືອນແລ້ວ.",
    "nobodyToRemind": "ທຸກຄົນສົ່ງສະລິບແລ້ວ.",
    "scheduleTitle": "ທຸກງວດ",
    "feeNote": "ເມື່ອງວດນີ້ສຳເລັດ, ຜູ້ຮັບຕ້ອງຈ່າຍຄ່າທຳນຽມລະບົບ {pct}% ຂອງເງິນທີ່ໄດ້ຮັບ ({fee}).",
    "completedTitle": "ທຸກຄົນໄດ້ຮັບເງິນຂອງຕົນແລ້ວ.",
    "myReceiving": "ຂໍ້ມູນຮັບເງິນຂອງຂ້ອຍ",
    "cancelled": "ກຸ່ມນີ້ຖືກຍົກເລີກແລ້ວ."
  }
```

- [ ] **Step 3: `lib/i18n/hm.json`** — same keys, Hmong (RPA) text

`nav`:
```json
    "areaSavings": "Pab pawg txuag nyiaj",
    "areaSavingsNote": "Nrog cov neeg koj ntseeg siab",
```
`admin`:
```json
    "savingsFeeTitle": "Nqi pab pawg txuag nyiaj",
    "savingsFeeLabel": "Nqi ntawm txhua zaug (%)",
    "savingsFeeHint": "Tus txais txhua zaug yog tus them. Pab pawg siv tus nqi uas muaj thaum pib.",
    "saveSavingsFee": "Txuag nqi",
    "savingsFeeSaved": "Teem nqi pab pawg txuag nyiaj rau {fee}% lawm.",
    "savingsFeesTitle": "Nqi pab pawg txuag nyiaj",
    "noSavingsFees": "Tseem tsis muaj nqi pab pawg txuag nyiaj.",
    "colGroup": "Pab pawg",
```
`notifications.types`:
```json
      "savings_join_request": "{name} thov koom koj pab pawg txuag nyiaj {group}.",
      "savings_join_approved": "Koj yog tswv cuab ntawm pab pawg txuag nyiaj {group} lawm.",
      "savings_join_declined": "{group} tsis kam koj daim ntawv thov koom.",
      "savings_round_open": "{group}, zaug {round}: xa {amount} rau {receiver}.",
      "savings_your_turn": "{group}, zaug {round} yog koj li. Koj yuav tau {pot}.",
      "savings_slip_uploaded": "{name} xa daim slip {amount} rau {group}. Thov kuaj.",
      "savings_slip_confirmed": "{name} lees tias tau txais koj {amount} rau {group}.",
      "savings_slip_rejected": "{name} tsis lees txais koj kev them rau {group}: {note}",
      "savings_reminder": "Ceeb toom — {group}, zaug {round}: xa {amount} rau {receiver}.",
      "savings_round_done": "{group}, zaug {round} tiav lawm. Koj tau {pot}. Nqi platform yuav tsum them: {fee}.",
      "savings_completed": "{group} tiav lawm. Txhua tus tau txais lawv cov nyiaj.",
      "savings_cancelled": "Tus npaj tau tso tseg {group}."
```
Top level:
```json
  "savings": {
    "metaTitle": "Pab pawg txuag nyiaj",
    "title": "Pab pawg txuag nyiaj",
    "lede": "Txuag nyiaj ua ke nrog cov neeg koj ntseeg siab. Txhua zaug txhua tus them ib yam nkaus, thiab ib tug tau tag nrho cov nyiaj ntawd.",
    "create": "Tsim pab pawg",
    "join": "Koom nrog code",
    "empty": "Koj tseem tsis tau nyob hauv ib pab pawg txuag nyiaj twg.",
    "emptyBody": "Tsim ib pab thiab qhia nws tus code, los yog koom ib pab nrog tus code uas ib tug neeg muab rau koj.",
    "organizing": "Koj yog tus npaj",
    "organizedBy": "{name} yog tus npaj",
    "waitingApproval": "Tos kev pom zoo",
    "yourTurn": "Koj zaug: zaug {n}",
    "roundOf": "Zaug {n} ntawm {total}",
    "roundNo": "Zaug {n}",
    "membersCount": "{n} tus tswv cuab",
    "period": { "weekly": "txhua lub lim tiam", "monthly": "txhua lub hlis" },
    "periodLabel": { "weekly": "Txhua lub lim tiam", "monthly": "Txhua lub hlis" },
    "groupStatus": { "forming": "Tab tom npaj", "active": "Tab tom ua", "completed": "Tiav lawm", "cancelled": "Muab tso tseg lawm" },
    "roundStatus": { "upcoming": "Tseem tsis tau txog", "collecting": "Tab tom sau", "done": "Tiav" },
    "paymentStatus": { "unpaid": "Tsis tau them", "pending": "Tos kuaj", "confirmed": "Tau txais lawm", "rejected": "Tsis lees txais" },
    "back": "Pab pawg txuag nyiaj",
    "newMetaTitle": "Tsim pab pawg txuag nyiaj",
    "newTitle": "Tsim pab pawg txuag nyiaj",
    "newLede": "Teem tus nqi thiab them ntau zaus li cas. Koj yuav tau ib tus code los qhia, thiab koj pom zoo txhua tus uas thov koom.",
    "editMetaTitle": "Kho pab pawg",
    "editTitle": "Kho pab pawg",
    "fName": "Lub npe pab pawg",
    "fNamePlaceholder": "Tsev neeg txuag nyiaj 2027",
    "fDescription": "Lus qhia rau tswv cuab",
    "fAmount": "Txhua tus them ib zaug (₭)",
    "fPeriod": "Them ntau zaus li cas",
    "fStartDate": "Hnub them zaug thawj",
    "fStartDateHint": "Txhua zaug tom qab yog ib lub lim tiam los yog ib lub hlis tom qab zaug dhau los.",
    "receivingTitle": "Qhov chaw koj txais nyiaj",
    "receivingHint": "Thaum txog koj zaug, cov tswv cuab yuav xa nyiaj tuaj rau ntawm no. Muab ib tus account, ib daim QR, los yog ob qho.",
    "fBank": "Tsev txhab nyiaj",
    "fAccountName": "Npe account",
    "fAccountNumber": "Tus lej account",
    "fQr": "QR txais nyiaj",
    "fQrHint": "Daim duab QR ntawm koj lub tsev txhab nyiaj.",
    "keepQr": "Tso khoob cia los siv daim QR qub.",
    "submitCreate": "Tsim pab pawg",
    "creating": "Tab tom tsim…",
    "save": "Txuag",
    "saving": "Tab tom txuag…",
    "saved": "Txuag lawm.",
    "errName": "Muab ib lub npe rau pab pawg (tsawg kawg 3 tus ntawv).",
    "errAmount": "Sau tus nqi ua kip, piv txwv 100000.",
    "errPeriod": "Xaiv txhua lub lim tiam los yog txhua lub hlis.",
    "errStartDate": "Xaiv hnub no los yog hnub tom ntej.",
    "errReceiving": "Sau npe thiab tus lej account, los yog muab daim QR.",
    "errFile": "Siv duab JPG, PNG los yog WebP tsis pub tshaj 5 MB.",
    "errSlipFile": "Siv JPG, PNG, WebP los yog PDF tsis pub tshaj 5 MB.",
    "errState": "Muaj tej yam hloov txij thaum koj qhib nplooj no. Thov rov qhib dua thiab sim dua.",
    "joinMetaTitle": "Koom pab pawg txuag nyiaj",
    "joinTitle": "Koom pab pawg txuag nyiaj",
    "joinLede": "Sau tus code uas tus npaj muab rau koj.",
    "fCode": "Code pab pawg",
    "findGroup": "Nrhiav pab pawg",
    "errCode": "Tsis muaj pab pawg twg txais tswv cuab nrog tus code no. Thov nug tus npaj.",
    "errAlready": "Koj twb nyob hauv pab pawg no lawm los yog tab tom tos kev pom zoo.",
    "openGroup": "Qhib pab pawg",
    "joinAbout": "{organizer} yog tus npaj pab pawg no. {amount} {period}, twb muaj {n} tus.",
    "sendRequest": "Thov koom",
    "sending": "Tab tom xa…",
    "pendingTitle": "Tos tus npaj",
    "pendingBody": "{organizer} tau txais koj daim ntawv thov lawm. Koj yuav tau txais ntawv ceeb toom thaum txiav txim.",
    "inviteTitle": "Caw neeg",
    "inviteBody": "Qhia tus code los yog link no. Koj pom zoo txhua tus uas thov.",
    "copyLink": "Luam link",
    "copied": "Luam lawm",
    "requestsTitle": "Thov koom",
    "approve": "Pom zoo",
    "decline": "Tsis kam",
    "remove": "Tshem tawm",
    "orderTitle": "Leej twg tau thaum twg",
    "orderBody": "Zaug 1 yog tus thawj, thiab ua ntu zus mus. Kev teev yuav raug kaw thaum pab pawg pib.",
    "waitingStart": "Tus npaj yuav pib pab pawg thaum txhua tus koom tas. Txog thaum ntawd kev teev tseem hloov tau.",
    "moveUp": "Txav nce",
    "moveDown": "Txav nqis",
    "saveOrder": "Txuag kev teev",
    "shuffle": "Rho ntawv",
    "noReceiving": "Tseem tsis muaj qhov chaw txais nyiaj",
    "noClan": "Tsis muaj xeem",
    "edit": "Kho pab pawg",
    "startTitle": "Pib pab pawg",
    "startBody": "{n} tus tswv cuab, {rounds} zaug. Txhua zaug tau {pot}. Thaum pib lawm, tsis muaj leej twg koom tau thiab kev teev hloov tsis tau.",
    "start": "Pib tam sim no",
    "starting": "Tab tom pib…",
    "errTooFew": "Ib pab pawg yuav tsum muaj tsawg kawg 2 tus.",
    "errOrder": "Thov txuag kev teev ua ntej.",
    "errMissingReceiving": "Cov tswv cuab no tseem tsis muaj qhov chaw txais nyiaj: {names}",
    "errStartPast": "Hnub them zaug thawj dhau lawm. Thov kho pab pawg thiab xaiv hnub tshiab.",
    "cancelGroup": "Tso tseg pab pawg",
    "cancelConfirm": "Tso tseg pab pawg no rau txhua tus?",
    "cancelYes": "Yog, tso tseg",
    "keep": "Tsis txhob",
    "currentRound": "Zaug {n} ntawm {total}",
    "receives": "{name} tau {pot}",
    "due": "Them ua ntej {date}",
    "late": "Lig",
    "payTo": "Xa {amount} rau {name}",
    "youReceive": "Zaug no yog koj li. Koj yuav tau {pot}.",
    "youPaid": "Koj twb them zaug no lawm.",
    "waitingCheck": "Xa daim slip lawm. Tos {name} kuaj.",
    "fTransferDate": "Hnub xa nyiaj",
    "fSlip": "Daim slip xa nyiaj",
    "fSlipHint": "Duab los yog PDF ntawm tsev txhab nyiaj.",
    "sendSlip": "Xa daim slip",
    "slipSent": "Xa daim slip lawm. {name} yuav kuaj.",
    "errDate": "Sau hnub koj xa nyiaj.",
    "errSlip": "Muab daim duab slip xa nyiaj.",
    "rejectedNote": "Tsis lees txais: {note}",
    "paymentsTitle": "Kev them zaug no",
    "paidCount": "Tau {paid} ntawm {total}",
    "viewSlip": "Saib slip",
    "confirm": "Tau txais",
    "reject": "Tsis tau txais",
    "markCash": "Tau txais nyiaj ntsuab",
    "reason": "Vim li cas",
    "reasonPlaceholder": "Piv txwv: tus nqi tsis raug",
    "errReason": "Qhia vim li cas, kom nws kho tau.",
    "confirmedMsg": "Cim tias tau txais lawm.",
    "rejectedMsg": "Tau qhia nws xa dua lawm.",
    "cash": "Nyiaj ntsuab",
    "remind": "Ceeb toom cov tsis tau them",
    "reminded": "Xa ntawv ceeb toom rau {n} tus lawm.",
    "errRemindedToday": "Hnub no twb xa ntawv ceeb toom lawm.",
    "nobodyToRemind": "Txhua tus twb xa slip lawm.",
    "scheduleTitle": "Txhua zaug",
    "feeNote": "Thaum zaug no tiav, tus txais yuav tsum them nqi platform {pct}% ntawm cov nyiaj ({fee}).",
    "completedTitle": "Txhua tus tswv cuab tau txais lawv cov nyiaj lawm.",
    "myReceiving": "Kuv qhov chaw txais nyiaj",
    "cancelled": "Pab pawg no raug tso tseg lawm."
  }
```

- [ ] **Step 4: Verify that all three files parse and have identical key sets**

Run:
```bash
node -e "const f=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?f(v).map(x=>k+'.'+x):[k]);const [e,l,h]=['en','la','hm'].map(n=>new Set(f(require('./lib/i18n/'+n+'.json'))));for(const [n,s] of [['la',l],['hm',h]]){const miss=[...e].filter(k=>!s.has(k)),extra=[...s].filter(k=>!e.has(k));console.log(n,'missing',miss.length,'extra',extra.length,miss.concat(extra).filter(k=>/savings|Savings|colGroup/.test(k)).join(','))}"
```
Expected: `la missing 0 extra 0` and `hm missing 0 extra 0`. If the files already differed before this task, the counts may not be 0, but the list of savings-related keys printed at the end must be empty.

- [ ] **Step 5: Commit** (see Global Constraints about the user's existing edits in these files)

```bash
git add lib/i18n/en.json lib/i18n/la.json lib/i18n/hm.json
git commit -m "feat(savings): English, Lao and Hmong text for savings groups"
```

---

### Task 4: Read layer, notification types, file access

**Files:**
- Create: `lib/savings.ts`
- Modify: `lib/notify.ts` (the `NotificationType` union)
- Modify: `app/files/[id]/route.ts` (`canRead` and the header comment)

**Interfaces:**
- Consumes: the tables from Task 2.
- Produces (in `lib/savings.ts`):
  - Types `GroupStatus`, `SavingsPeriod`, `MemberStatus`, `RoundStatus` and `PaymentStatus`
  - `GroupRow`, `getGroup(id): Promise<GroupRow | null>` and `getFormingGroupByCode(code): Promise<GroupRow | null>`
  - `MyGroupRow` and `myGroups(userId): Promise<MyGroupRow[]>`
  - `myMembership(groupId, userId): Promise<MemberStatus | null>`
  - `MemberRow` and `listMembers(groupId): Promise<MemberRow[]>` (pending and approved only)
  - `RoundRow` and `listRounds(groupId): Promise<RoundRow[]>`
  - `PaymentRow` and `listPayments(roundId): Promise<PaymentRow[]>`
- Produces: 12 new `NotificationType` values (`savings_*`, matching the Task 3 keys).

- [ ] **Step 1: Create `lib/savings.ts`**

```ts
import "server-only";
import { query, queryOne } from "./db";

export type GroupStatus = "forming" | "active" | "completed" | "cancelled";
export type SavingsPeriod = "weekly" | "monthly";
export type MemberStatus = "pending" | "approved" | "declined" | "removed";
export type RoundStatus = "upcoming" | "collecting" | "done";
export type PaymentStatus = "unpaid" | "pending" | "confirmed" | "rejected";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GroupRow = {
  id: string;
  organizer_id: string;
  organizer_name: string;
  name: string;
  description: string | null;
  amount: string;
  period: SavingsPeriod;
  start_date: string; // YYYY-MM-DD
  invite_code: string;
  fee_percent: string | null;
  status: GroupStatus;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  members: string; // approved members
};

// Savings groups cross clans: access is decided by membership in the group, never by clan.
const GROUP_SELECT = `
  SELECT g.id, g.organizer_id, o.full_name AS organizer_name, g.name, g.description, g.amount, g.period,
         to_char(g.start_date, 'YYYY-MM-DD') AS start_date, g.invite_code, g.fee_percent, g.status,
         g.created_at, g.started_at, g.completed_at,
         (SELECT COUNT(*) FROM savings_members m WHERE m.group_id = g.id AND m.status = 'approved') AS members
    FROM savings_groups g JOIN users o ON o.id = g.organizer_id`;

/** The page checks the viewer's membership before showing anything beyond the name. */
export function getGroup(id: string) {
  if (!UUID.test(id)) return Promise.resolve(null);
  return queryOne<GroupRow>(`${GROUP_SELECT} WHERE g.id = $1`, [id]);
}

/** Only a group still taking members can be found by its code. */
export function getFormingGroupByCode(code: string) {
  return queryOne<GroupRow>(`${GROUP_SELECT} WHERE g.invite_code = $1 AND g.status = 'forming'`, [code]);
}

export type MyGroupRow = {
  id: string;
  name: string;
  amount: string;
  period: SavingsPeriod;
  status: GroupStatus;
  organizer_id: string;
  organizer_name: string;
  my_status: MemberStatus;
  my_turn: number | null;
  members: string;
  current_round: number | null;
};

/** Groups the person belongs to or has asked to join; finished ones last. */
export function myGroups(userId: string) {
  return query<MyGroupRow>(
    `SELECT g.id, g.name, g.amount, g.period, g.status, g.organizer_id, o.full_name AS organizer_name,
            me.status AS my_status, me.turn_no AS my_turn,
            (SELECT COUNT(*) FROM savings_members m WHERE m.group_id = g.id AND m.status = 'approved') AS members,
            (SELECT r.round_no FROM savings_rounds r WHERE r.group_id = g.id AND r.status = 'collecting') AS current_round
       FROM savings_members me
       JOIN savings_groups g ON g.id = me.group_id
       JOIN users o ON o.id = g.organizer_id
      WHERE me.user_id = $1 AND me.status IN ('pending', 'approved') AND g.status <> 'cancelled'
      ORDER BY (g.status = 'completed'), g.created_at DESC`,
    [userId],
  );
}

export async function myMembership(groupId: string, userId: string) {
  const r = await queryOne<{ status: MemberStatus }>(`SELECT status FROM savings_members WHERE group_id = $1 AND user_id = $2`, [groupId, userId]);
  return r?.status ?? null;
}

export type MemberRow = {
  id: string;
  user_id: string;
  full_name: string;
  clan_name: string | null;
  status: MemberStatus;
  turn_no: number | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  qr_file_id: string | null;
  joined_at: Date;
};

/** Approved members in turn order, then people waiting for approval. */
export function listMembers(groupId: string) {
  return query<MemberRow>(
    `SELECT m.id, m.user_id, u.full_name, c.name AS clan_name, m.status, m.turn_no,
            m.bank_name, m.account_name, m.account_number, m.qr_file_id, m.joined_at
       FROM savings_members m JOIN users u ON u.id = m.user_id LEFT JOIN clans c ON c.id = u.clan_id
      WHERE m.group_id = $1 AND m.status IN ('pending', 'approved')
      ORDER BY (m.status = 'pending'), m.turn_no NULLS LAST, m.joined_at`,
    [groupId],
  );
}

export type RoundRow = {
  id: string;
  round_no: number;
  due_date: string; // YYYY-MM-DD
  status: RoundStatus;
  last_reminder_at: Date | null;
  receiver_member_id: string;
  receiver_user_id: string;
  receiver_name: string;
  paid: string;
  total: string;
  pot: string;
};

export function listRounds(groupId: string) {
  return query<RoundRow>(
    `SELECT r.id, r.round_no, to_char(r.due_date, 'YYYY-MM-DD') AS due_date, r.status, r.last_reminder_at,
            r.receiver_member_id, m.user_id AS receiver_user_id, u.full_name AS receiver_name,
            COUNT(p.id) FILTER (WHERE p.status = 'confirmed') AS paid, COUNT(p.id) AS total,
            COALESCE(SUM(p.amount), 0) AS pot
       FROM savings_rounds r
       JOIN savings_members m ON m.id = r.receiver_member_id
       JOIN users u ON u.id = m.user_id
       LEFT JOIN savings_payments p ON p.round_id = r.id
      WHERE r.group_id = $1
      GROUP BY r.id, m.user_id, u.full_name
      ORDER BY r.round_no`,
    [groupId],
  );
}

export type PaymentRow = {
  id: string;
  payer_member_id: string;
  payer_user_id: string;
  payer_name: string;
  amount: string;
  status: PaymentStatus;
  slip_file_id: string | null;
  transfer_date: string | null;
  confirmed_without_slip: boolean;
  review_note: string | null;
};

/** Slips to check first. */
export function listPayments(roundId: string) {
  return query<PaymentRow>(
    `SELECT p.id, p.payer_member_id, m.user_id AS payer_user_id, u.full_name AS payer_name, p.amount, p.status,
            p.slip_file_id, to_char(p.transfer_date, 'YYYY-MM-DD') AS transfer_date, p.confirmed_without_slip, p.review_note
       FROM savings_payments p JOIN savings_members m ON m.id = p.payer_member_id JOIN users u ON u.id = m.user_id
      WHERE p.round_id = $1
      ORDER BY (p.status = 'pending') DESC, u.full_name`,
    [roundId],
  );
}
```

- [ ] **Step 2: Extend `NotificationType` in `lib/notify.ts`**

Replace the last line of the union, `  | "kyc_revoked";`, with:

```ts
  | "kyc_revoked"
  | "savings_join_request"
  | "savings_join_approved"
  | "savings_join_declined"
  | "savings_round_open"
  | "savings_your_turn"
  | "savings_slip_uploaded"
  | "savings_slip_confirmed"
  | "savings_slip_rejected"
  | "savings_reminder"
  | "savings_round_done"
  | "savings_completed"
  | "savings_cancelled";
```

- [ ] **Step 3: File access in `app/files/[id]/route.ts`**

In the header comment, add after the "transfer slips" line:

```ts
 *  - savings QR codes: approved members of the group; savings slips: the payer and that round's receiver
```

In `canRead`, insert directly **above** `// An upload with no clan came from a general user; only they can open it.`:

```ts
  // Savings groups cross clans, so their files are checked against the group, never a clan.
  if (file.purpose === "savings_qr") {
    if (file.uploaded_by === user.id) return true;
    const member = await queryOne(
      `SELECT 1 FROM savings_members owner
         JOIN savings_members viewer ON viewer.group_id = owner.group_id AND viewer.user_id = $2 AND viewer.status = 'approved'
        WHERE owner.qr_file_id = $1`,
      [fileId, user.id],
    );
    return Boolean(member);
  }
  if (file.purpose === "savings_slip") {
    if (file.uploaded_by === user.id) return true;
    const receiver = await queryOne(
      `SELECT 1 FROM savings_payments p
         JOIN savings_rounds r ON r.id = p.round_id
         JOIN savings_members m ON m.id = r.receiver_member_id
        WHERE p.slip_file_id = $1 AND m.user_id = $2`,
      [fileId, user.id],
    );
    return Boolean(receiver);
  }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/savings.ts lib/notify.ts "app/files/[id]/route.ts"
git commit -m "feat(savings): read queries, notification types and file access"
```

---

### Task 5: Server actions — group lifecycle

**Files:**
- Create: `app/actions/savings.ts`

**Interfaces:**
- Consumes:
  - Task 1 rules
  - `readUpload`, `parseKip`, `UUID_RE` and `feeFor`
  - `notify`, `notifyMany` and `direct`
  - `requireRole` and `DONOR_ROLES`
  - `getT` and `fmt`
- Produces (all exported from `app/actions/savings.ts`):
  - `createGroup(_s: FormState, fd: FormData): Promise<FormState>`. Fields: `name`, `description`, `amount`, `period`, `startDate`, `bankName`, `accountName`, `accountNumber` and `qr`. Redirects to `/savings/{id}`.
  - `updateGroup(_s, fd)`. Fields: `groupId` plus the group fields. Redirects to `/savings/{id}?saved=1`.
  - `cancelGroup(fd: FormData): Promise<void>`. Field: `groupId`. Redirects to `/savings`.
  - `requestToJoin(_s, fd)`. Fields: `code` plus the receiving fields. Redirects to `/savings/{id}`.
  - `decideMember(fd): Promise<void>`. Fields: `memberId` and `decision` (`approve` | `decline`).
  - `removeMember(fd): Promise<void>`. Field: `memberId`.
  - `saveOrder(_s, fd)`. Fields: `groupId` and `order` (comma-separated member ids).
  - `shuffleOrder(fd): Promise<void>`. Field: `groupId`.
  - `startGroup(_s, fd)`. Field: `groupId`.
  - `updateMyReceivingDetails(_s, fd)`. Fields: `groupId` plus the receiving fields.
  - Internal helpers, also used by Task 6 in the same file: `storeFile`, `audit`, `lockGroup` and `announceRound`.

- [ ] **Step 1: Create `app/actions/savings.ts` with the lifecycle actions**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { queryOne, transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { readUpload, type UploadCheck } from "@/lib/files";
import { feeFor, isPastDate, parseKip, UUID_RE } from "@/lib/funds";
import { formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { direct, notify, notifyMany } from "@/lib/notify";
import { canRemind, isCompleteOrder, isTodayOrLater, makeInviteCode, normalizeInviteCode, shuffled, todayInLaos } from "@/lib/savings-rules";
import { DONOR_ROLES, type FormState } from "@/lib/definitions";

const refresh = () => revalidatePath("/savings", "layout");

type Dict = Awaited<ReturnType<typeof getT>>["savings"];
type Db = Pick<PoolClient, "query">;

/** Savings files belong to no clan: who may open them is decided by the group (see app/files/[id]/route.ts). */
async function storeFile(db: PoolClient, userId: string, purpose: "savings_slip" | "savings_qr", upload: UploadCheck) {
  if (!upload.ok) return null;
  const r = await db.query<{ id: string }>(
    `INSERT INTO files (clan_id, uploaded_by, purpose, file_name, content_type, size_bytes, data)
     VALUES (NULL, $1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, purpose, upload.fileName, upload.contentType, upload.size, upload.data],
  );
  return r.rows[0].id;
}

async function audit(db: Db, actorId: string, action: string, targetId: string, details?: Record<string, unknown>) {
  await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id, details) VALUES (NULL, $1, $2, $3, $4)`, [
    actorId,
    action,
    targetId,
    details ? JSON.stringify(details) : null,
  ]);
}

type LockedGroup = { id: string; organizer_id: string; status: string; name: string; amount: string; period: string; start_date: string };

/** Every action that changes a group takes this lock first, so two people can't act on it at once. */
async function lockGroup(db: PoolClient, groupId: string) {
  const r = await db.query<LockedGroup>(
    `SELECT id, organizer_id, status, name, amount, period, to_char(start_date, 'YYYY-MM-DD') AS start_date
       FROM savings_groups WHERE id = $1 FOR UPDATE`,
    [groupId],
  );
  return r.rows[0] ?? null;
}

/** Where a member receives their pot: an account, a QR image, or both. */
async function readReceiving(formData: FormData, t: Dict, keepsQr = false) {
  const bankName = String(formData.get("bankName") ?? "").trim().slice(0, 100) || null;
  const accountName = String(formData.get("accountName") ?? "").trim().slice(0, 150) || null;
  const accountNumber = String(formData.get("accountNumber") ?? "").trim().slice(0, 50) || null;
  const qr = await readUpload(formData.get("qr"));
  const errors: Record<string, string[]> = {};
  // A QR is shown in an <img>, so a PDF is no use here.
  if ((!qr.ok && qr.reason !== "missing") || (qr.ok && qr.contentType === "application/pdf")) errors.qr = [t.errFile];
  else if (!(accountName && accountNumber) && !qr.ok && !keepsQr) errors.accountNumber = [t.errReceiving];
  return {
    errors,
    qr,
    fields: { bankName, accountName, accountNumber },
    values: { bankName: bankName ?? "", accountName: accountName ?? "", accountNumber: accountNumber ?? "" },
  };
}

function readGroupFields(formData: FormData, t: Dict) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const description = String(formData.get("description") ?? "").trim().slice(0, 1000) || null;
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = parseKip(amountRaw);
  const periodRaw = String(formData.get("period") ?? "");
  const period = periodRaw === "weekly" || periodRaw === "monthly" ? periodRaw : null;
  const startDate = String(formData.get("startDate") ?? "").trim();
  const errors: Record<string, string[]> = {};
  if (name.length < 3) errors.name = [t.errName];
  if (!amount) errors.amount = [t.errAmount];
  if (!period) errors.period = [t.errPeriod];
  if (!isTodayOrLater(startDate, todayInLaos())) errors.startDate = [t.errStartDate];
  return {
    errors,
    fields: { name, description, amount, period, startDate },
    values: { name, description: description ?? "", amount: amountRaw, period: periodRaw, startDate },
  };
}

/** Anyone signed in (not the platform owner) starts a group; they are its first member and take turn 1. */
export async function createGroup(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const group = readGroupFields(formData, t);
  const receiving = await readReceiving(formData, t);
  const values = { ...group.values, ...receiving.values };
  const errors = { ...group.errors, ...receiving.errors };
  if (Object.keys(errors).length) return { errors, values };
  const f = group.fields;
  const r = receiving.fields;

  const id = await transaction(async (db) => {
    let groupId: string | null = null;
    // A clash on the 6-character code is rare; try a few fresh codes before giving up.
    for (let i = 0; i < 5 && !groupId; i++) {
      const g = await db.query<{ id: string }>(
        `INSERT INTO savings_groups (organizer_id, name, description, amount, period, start_date, invite_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (invite_code) DO NOTHING RETURNING id`,
        [me.id, f.name, f.description, f.amount, f.period, f.startDate, makeInviteCode()],
      );
      groupId = g.rows[0]?.id ?? null;
    }
    if (!groupId) throw new Error("Could not create a unique invite code");
    const qrId = await storeFile(db, me.id, "savings_qr", receiving.qr);
    await db.query(
      `INSERT INTO savings_members (group_id, user_id, status, turn_no, bank_name, account_name, account_number, qr_file_id, decided_at)
       VALUES ($1, $2, 'approved', 1, $3, $4, $5, $6, now())`,
      [groupId, me.id, r.bankName, r.accountName, r.accountNumber, qrId],
    );
    await audit(db, me.id, "savings.created", groupId, { amount: f.amount, period: f.period });
    return groupId;
  });

  refresh();
  redirect(`/savings/${id}`);
}

/** The organizer changes the settings while the group is still forming. */
export async function updateGroup(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const groupId = String(formData.get("groupId") ?? "");
  const group = readGroupFields(formData, t);
  if (!UUID_RE.test(groupId)) return { message: t.errState, values: group.values };
  if (Object.keys(group.errors).length) return { errors: group.errors, values: group.values };
  const f = group.fields;

  const updated = await queryOne<{ id: string }>(
    `UPDATE savings_groups SET name = $3, description = $4, amount = $5, period = $6, start_date = $7
      WHERE id = $1 AND organizer_id = $2 AND status = 'forming' RETURNING id`,
    [groupId, me.id, f.name, f.description, f.amount, f.period, f.startDate],
  );
  if (!updated) return { message: t.errState, values: group.values };
  await audit(direct, me.id, "savings.updated", groupId);
  refresh();
  redirect(`/savings/${groupId}?saved=1`);
}

/** Only while forming: once money has moved, a group runs to the end. */
export async function cancelGroup(formData: FormData) {
  const me = await requireRole(...DONOR_ROLES);
  const groupId = String(formData.get("groupId") ?? "");
  if (!UUID_RE.test(groupId)) return;
  await transaction(async (db) => {
    const g = await lockGroup(db, groupId);
    if (!g || g.organizer_id !== me.id || g.status !== "forming") return;
    await db.query(`UPDATE savings_groups SET status = 'cancelled' WHERE id = $1`, [groupId]);
    const others = await db.query<{ user_id: string }>(
      `SELECT user_id FROM savings_members WHERE group_id = $1 AND status IN ('pending', 'approved') AND user_id <> $2`,
      [groupId, me.id],
    );
    await notifyMany(db, others.rows.map((x) => x.user_id), "savings_cancelled", { group: g.name }, "/savings");
    await audit(db, me.id, "savings.cancelled", groupId);
  });
  refresh();
  redirect("/savings");
}

/** Someone with the code asks to join. A person declined or removed earlier may ask again. */
export async function requestToJoin(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const code = normalizeInviteCode(String(formData.get("code") ?? ""));
  const receiving = await readReceiving(formData, t);
  if (!code) return { message: t.errCode, values: receiving.values };
  if (Object.keys(receiving.errors).length) return { errors: receiving.errors, values: receiving.values };
  const r = receiving.fields;

  const result = await transaction(async (db): Promise<{ ok: true; id: string } | { ok: false; state: FormState }> => {
    const g = (
      await db.query<{ id: string; organizer_id: string; name: string }>(
        `SELECT id, organizer_id, name FROM savings_groups WHERE invite_code = $1 AND status = 'forming' FOR UPDATE`,
        [code],
      )
    ).rows[0];
    if (!g) return { ok: false, state: { message: t.errCode, values: receiving.values } };
    const existing = (
      await db.query<{ id: string; status: string }>(`SELECT id, status FROM savings_members WHERE group_id = $1 AND user_id = $2`, [g.id, me.id])
    ).rows[0];
    if (existing && (existing.status === "pending" || existing.status === "approved")) {
      return { ok: false, state: { message: t.errAlready, values: receiving.values } };
    }
    const qrId = await storeFile(db, me.id, "savings_qr", receiving.qr);
    if (existing) {
      await db.query(
        `UPDATE savings_members SET status = 'pending', turn_no = NULL, bank_name = $2, account_name = $3, account_number = $4,
                qr_file_id = $5, joined_at = now(), decided_at = NULL
          WHERE id = $1`,
        [existing.id, r.bankName, r.accountName, r.accountNumber, qrId],
      );
    } else {
      await db.query(
        `INSERT INTO savings_members (group_id, user_id, bank_name, account_name, account_number, qr_file_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [g.id, me.id, r.bankName, r.accountName, r.accountNumber, qrId],
      );
    }
    await audit(db, me.id, "savings.join_requested", g.id);
    await notify(db, g.organizer_id, "savings_join_request", { name: me.fullName, group: g.name }, `/savings/${g.id}`);
    return { ok: true, id: g.id };
  });

  if (!result.ok) return result.state;
  refresh();
  redirect(`/savings/${result.id}`);
}

/** The organizer approves (they get the next turn) or declines a request. */
export async function decideMember(formData: FormData) {
  const me = await requireRole(...DONOR_ROLES);
  const memberId = String(formData.get("memberId") ?? "");
  const approve = formData.get("decision") === "approve";
  if (!UUID_RE.test(memberId)) return;
  await transaction(async (db) => {
    const m = (
      await db.query<{ group_id: string; user_id: string; group_name: string }>(
        `SELECT m.group_id, m.user_id, g.name AS group_name
           FROM savings_members m JOIN savings_groups g ON g.id = m.group_id
          WHERE m.id = $1 AND m.status = 'pending' AND g.organizer_id = $2 AND g.status = 'forming'
          FOR UPDATE OF g, m`,
        [memberId, me.id],
      )
    ).rows[0];
    if (!m) return;
    if (approve) {
      await db.query(
        `UPDATE savings_members SET status = 'approved', decided_at = now(),
                turn_no = (SELECT COALESCE(MAX(turn_no), 0) + 1 FROM savings_members WHERE group_id = $2)
          WHERE id = $1`,
        [memberId, m.group_id],
      );
    } else {
      await db.query(`UPDATE savings_members SET status = 'declined', decided_at = now(), turn_no = NULL WHERE id = $1`, [memberId]);
    }
    await audit(db, me.id, approve ? "savings.member_approved" : "savings.member_declined", memberId);
    await notify(
      db,
      m.user_id,
      approve ? "savings_join_approved" : "savings_join_declined",
      { group: m.group_name },
      approve ? `/savings/${m.group_id}` : "/savings",
    );
  });
  refresh();
}

/** Closes the gaps in the turn numbers after someone leaves the order. */
async function renumber(db: PoolClient, groupId: string) {
  await db.query(
    `UPDATE savings_members m SET turn_no = x.rn
       FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY turn_no NULLS LAST, joined_at) AS rn
               FROM savings_members WHERE group_id = $1 AND status = 'approved') x
      WHERE m.id = x.id`,
    [groupId],
  );
}

/** Takes an approved member out while forming. The organizer cannot remove themself. */
export async function removeMember(formData: FormData) {
  const me = await requireRole(...DONOR_ROLES);
  const memberId = String(formData.get("memberId") ?? "");
  if (!UUID_RE.test(memberId)) return;
  await transaction(async (db) => {
    const m = (
      await db.query<{ group_id: string }>(
        `SELECT m.group_id FROM savings_members m JOIN savings_groups g ON g.id = m.group_id
          WHERE m.id = $1 AND m.status = 'approved' AND m.user_id <> $2 AND g.organizer_id = $2 AND g.status = 'forming'
          FOR UPDATE OF g, m`,
        [memberId, me.id],
      )
    ).rows[0];
    if (!m) return;
    await db.query(`UPDATE savings_members SET status = 'removed', turn_no = NULL, decided_at = now() WHERE id = $1`, [memberId]);
    await renumber(db, m.group_id);
    await audit(db, me.id, "savings.member_removed", memberId);
  });
  refresh();
}

/** Writes turn numbers 1..n in the given order; `ids` must be exactly the approved members. */
async function applyOrder(db: PoolClient, groupId: string, ids: string[]) {
  const current = (await db.query<{ id: string }>(`SELECT id FROM savings_members WHERE group_id = $1 AND status = 'approved'`, [groupId])).rows.map(
    (x) => x.id,
  );
  const same = ids.length === current.length && new Set(ids).size === ids.length && current.every((id) => ids.includes(id));
  if (!same) return false;
  await db.query(
    `UPDATE savings_members m SET turn_no = o.n::int
       FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, n)
      WHERE m.id = o.id AND m.group_id = $1`,
    [groupId, ids],
  );
  return true;
}

export async function saveOrder(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const groupId = String(formData.get("groupId") ?? "");
  const ids = String(formData.get("order") ?? "").split(",").filter(Boolean);
  if (!UUID_RE.test(groupId) || !ids.every((id) => UUID_RE.test(id))) return { message: t.errState };
  const ok = await transaction(async (db) => {
    const g = await lockGroup(db, groupId);
    if (!g || g.organizer_id !== me.id || g.status !== "forming") return false;
    const applied = await applyOrder(db, groupId, ids);
    if (applied) await audit(db, me.id, "savings.order_saved", groupId);
    return applied;
  });
  if (!ok) return { message: t.errState };
  refresh();
  return { success: t.saved };
}

/** A random draw, for groups that want luck to decide. */
export async function shuffleOrder(formData: FormData) {
  const me = await requireRole(...DONOR_ROLES);
  const groupId = String(formData.get("groupId") ?? "");
  if (!UUID_RE.test(groupId)) return;
  await transaction(async (db) => {
    const g = await lockGroup(db, groupId);
    if (!g || g.organizer_id !== me.id || g.status !== "forming") return;
    const ids = (await db.query<{ id: string }>(`SELECT id FROM savings_members WHERE group_id = $1 AND status = 'approved'`, [groupId])).rows.map(
      (x) => x.id,
    );
    await applyOrder(db, groupId, shuffled(ids));
    await audit(db, me.id, "savings.order_shuffled", groupId);
  });
  refresh();
}

/** Tells the round's payers who to pay, and the receiver that it is their turn. */
async function announceRound(db: PoolClient, groupId: string, roundNo: number) {
  const r = (
    await db.query<{ id: string; receiver_user_id: string; receiver_name: string; group_name: string; amount: string; pot: string }>(
      `SELECT r.id, m.user_id AS receiver_user_id, u.full_name AS receiver_name, g.name AS group_name, g.amount,
              (SELECT COALESCE(SUM(p.amount), 0) FROM savings_payments p WHERE p.round_id = r.id) AS pot
         FROM savings_rounds r
         JOIN savings_groups g ON g.id = r.group_id
         JOIN savings_members m ON m.id = r.receiver_member_id
         JOIN users u ON u.id = m.user_id
        WHERE r.group_id = $1 AND r.round_no = $2`,
      [groupId, roundNo],
    )
  ).rows[0];
  if (!r) return;
  const payers = await db.query<{ user_id: string }>(
    `SELECT m.user_id FROM savings_payments p JOIN savings_members m ON m.id = p.payer_member_id WHERE p.round_id = $1`,
    [r.id],
  );
  const link = `/savings/${groupId}`;
  await notifyMany(
    db,
    payers.rows.map((x) => x.user_id),
    "savings_round_open",
    { group: r.group_name, round: roundNo, receiver: r.receiver_name, amount: formatKip(r.amount) },
    link,
  );
  await notify(db, r.receiver_user_id, "savings_your_turn", { group: r.group_name, round: roundNo, pot: formatKip(r.pot) }, link);
}

/** Locks the order, creates every round and payment, and opens round 1. */
export async function startGroup(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const groupId = String(formData.get("groupId") ?? "");
  if (!UUID_RE.test(groupId)) return { message: t.errState };

  const result = await transaction(async (db): Promise<FormState> => {
    const g = await lockGroup(db, groupId);
    if (!g || g.organizer_id !== me.id || g.status !== "forming") return { message: t.errState };
    if (!isTodayOrLater(g.start_date, todayInLaos())) return { message: t.errStartPast };

    const members = (
      await db.query<{ id: string; turn_no: number | null; full_name: string; can_receive: boolean }>(
        `SELECT m.id, m.turn_no, u.full_name,
                ((m.account_name IS NOT NULL AND m.account_number IS NOT NULL) OR m.qr_file_id IS NOT NULL) AS can_receive
           FROM savings_members m JOIN users u ON u.id = m.user_id
          WHERE m.group_id = $1 AND m.status = 'approved'`,
        [groupId],
      )
    ).rows;
    if (members.length < 2) return { message: t.errTooFew };
    if (!isCompleteOrder(members.map((m) => m.turn_no))) return { message: t.errOrder };
    const missing = members.filter((m) => !m.can_receive).map((m) => m.full_name);
    if (missing.length) return { message: fmt(t.errMissingReceiving, { names: missing.join(", ") }) };

    const fee = (await db.query<{ p: string }>(`SELECT savings_fee_percent AS p FROM platform_settings WHERE id = 1`)).rows[0]?.p ?? "1.00";

    // Round k goes to the member with turn k, due k-1 periods after the start date.
    await db.query(
      `INSERT INTO savings_rounds (group_id, round_no, receiver_member_id, due_date, status, opened_at)
       SELECT $1, m.turn_no, m.id,
              CASE WHEN $2 = 'weekly' THEN $3::date + (m.turn_no - 1) * 7
                   ELSE ($3::date + (m.turn_no - 1) * interval '1 month')::date END,
              CASE WHEN m.turn_no = 1 THEN 'collecting'::savings_round_status ELSE 'upcoming'::savings_round_status END,
              CASE WHEN m.turn_no = 1 THEN now() END
         FROM savings_members m WHERE m.group_id = $1 AND m.status = 'approved'`,
      [groupId, g.period, g.start_date],
    );
    // Everyone pays every round except the one they receive.
    await db.query(
      `INSERT INTO savings_payments (round_id, payer_member_id, amount)
       SELECT r.id, m.id, $2
         FROM savings_rounds r
         JOIN savings_members m ON m.group_id = r.group_id AND m.status = 'approved' AND m.id <> r.receiver_member_id
        WHERE r.group_id = $1`,
      [groupId, g.amount],
    );
    await db.query(`UPDATE savings_groups SET status = 'active', fee_percent = $2, started_at = now() WHERE id = $1`, [groupId, fee]);

    // Requests still waiting can no longer be approved.
    const late = await db.query<{ user_id: string }>(
      `UPDATE savings_members SET status = 'declined', decided_at = now() WHERE group_id = $1 AND status = 'pending' RETURNING user_id`,
      [groupId],
    );
    await notifyMany(db, late.rows.map((x) => x.user_id), "savings_join_declined", { group: g.name }, "/savings");

    await audit(db, me.id, "savings.started", groupId, { members: members.length, fee_percent: fee });
    await announceRound(db, groupId, 1);
    return { success: "ok" };
  });

  if (result?.success) refresh();
  return result;
}

/** A member changes where they receive, until their own round has opened. */
export async function updateMyReceivingDetails(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const groupId = String(formData.get("groupId") ?? "");
  if (!UUID_RE.test(groupId)) return { message: t.errState };

  const current = await queryOne<{ id: string; qr_file_id: string | null; group_status: string; my_round_status: string | null }>(
    `SELECT m.id, m.qr_file_id, g.status AS group_status,
            (SELECT r.status FROM savings_rounds r WHERE r.receiver_member_id = m.id) AS my_round_status
       FROM savings_members m JOIN savings_groups g ON g.id = m.group_id
      WHERE m.group_id = $1 AND m.user_id = $2 AND m.status = 'approved'`,
    [groupId, me.id],
  );
  const editable =
    current && (current.group_status === "forming" || (current.group_status === "active" && current.my_round_status === "upcoming"));
  if (!current || !editable) return { message: t.errState };

  const receiving = await readReceiving(formData, t, Boolean(current.qr_file_id));
  if (Object.keys(receiving.errors).length) return { errors: receiving.errors, values: receiving.values };
  const r = receiving.fields;

  await transaction(async (db) => {
    const qrId = await storeFile(db, me.id, "savings_qr", receiving.qr);
    await db.query(
      `UPDATE savings_members SET bank_name = $2, account_name = $3, account_number = $4, qr_file_id = COALESCE($5, qr_file_id)
        WHERE id = $1`,
      [current.id, r.bankName, r.accountName, r.accountNumber, qrId],
    );
    await audit(db, me.id, "savings.receiving_updated", current.id);
  });
  refresh();
  return { success: t.saved, values: receiving.values };
}
```

(`feeFor`, `isPastDate` and `canRemind` are imported now because Task 6 adds the code that uses them to this file. Until then, `npm run lint` may warn that they're unused. That's fine.)

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` and then `npm run lint`
Expected: no type errors. Lint shows at most unused-import warnings for `feeFor`, `isPastDate` and `canRemind`.

- [ ] **Step 3: Commit**

```bash
git add app/actions/savings.ts
git commit -m "feat(savings): actions to create, join, order and start a group"
```

---

### Task 6: Server actions — payments, round completion, fee

**Files:**
- Modify: `app/actions/savings.ts` (append)

**Interfaces:**
- Consumes: `storeFile`, `audit`, `announceRound`, `feeFor`, `isPastDate` and `canRemind` from Task 5's file.
- Produces:
  - `uploadSlip(_s, fd)`. Fields: `paymentId`, `transferDate` and `slip`. Returns `{ success }`.
  - `reviewPayment(_s, fd)`. Fields: `paymentId`, `decision` (`confirm` | `reject` | `cash`) and `note`.
  - `remindUnpaid(_s, fd)`. Field: `groupId`.

- [ ] **Step 1: Append to `app/actions/savings.ts`**

```ts
/** A payer records the transfer they made to this round's receiver. */
export async function uploadSlip(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const paymentId = String(formData.get("paymentId") ?? "");
  const transferDate = String(formData.get("transferDate") ?? "");
  const values = { transferDate };
  if (!UUID_RE.test(paymentId)) return { message: t.errState, values };

  const errors: Record<string, string[]> = {};
  if (!isPastDate(transferDate)) errors.transferDate = [t.errDate];
  const slip = await readUpload(formData.get("slip"));
  if (!slip.ok) errors.slip = [slip.reason === "missing" ? t.errSlip : t.errSlipFile];
  if (Object.keys(errors).length) return { errors, values };

  const result = await transaction(async (db): Promise<FormState> => {
    const p = (
      await db.query<{ status: string; round_status: string; group_id: string; group_name: string; amount: string; receiver_user_id: string; receiver_name: string }>(
        `SELECT p.status, r.status AS round_status, r.group_id, g.name AS group_name, p.amount,
                rm.user_id AS receiver_user_id, ru.full_name AS receiver_name
           FROM savings_payments p
           JOIN savings_members pm ON pm.id = p.payer_member_id
           JOIN savings_rounds r ON r.id = p.round_id
           JOIN savings_groups g ON g.id = r.group_id
           JOIN savings_members rm ON rm.id = r.receiver_member_id
           JOIN users ru ON ru.id = rm.user_id
          WHERE p.id = $1 AND pm.user_id = $2
          FOR UPDATE OF p`,
        [paymentId, me.id],
      )
    ).rows[0];
    if (!p || p.round_status !== "collecting" || !(p.status === "unpaid" || p.status === "rejected")) return { message: t.errState, values };

    const slipId = await storeFile(db, me.id, "savings_slip", slip);
    await db.query(
      `UPDATE savings_payments SET status = 'pending', slip_file_id = $2, transfer_date = $3, submitted_at = now(),
              review_note = NULL, reviewed_at = NULL
        WHERE id = $1`,
      [paymentId, slipId, transferDate],
    );
    await audit(db, me.id, "savings.slip_uploaded", paymentId);
    await notify(db, p.receiver_user_id, "savings_slip_uploaded", { name: me.fullName, amount: formatKip(p.amount), group: p.group_name }, `/savings/${p.group_id}`);
    return { success: fmt(t.slipSent, { name: p.receiver_name }) };
  });

  if (result?.success) refresh();
  return result;
}

/**
 * When every payment of the round is confirmed: closes it, records the receiver's fee, and opens
 * the next round, or finishes the group after the last one. Runs inside the caller's transaction,
 * which already holds the group lock.
 */
async function completeRoundIfPaid(db: PoolClient, roundId: string) {
  const left = (await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM savings_payments WHERE round_id = $1 AND status <> 'confirmed'`, [roundId]))
    .rows[0].n;
  if (Number(left) > 0) return;

  const r = (
    await db.query<{ group_id: string; round_no: number; group_name: string; fee_percent: string | null; receiver_user_id: string; pot: string }>(
      `UPDATE savings_rounds r SET status = 'done', done_at = now()
         FROM savings_groups g, savings_members m
        WHERE r.id = $1 AND r.status = 'collecting' AND g.id = r.group_id AND m.id = r.receiver_member_id
        RETURNING r.group_id, r.round_no, g.name AS group_name, g.fee_percent, m.user_id AS receiver_user_id,
                  (SELECT COALESCE(SUM(p.amount), 0) FROM savings_payments p WHERE p.round_id = r.id) AS pot`,
      [roundId],
    )
  ).rows[0];
  if (!r) return; // already closed by someone else

  const pot = Number(r.pot);
  const percent = r.fee_percent ?? "0";
  const fee = feeFor(pot, percent);
  await db.query(
    `INSERT INTO savings_fees (round_id, payer_user_id, percent, base_amount, fee_amount)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (round_id) DO NOTHING`,
    [roundId, r.receiver_user_id, percent, pot, fee],
  );
  const link = `/savings/${r.group_id}`;
  await notify(db, r.receiver_user_id, "savings_round_done", { group: r.group_name, round: r.round_no, pot: formatKip(pot), fee: formatKip(fee) }, link);

  const next = await db.query(
    `UPDATE savings_rounds SET status = 'collecting', opened_at = now() WHERE group_id = $1 AND round_no = $2 AND status = 'upcoming'`,
    [r.group_id, r.round_no + 1],
  );
  if (next.rowCount) {
    await announceRound(db, r.group_id, r.round_no + 1);
    return;
  }
  await db.query(`UPDATE savings_groups SET status = 'completed', completed_at = now() WHERE id = $1`, [r.group_id]);
  const everyone = await db.query<{ user_id: string }>(`SELECT user_id FROM savings_members WHERE group_id = $1 AND status = 'approved'`, [r.group_id]);
  await notifyMany(db, everyone.rows.map((x) => x.user_id), "savings_completed", { group: r.group_name }, link);
}

/**
 * The round's receiver decides: `confirm` or `reject` a slip, or `cash` for money handed over in
 * person (no slip needed).
 */
export async function reviewPayment(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const paymentId = String(formData.get("paymentId") ?? "");
  const decisionRaw = String(formData.get("decision") ?? "");
  const decision = decisionRaw === "confirm" || decisionRaw === "reject" || decisionRaw === "cash" ? decisionRaw : null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  if (!UUID_RE.test(paymentId) || !decision) return { message: t.errState };
  if (decision === "reject" && !note) return { errors: { note: [t.errReason] } };

  const result = await transaction(async (db): Promise<FormState> => {
    const p = (
      await db.query<{ status: string; round_id: string; round_status: string; amount: string; group_id: string; group_name: string; payer_user_id: string }>(
        `SELECT p.status, p.round_id, r.status AS round_status, p.amount, r.group_id, g.name AS group_name, pm.user_id AS payer_user_id
           FROM savings_payments p
           JOIN savings_rounds r ON r.id = p.round_id
           JOIN savings_groups g ON g.id = r.group_id
           JOIN savings_members rm ON rm.id = r.receiver_member_id
           JOIN savings_members pm ON pm.id = p.payer_member_id
          WHERE p.id = $1 AND rm.user_id = $2
          FOR UPDATE OF g, r, p`,
        [paymentId, me.id],
      )
    ).rows[0];
    if (!p || p.round_status !== "collecting") return { message: t.errState };
    const allowed = decision === "cash" ? p.status === "unpaid" || p.status === "rejected" : p.status === "pending";
    if (!allowed) return { message: t.errState };

    if (decision === "reject") {
      await db.query(`UPDATE savings_payments SET status = 'rejected', review_note = $2, reviewed_at = now() WHERE id = $1`, [paymentId, note]);
    } else {
      await db.query(
        `UPDATE savings_payments SET status = 'confirmed', review_note = NULL, reviewed_at = now(),
                confirmed_without_slip = $2
          WHERE id = $1`,
        [paymentId, decision === "cash"],
      );
    }
    await audit(db, me.id, `savings.payment_${decision}`, paymentId);
    const link = `/savings/${p.group_id}`;
    if (decision === "reject") {
      await notify(db, p.payer_user_id, "savings_slip_rejected", { name: me.fullName, group: p.group_name, note: note ?? "" }, link);
    } else {
      await notify(db, p.payer_user_id, "savings_slip_confirmed", { name: me.fullName, amount: formatKip(p.amount), group: p.group_name }, link);
      await completeRoundIfPaid(db, p.round_id);
    }
    return { success: decision === "reject" ? t.rejectedMsg : t.confirmedMsg };
  });

  if (result?.success) refresh();
  return result;
}

/** The organizer nudges everyone who has not sent a slip for the current round (once a day). */
export async function remindUnpaid(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const groupId = String(formData.get("groupId") ?? "");
  if (!UUID_RE.test(groupId)) return { message: t.errState };

  return transaction(async (db): Promise<FormState> => {
    const r = (
      await db.query<{ id: string; round_no: number; last_reminder_at: Date | null; group_name: string; amount: string; receiver_name: string }>(
        `SELECT r.id, r.round_no, r.last_reminder_at, g.name AS group_name, g.amount, u.full_name AS receiver_name
           FROM savings_rounds r
           JOIN savings_groups g ON g.id = r.group_id
           JOIN savings_members m ON m.id = r.receiver_member_id
           JOIN users u ON u.id = m.user_id
          WHERE r.group_id = $1 AND r.status = 'collecting' AND g.organizer_id = $2
          FOR UPDATE OF r`,
        [groupId, me.id],
      )
    ).rows[0];
    if (!r) return { message: t.errState };
    if (!canRemind(r.last_reminder_at, new Date())) return { message: t.errRemindedToday };

    const unpaid = await db.query<{ user_id: string }>(
      `SELECT m.user_id FROM savings_payments p JOIN savings_members m ON m.id = p.payer_member_id
        WHERE p.round_id = $1 AND p.status IN ('unpaid', 'rejected')`,
      [r.id],
    );
    if (unpaid.rows.length === 0) return { message: t.nobodyToRemind };
    await notifyMany(
      db,
      unpaid.rows.map((x) => x.user_id),
      "savings_reminder",
      { group: r.group_name, round: r.round_no, receiver: r.receiver_name, amount: formatKip(r.amount) },
      `/savings/${groupId}`,
    );
    await db.query(`UPDATE savings_rounds SET last_reminder_at = now() WHERE id = $1`, [r.id]);
    return { success: fmt(t.reminded, { n: unpaid.rows.length }) };
  });
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit` and then `npm run lint`
Expected: no errors and no unused-import warnings.

- [ ] **Step 3: Commit**

```bash
git add app/actions/savings.ts
git commit -m "feat(savings): slips, receiver review, round completion and platform fee"
```

---

### Task 7: Navigation, layout, list, create and join pages

**Files:**
- Modify: `lib/navigation.ts`, `components/area-nav.tsx`, `proxy.ts`
- Create:
  - `app/savings/layout.tsx`
  - `app/savings/page.tsx`
  - `app/savings/receiving-fields.tsx`
  - `app/savings/group-form.tsx`
  - `app/savings/new/page.tsx`
  - `app/savings/join/page.tsx`
  - `app/savings/join/join-form.tsx`
  - `app/savings/[id]/edit/page.tsx`

**Interfaces:**
- Consumes:
  - From Task 4: `myGroups`, `getGroup`, `getFormingGroupByCode` and `myMembership`
  - From Task 5: `createGroup`, `updateGroup` and `requestToJoin`
  - From Task 1: `normalizeInviteCode`
- Produces:
  - `ReceivingFields({ values?, errors?, hasQr? })` and the `ReceivingValues` type, from `app/savings/receiving-fields.tsx`
  - `GroupForm({ initial? })` and the `GroupInitial` type, from `app/savings/group-form.tsx`

- [ ] **Step 1: Navigation**

In `components/area-nav.tsx`, change `icon: "fund" | "donations";` to `icon: "fund" | "donations" | "savings";`. Then add this to `AreaIcon`, before the `if (name === "donations")` block:

```tsx
  if (name === "savings") {
    return (
      <svg {...common}>
        <ellipse cx="12" cy="6.5" rx="7" ry="2.75" />
        <path d="M5 6.5v5c0 1.5 3.1 2.75 7 2.75s7-1.25 7-2.75v-5" />
        <path d="M5 11.5v5c0 1.5 3.1 2.75 7 2.75s7-1.25 7-2.75v-5" />
      </svg>
    );
  }
```

In `lib/navigation.ts`:
- In the header comment, change "The product is two areas" to "The product is three areas". Add a bullet: ` *  - **savings groups**, which belong to whoever is in them, from any clan or none;`.
- After the `donations` constant, add:

```ts
  const savings: NavArea = {
    href: "/savings",
    label: t.nav.areaSavings,
    note: t.nav.areaSavingsNote,
    icon: "savings",
    owns: [],
    sections: [],
  };
```

- Change `if (user.role === "user") return [donations];` to `if (user.role === "user") return [donations, savings];`. Change the comment above it to: `// A general user belongs to no clan, so donations and savings groups are what they have.`
- In the `clan_admin` return and in the final member return, add `savings` after `donations`. Leave the `super_admin` return unchanged.

In `proxy.ts` change:
```ts
const SIGNED_IN = ["/account", "/files", "/donations", "/notifications"];
```
to
```ts
const SIGNED_IN = ["/account", "/files", "/donations", "/savings", "/notifications"];
```

- [ ] **Step 2: `app/savings/layout.tsx`**

```tsx
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";

// Savings groups mix people from any clan, or none. The platform owner runs the system and is not in them.
export default async function SavingsLayout({ children }: LayoutProps<"/savings">) {
  const user = await requireRole(...DONOR_ROLES);
  return <AppShell user={user}>{children}</AppShell>;
}
```

- [ ] **Step 3: `app/savings/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { buttonPrimary, buttonQuiet } from "@/components/button-styles";
import { UsersIcon } from "@/components/icons";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";
import { formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { myGroups } from "@/lib/savings";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).savings.metaTitle };
}

const GROUP_TONE = { forming: "warn", active: "info", completed: "ok", cancelled: "mute" } as const;

export default async function SavingsPage() {
  const me = await requireRole(...DONOR_ROLES);
  const [t, groups] = await Promise.all([getT(), myGroups(me.id)]);
  const s = t.savings;

  return (
    <>
      <PageHeading title={s.title} lede={s.lede}>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/savings/join" className={buttonQuiet}>
            {s.join}
          </Link>
          <Link href="/savings/new" className={buttonPrimary}>
            <UsersIcon width={18} height={18} />
            {s.create}
          </Link>
        </div>
      </PageHeading>

      <div className="mt-8">
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <p className="font-medium text-ink">{s.empty}</p>
            <p className="mt-1 text-sm text-ink-soft">{s.emptyBody}</p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/savings/${g.id}`}
                  className="flex h-full flex-col rounded-xl border border-line bg-surface p-5 transition-[border-color,box-shadow] hover:border-brand-bright/40 hover:shadow-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-xl text-brand-deep">{g.name}</h2>
                    {g.my_status === "pending" ? (
                      <Pill tone="warn">{s.waitingApproval}</Pill>
                    ) : (
                      <Pill tone={GROUP_TONE[g.status]}>{s.groupStatus[g.status]}</Pill>
                    )}
                  </div>
                  <p className="tabular mt-1 text-sm text-ink-soft">
                    {formatKip(g.amount)} {s.period[g.period]} · {fmt(s.membersCount, { n: g.members })}
                  </p>
                  <p className="mt-auto pt-3 text-sm text-ink-soft">
                    {g.organizer_id === me.id ? s.organizing : fmt(s.organizedBy, { name: g.organizer_name })}
                    {g.current_round !== null && <> · {fmt(s.roundOf, { n: g.current_round, total: g.members })}</>}
                    {g.my_status === "approved" && g.my_turn !== null && g.status !== "completed" && <> · {fmt(s.yourTurn, { n: g.my_turn })}</>}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: `app/savings/receiving-fields.tsx`**

```tsx
"use client";

import { useT } from "@/components/i18n-provider";
import { Field, FileField } from "@/components/ui";

export type ReceivingValues = { bankName?: string; accountName?: string; accountNumber?: string };

/** Where a member receives their pot: an account, a QR photo, or both. Used when creating, joining and editing. */
export function ReceivingFields({
  values,
  errors,
  hasQr,
}: {
  values?: ReceivingValues;
  errors?: Record<string, string[] | undefined>;
  hasQr?: boolean;
}) {
  const tt = useT();
  const s = tt.savings;
  return (
    <fieldset className="rounded-lg border border-line bg-paper/60 p-4">
      <legend className="px-1 text-sm font-semibold text-brand">{s.receivingTitle}</legend>
      <p className="mb-4 text-sm text-ink-soft">{s.receivingHint}</p>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={s.fBank} name="bankName" optional defaultValue={values?.bankName} placeholder="BCEL" />
          <Field label={s.fAccountName} name="accountName" optional defaultValue={values?.accountName} />
        </div>
        <Field
          label={s.fAccountNumber}
          name="accountNumber"
          optional
          inputMode="numeric"
          defaultValue={values?.accountNumber}
          errors={errors?.accountNumber}
          className="[&_input]:tabular-nums"
        />
        <FileField
          label={s.fQr}
          name="qr"
          accept="image/jpeg,image/png,image/webp"
          hint={hasQr ? s.keepQr : s.fQrHint}
          errors={errors?.qr}
          chooseLabel={tt.common.chooseFile}
        />
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 5: `app/savings/group-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { createGroup, updateGroup } from "@/app/actions/savings";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SelectField, SubmitButton, TextAreaField } from "@/components/ui";
import { ReceivingFields } from "./receiving-fields";

export type GroupInitial = {
  id: string;
  name: string;
  description: string;
  amount: string;
  period: "weekly" | "monthly";
  startDate: string;
};

/** Used for "Start a group" and for editing one while it is still forming. */
export function GroupForm({ initial }: { initial?: GroupInitial }) {
  const [state, action] = useActionState(initial ? updateGroup : createGroup, undefined);
  const s = useT().savings;
  const v = state?.values;
  const e = state?.errors;
  const today = new Date().toISOString().slice(0, 10);
  const val = (key: keyof GroupInitial) => v?.[key] ?? (initial ? String(initial[key]) : undefined);

  return (
    <form action={action} className="space-y-5" noValidate>
      {initial && <input type="hidden" name="groupId" value={initial.id} />}
      {state?.message && <Notice tone="error">{state.message}</Notice>}

      <Field label={s.fName} name="name" placeholder={s.fNamePlaceholder} defaultValue={val("name")} errors={e?.name} maxLength={100} />
      <TextAreaField label={s.fDescription} name="description" optional defaultValue={val("description")} maxLength={1000} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={s.fAmount} name="amount" inputMode="numeric" defaultValue={val("amount")} errors={e?.amount} className="[&_input]:tabular-nums" />
        <SelectField
          label={s.fPeriod}
          name="period"
          defaultValue={val("period") ?? "monthly"}
          errors={e?.period}
          options={[
            { value: "monthly", label: s.periodLabel.monthly },
            { value: "weekly", label: s.periodLabel.weekly },
          ]}
        />
      </div>
      <Field label={s.fStartDate} name="startDate" type="date" min={today} hint={s.fStartDateHint} defaultValue={val("startDate")} errors={e?.startDate} />

      {!initial && <ReceivingFields values={v} errors={e} />}

      <SubmitButton pendingLabel={initial ? s.saving : s.creating} className="w-full">
        {initial ? s.save : s.submitCreate}
      </SubmitButton>
    </form>
  );
}
```

- [ ] **Step 6: `app/savings/new/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";
import { GroupForm } from "../group-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).savings.newMetaTitle };
}

export default async function NewSavingsGroupPage() {
  await requireRole(...DONOR_ROLES);
  const s = (await getT()).savings;
  return (
    <>
      <Link href="/savings" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {s.back}
      </Link>
      <div className="mt-3">
        <PageHeading title={s.newTitle} lede={s.newLede} />
      </div>
      <div className="mt-8 max-w-2xl rounded-xl border border-line bg-surface p-5 sm:p-6">
        <GroupForm />
      </div>
    </>
  );
}
```

- [ ] **Step 7: `app/savings/[id]/edit/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";
import { getGroup } from "@/lib/savings";
import { GroupForm } from "../../group-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).savings.editMetaTitle };
}

export default async function EditSavingsGroupPage({ params }: PageProps<"/savings/[id]/edit">) {
  const me = await requireRole(...DONOR_ROLES);
  const [{ id }, t] = await Promise.all([params, getT()]);
  const s = t.savings;
  const group = await getGroup(id);
  // Settings only change while nobody has paid anything yet.
  if (!group || group.organizer_id !== me.id || group.status !== "forming") notFound();

  return (
    <>
      <Link href={`/savings/${group.id}`} className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {group.name}
      </Link>
      <div className="mt-3">
        <PageHeading title={s.editTitle} />
      </div>
      <div className="mt-8 max-w-2xl rounded-xl border border-line bg-surface p-5 sm:p-6">
        <GroupForm
          initial={{
            id: group.id,
            name: group.name,
            description: group.description ?? "",
            amount: group.amount,
            period: group.period,
            startDate: group.start_date,
          }}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 8: `app/savings/join/join-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { requestToJoin } from "@/app/actions/savings";
import { useT } from "@/components/i18n-provider";
import { Notice, SubmitButton } from "@/components/ui";
import { ReceivingFields } from "../receiving-fields";

export function JoinForm({ code }: { code: string }) {
  const [state, action] = useActionState(requestToJoin, undefined);
  const s = useT().savings;
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="code" value={code} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <ReceivingFields values={state?.values} errors={state?.errors} />
      <SubmitButton pendingLabel={s.sending} className="w-full">
        {s.sendRequest}
      </SubmitButton>
    </form>
  );
}
```

- [ ] **Step 9: `app/savings/join/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { buttonPrimary } from "@/components/button-styles";
import { Field, Notice } from "@/components/ui";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";
import { formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { getFormingGroupByCode, myMembership } from "@/lib/savings";
import { normalizeInviteCode } from "@/lib/savings-rules";
import { JoinForm } from "./join-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).savings.joinMetaTitle };
}

/** `/savings/join?code=AB3K7M` is the link organizers share; without a code it asks for one. */
export default async function JoinSavingsPage({ searchParams }: PageProps<"/savings/join">) {
  const me = await requireRole(...DONOR_ROLES);
  const [sp, t] = await Promise.all([searchParams, getT()]);
  const s = t.savings;

  const raw = typeof sp.code === "string" ? sp.code : "";
  const code = raw ? normalizeInviteCode(raw) : null;
  const group = code ? await getFormingGroupByCode(code) : null;
  const mine = group ? await myMembership(group.id, me.id) : null;
  const alreadyIn = mine === "pending" || mine === "approved";

  return (
    <>
      <Link href="/savings" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {s.back}
      </Link>
      <div className="mt-3">
        <PageHeading title={s.joinTitle} lede={s.joinLede} />
      </div>

      <div className="mt-8 max-w-2xl space-y-6">
        {!group && (
          // A plain GET form: the code ends up in the URL, the same shape as a shared link.
          <form action="/savings/join" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-start sm:p-6">
            <Field
              label={s.fCode}
              name="code"
              defaultValue={raw}
              errors={raw ? [s.errCode] : undefined}
              autoCapitalize="characters"
              autoComplete="off"
              className="flex-1 [&_input]:uppercase [&_input]:tracking-[0.12em]"
            />
            <button type="submit" className={`${buttonPrimary} sm:mt-7`}>
              {s.findGroup}
            </button>
          </form>
        )}

        {group && (
          <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="font-display text-2xl text-brand-deep">{group.name}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {fmt(s.joinAbout, { organizer: group.organizer_name, amount: formatKip(group.amount), period: s.period[group.period], n: group.members })}
            </p>
            {group.description && <p className="mt-3 whitespace-pre-line text-ink">{group.description}</p>}
            <div className="mt-6">
              {alreadyIn ? (
                <div className="space-y-3">
                  <Notice tone="success">{s.errAlready}</Notice>
                  <Link href={`/savings/${group.id}`} className={buttonPrimary}>
                    {s.openGroup}
                  </Link>
                </div>
              ) : (
                <JoinForm code={group.invite_code} />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 10: Type-check, lint, and look at it**

Run: `npx tsc --noEmit` and then `npm run lint`. Expected: no errors. (The `[id]` page doesn't exist yet. Links to it will 404 until Task 8, which is fine.)

Run `npm run dev` and sign in as a general user:
1. The **Savings groups** tab appears next to Donations and opens the empty state.
2. **Start a group** with no receiving details shows "Add an account name and number, or a QR code."
3. Filling it in properly redirects to `/savings/<id>`, which 404s for now.
4. `/savings/join?code=zzzzzz` shows the code field with the "No group is taking members…" error.

Sign in as the super admin: there is no Savings tab, and `/savings` redirects to `/admin`.

- [ ] **Step 11: Commit**

```bash
git add lib/navigation.ts components/area-nav.tsx proxy.ts app/savings
git commit -m "feat(savings): savings area, group list, create, edit and join pages"
```

---

### Task 8: Group page

**Files:**
- Create: `app/savings/[id]/page.tsx`, `app/savings/[id]/controls.tsx`

**Interfaces:**
- Consumes:
  - From Task 4: `getGroup`, `listMembers`, `listRounds`, `listPayments` and `MemberRow`
  - From Tasks 5 and 6: every action
  - From Task 7: `ReceivingFields`
  - `potFor`, `todayInLaos`, `feeFor` and `siteUrl`
- Produces: the client components `InviteCode`, `OrderEditor`, `StartGroupForm`, `CancelGroupButton`, `SlipForm`, `ReviewPaymentForm`, `CashButton`, `RemindForm` and `ReceivingForm`.

- [ ] **Step 1: `app/savings/[id]/controls.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import {
  cancelGroup,
  removeMember,
  remindUnpaid,
  reviewPayment,
  saveOrder,
  startGroup,
  updateMyReceivingDetails,
  uploadSlip,
} from "@/app/actions/savings";
import { buttonQuiet } from "@/components/button-styles";
import { useT } from "@/components/i18n-provider";
import { CheckIcon, LinkIcon } from "@/components/icons";
import { Field, FileField, Notice, SubmitButton, TextAreaField } from "@/components/ui";
import { ReceivingFields, type ReceivingValues } from "../receiving-fields";

/** The code in large type, and a button that copies the join link. */
export function InviteCode({ code, url }: { code: string; url: string }) {
  const s = useT().savings;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked (http, old browser): show the link so it can be copied by hand.
      window.prompt(s.copyLink, url);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-4">
      <p className="tabular font-display text-3xl tracking-[0.18em] text-brand-deep">{code}</p>
      <button type="button" onClick={copy} className={buttonQuiet}>
        {copied ? <CheckIcon width={16} height={16} /> : <LinkIcon width={16} height={16} />}
        {copied ? s.copied : s.copyLink}
      </button>
    </div>
  );
}

/**
 * Up/down buttons rather than drag and drop: easier on a phone and for older relatives.
 * The page remounts this (via `key`) whenever the saved order changes, e.g. after a random draw.
 */
export function OrderEditor({
  groupId,
  organizerMemberId,
  members,
}: {
  groupId: string;
  organizerMemberId: string;
  members: { id: string; name: string }[];
}) {
  const s = useT().savings;
  const [order, setOrder] = useState(members);
  const [state, action] = useActionState(saveOrder, undefined);
  const move = (i: number, by: -1 | 1) =>
    setOrder((o) => {
      const n = [...o];
      [n[i], n[i + by]] = [n[i + by], n[i]];
      return n;
    });
  const changed = order.some((m, i) => m.id !== members[i]?.id);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="order" value={order.map((m) => m.id).join(",")} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      {state?.success && !changed && <Notice tone="success">{state.success}</Notice>}
      <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {order.map((m, i) => (
          <li key={m.id} className="flex items-center gap-2 px-4 py-2.5">
            <span className="tabular w-7 text-sm font-semibold text-brand">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-ink">{m.name}</span>
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`${s.moveUp}: ${m.name}`}
              className="rounded-md px-2.5 py-1.5 text-ink-soft hover:bg-sunken disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              aria-label={`${s.moveDown}: ${m.name}`}
              className="rounded-md px-2.5 py-1.5 text-ink-soft hover:bg-sunken disabled:opacity-30"
            >
              ↓
            </button>
            {m.id !== organizerMemberId && (
              <button
                type="submit"
                formAction={removeMember}
                name="memberId"
                value={m.id}
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-bad hover:bg-bad-wash"
              >
                {s.remove}
              </button>
            )}
          </li>
        ))}
      </ol>
      <SubmitButton variant="quiet" pendingLabel={s.saving}>
        {s.saveOrder}
      </SubmitButton>
    </form>
  );
}

export function StartGroupForm({ groupId }: { groupId: string }) {
  const s = useT().savings;
  const [state, action] = useActionState(startGroup, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="groupId" value={groupId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <SubmitButton pendingLabel={s.starting} className="w-full sm:w-auto">
        {s.start}
      </SubmitButton>
    </form>
  );
}

export function CancelGroupButton({ groupId }: { groupId: string }) {
  const s = useT().savings;
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${buttonQuiet} text-bad`}>
        {s.cancelGroup}
      </button>
    );
  }
  return (
    <form action={cancelGroup} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <span className="text-sm text-ink">{s.cancelConfirm}</span>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2.5 py-1.5 text-sm text-ink-soft hover:bg-sunken">
        {s.keep}
      </button>
      <button type="submit" className="rounded-md bg-bad px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">
        {s.cancelYes}
      </button>
    </form>
  );
}

/** "I have paid": the payer sends the slip of the transfer they already made. */
export function SlipForm({ paymentId }: { paymentId: string }) {
  const tt = useT();
  const s = tt.savings;
  const [state, action] = useActionState(uploadSlip, undefined);
  const today = new Date().toISOString().slice(0, 10);
  if (state?.success) return <Notice tone="success">{state.success}</Notice>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="paymentId" value={paymentId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <Field
        label={s.fTransferDate}
        name="transferDate"
        type="date"
        max={today}
        defaultValue={state?.values?.transferDate ?? today}
        errors={state?.errors?.transferDate}
      />
      <FileField
        label={s.fSlip}
        name="slip"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hint={s.fSlipHint}
        errors={state?.errors?.slip}
        chooseLabel={tt.common.chooseFile}
      />
      <SubmitButton pendingLabel={s.sending} className="w-full">
        {s.sendSlip}
      </SubmitButton>
    </form>
  );
}

/** The receiver confirms a slip, or says it did not arrive (with a reason). */
export function ReviewPaymentForm({ paymentId }: { paymentId: string }) {
  const s = useT().savings;
  const [state, action, pending] = useActionState(reviewPayment, undefined);
  if (state?.success) return <Notice tone="success">{state.success}</Notice>;
  return (
    <form action={action} className="mt-3 space-y-3" noValidate>
      <input type="hidden" name="paymentId" value={paymentId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <TextAreaField label={s.reason} name="note" optional placeholder={s.reasonPlaceholder} errors={state?.errors?.note} maxLength={300} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 font-medium text-bad hover:bg-bad-wash disabled:opacity-60"
        >
          {s.reject}
        </button>
        <button
          type="submit"
          name="decision"
          value="confirm"
          disabled={pending}
          className="inline-flex h-11 flex-[2] items-center justify-center rounded-lg bg-brand px-4 font-semibold text-white shadow-soft hover:bg-brand-2 disabled:opacity-60"
        >
          {s.confirm}
        </button>
      </div>
    </form>
  );
}

/** For money handed over in person: no slip needed. */
export function CashButton({ paymentId }: { paymentId: string }) {
  const s = useT().savings;
  const [state, action, pending] = useActionState(reviewPayment, undefined);
  if (state?.success) return <Notice tone="success">{state.success}</Notice>;
  return (
    <form action={action}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="decision" value="cash" />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <button type="submit" disabled={pending} className={buttonQuiet}>
        {s.markCash}
      </button>
    </form>
  );
}

export function RemindForm({ groupId }: { groupId: string }) {
  const s = useT().savings;
  const [state, action] = useActionState(remindUnpaid, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="groupId" value={groupId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      <SubmitButton variant="quiet" pendingLabel={s.sending}>
        {s.remind}
      </SubmitButton>
    </form>
  );
}

export function ReceivingForm({ groupId, initial, hasQr }: { groupId: string; initial: ReceivingValues; hasQr: boolean }) {
  const s = useT().savings;
  const [state, action] = useActionState(updateMyReceivingDetails, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="groupId" value={groupId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      <ReceivingFields values={state?.values ?? initial} errors={state?.errors} hasQr={hasQr} />
      <SubmitButton variant="quiet" pendingLabel={s.saving}>
        {s.save}
      </SubmitButton>
    </form>
  );
}
```

- [ ] **Step 2: `app/savings/[id]/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { buttonQuiet } from "@/components/button-styles";
import { FileIcon, PencilIcon } from "@/components/icons";
import { Notice } from "@/components/ui";
import { decideMember, shuffleOrder } from "@/app/actions/savings";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";
import { formatDate, formatKip } from "@/lib/format";
import { feeFor } from "@/lib/funds";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { getGroup, listMembers, listPayments, listRounds, type MemberRow } from "@/lib/savings";
import { potFor, todayInLaos } from "@/lib/savings-rules";
import { siteUrl } from "@/lib/site-url";
import {
  CancelGroupButton,
  CashButton,
  InviteCode,
  OrderEditor,
  ReceivingForm,
  RemindForm,
  ReviewPaymentForm,
  SlipForm,
  StartGroupForm,
} from "./controls";

export async function generateMetadata({ params }: PageProps<"/savings/[id]">): Promise<Metadata> {
  const g = await getGroup((await params).id);
  return { title: g ? g.name : (await getT()).savings.metaTitle };
}

const GROUP_TONE = { forming: "warn", active: "info", completed: "ok", cancelled: "mute" } as const;
const ROUND_TONE = { upcoming: "mute", collecting: "info", done: "ok" } as const;
const PAY_TONE = { unpaid: "warn", pending: "info", confirmed: "ok", rejected: "bad" } as const;

type Dict = Awaited<ReturnType<typeof getT>>["savings"];

export default async function SavingsGroupPage({ params, searchParams }: PageProps<"/savings/[id]">) {
  const me = await requireRole(...DONOR_ROLES);
  const [{ id }, sp, t, locale] = await Promise.all([params, searchParams, getT(), getLocale()]);
  const s = t.savings;

  const group = await getGroup(id);
  if (!group) notFound();
  const members = await listMembers(group.id);
  const mine = members.find((m) => m.user_id === me.id);
  // Only people in the group (or waiting to be) can see it at all.
  if (!mine) notFound();
  const isOrganizer = group.organizer_id === me.id;

  const back = (
    <Link href="/savings" className="text-sm font-medium text-brand hover:text-brand-bright">
      ← {s.back}
    </Link>
  );

  if (group.status === "cancelled" || mine.status === "pending") {
    return (
      <>
        {back}
        <div className="mt-3">
          <PageHeading title={group.name} />
        </div>
        <div className="mt-8 max-w-2xl rounded-xl border border-line bg-surface p-5 sm:p-6">
          {group.status === "cancelled" ? (
            <p className="text-ink">{s.cancelled}</p>
          ) : (
            <>
              <h2 className="font-semibold text-ink">{s.pendingTitle}</h2>
              <p className="mt-1 text-sm text-ink-soft">{fmt(s.pendingBody, { organizer: group.organizer_name })}</p>
            </>
          )}
        </div>
      </>
    );
  }

  const approved = members.filter((m) => m.status === "approved");
  const waiting = members.filter((m) => m.status === "pending");
  const rounds = group.status === "forming" ? [] : await listRounds(group.id);
  const current = rounds.find((r) => r.status === "collecting") ?? null;
  const payments = current ? await listPayments(current.id) : [];
  const receiver = current ? (approved.find((m) => m.id === current.receiver_member_id) ?? null) : null;
  const iReceive = current?.receiver_member_id === mine.id;
  const myPayment = payments.find((p) => p.payer_member_id === mine.id) ?? null;
  const currentPot = current ? Number(current.pot) : 0;
  const myRound = rounds.find((r) => r.receiver_member_id === mine.id);
  const canEditReceiving = group.status === "forming" || (group.status === "active" && myRound?.status === "upcoming");
  const today = todayInLaos();
  const inviteUrl = `${await siteUrl()}/savings/join?code=${group.invite_code}`;
  const organizerMember = approved.find((m) => m.user_id === group.organizer_id);

  return (
    <>
      {back}
      {sp.saved === "1" && (
        <div className="mt-4">
          <Notice tone="success">{s.saved}</Notice>
        </div>
      )}

      <div className="mt-3">
        <PageHeading
          title={group.name}
          lede={
            <>
              {fmt(s.organizedBy, { name: group.organizer_name })} ·{" "}
              <span className="tabular">
                {formatKip(group.amount)} {s.period[group.period]}
              </span>{" "}
              · {fmt(s.membersCount, { n: group.members })}
            </>
          }
        >
          <Pill tone={GROUP_TONE[group.status]}>{s.groupStatus[group.status]}</Pill>
        </PageHeading>
        {group.description && <p className="mt-3 max-w-[65ch] whitespace-pre-line text-ink">{group.description}</p>}
      </div>

      {/* ---------- Forming ---------- */}
      {group.status === "forming" && isOrganizer && (
        <>
          <Section title={s.inviteTitle}>
            <div className="rounded-xl border border-line bg-surface p-5">
              <p className="mb-3 text-sm text-ink-soft">{s.inviteBody}</p>
              <InviteCode code={group.invite_code} url={inviteUrl} />
            </div>
          </Section>

          {waiting.length > 0 && (
            <Section title={s.requestsTitle}>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {waiting.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
                    <MemberInfo m={m} s={s} />
                    <form action={decideMember} className="flex gap-2">
                      <input type="hidden" name="memberId" value={m.id} />
                      <button type="submit" name="decision" value="decline" className="rounded-md px-3 py-1.5 text-sm font-medium text-bad hover:bg-bad-wash">
                        {s.decline}
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="approve"
                        className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2"
                      >
                        {s.approve}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section
            title={s.orderTitle}
            aside={
              <form action={shuffleOrder}>
                <input type="hidden" name="groupId" value={group.id} />
                <button type="submit" className={buttonQuiet}>
                  {s.shuffle}
                </button>
              </form>
            }
          >
            <p className="mb-3 text-sm text-ink-soft">{s.orderBody}</p>
            <OrderEditor
              key={approved.map((m) => m.id).join()}
              groupId={group.id}
              organizerMemberId={organizerMember?.id ?? ""}
              members={approved.map((m) => ({ id: m.id, name: m.full_name }))}
            />
          </Section>

          <Section title={s.startTitle}>
            <div className="rounded-xl border border-line bg-surface p-5">
              <p className="mb-4 text-sm text-ink">
                {fmt(s.startBody, { n: group.members, rounds: group.members, pot: formatKip(potFor(Number(group.amount), Number(group.members))) })}
              </p>
              <StartGroupForm groupId={group.id} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/savings/${group.id}/edit`} className={buttonQuiet}>
                <PencilIcon width={16} height={16} />
                {s.edit}
              </Link>
              <CancelGroupButton groupId={group.id} />
            </div>
          </Section>
        </>
      )}

      {group.status === "forming" && !isOrganizer && (
        <Section title={s.orderTitle}>
          <p className="mb-3 text-sm text-ink-soft">{s.waitingStart}</p>
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {approved.map((m) => (
              <li key={m.id} className={`flex items-center gap-3 px-4 py-3 ${m.id === mine.id ? "bg-brand-wash/40" : ""}`}>
                <span className="tabular w-7 text-sm font-semibold text-brand">{m.turn_no}</span>
                <span className="text-ink">{m.full_name}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* ---------- Active: the round being collected ---------- */}
      {current && receiver && (
        <Section title={fmt(s.currentRound, { n: current.round_no, total: rounds.length })}>
          <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-lg text-ink">{fmt(s.receives, { name: receiver.full_name, pot: formatKip(currentPot) })}</p>
              <p className="text-sm text-ink-soft">
                {fmt(s.due, { date: formatDate(current.due_date, locale) })}
                {current.due_date < today && (
                  <>
                    {" "}
                    · <span className="font-medium text-bad">{s.late}</span>
                  </>
                )}
              </p>
            </div>

            {iReceive && (
              <div className="mt-4 space-y-1">
                <p className="font-medium text-brand">{fmt(s.youReceive, { pot: formatKip(currentPot) })}</p>
                {Number(group.fee_percent ?? 0) > 0 && (
                  <p className="text-sm text-ink-soft">
                    {fmt(s.feeNote, { pct: Number(group.fee_percent), fee: formatKip(feeFor(currentPot, group.fee_percent ?? 0)) })}
                  </p>
                )}
              </div>
            )}

            {!iReceive && myPayment && (
              <div className="mt-5 border-t border-line pt-5">
                {myPayment.status === "confirmed" ? (
                  <Notice tone="success">{s.youPaid}</Notice>
                ) : myPayment.status === "pending" ? (
                  <p className="text-sm text-ink">{fmt(s.waitingCheck, { name: receiver.full_name })}</p>
                ) : (
                  <>
                    {myPayment.status === "rejected" && myPayment.review_note && (
                      <p className="mb-3 text-sm text-bad">{fmt(s.rejectedNote, { note: myPayment.review_note })}</p>
                    )}
                    <h3 className="font-semibold text-ink">{fmt(s.payTo, { amount: formatKip(myPayment.amount), name: receiver.full_name })}</h3>
                    <PayDetails m={receiver} s={s} />
                    <div className="mt-4">
                      <SlipForm paymentId={myPayment.id} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {current && (
        <Section title={s.paymentsTitle} aside={fmt(s.paidCount, { paid: current.paid, total: current.total })}>
          {isOrganizer && (
            <div className="mb-3">
              <RemindForm groupId={group.id} />
            </div>
          )}
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {payments.map((p) => (
              <li key={p.id} className="p-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{p.payer_name}</p>
                    <p className="tabular text-sm text-ink-soft">
                      {formatKip(p.amount)}
                      {p.transfer_date && <> · {formatDate(p.transfer_date, locale)}</>}
                      {p.confirmed_without_slip && <> · {s.cash}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Slips are private to the payer and the receiver. */}
                    {iReceive && p.slip_file_id && (
                      <a
                        href={`/files/${p.slip_file_id}`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-bright"
                      >
                        <FileIcon width={16} height={16} />
                        {s.viewSlip}
                      </a>
                    )}
                    <Pill tone={PAY_TONE[p.status]}>{s.paymentStatus[p.status]}</Pill>
                  </div>
                </div>
                {iReceive && p.status === "pending" && <ReviewPaymentForm paymentId={p.id} />}
                {iReceive && (p.status === "unpaid" || p.status === "rejected") && (
                  <div className="mt-2">
                    <CashButton paymentId={p.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {group.status === "completed" && (
        <div className="mt-8">
          <Notice tone="success">{s.completedTitle}</Notice>
        </div>
      )}

      {rounds.length > 0 && (
        <Section title={s.scheduleTitle}>
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {rounds.map((r) => (
              <li
                key={r.id}
                className={`flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5 ${r.receiver_member_id === mine.id ? "bg-brand-wash/40" : ""}`}
              >
                <div>
                  <p className="font-medium text-ink">
                    <span className="tabular text-brand">{r.round_no}.</span> {r.receiver_name}
                  </p>
                  <p className="tabular text-sm text-ink-soft">
                    {fmt(s.due, { date: formatDate(r.due_date, locale) })} · {formatKip(r.pot)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.status === "collecting" && <span className="tabular text-sm text-ink-soft">{fmt(s.paidCount, { paid: r.paid, total: r.total })}</span>}
                  <Pill tone={ROUND_TONE[r.status]}>{s.roundStatus[r.status]}</Pill>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {canEditReceiving && (
        <Section title={s.myReceiving}>
          <div className="max-w-2xl rounded-xl border border-line bg-surface p-5">
            <ReceivingForm
              groupId={group.id}
              hasQr={Boolean(mine.qr_file_id)}
              initial={{ bankName: mine.bank_name ?? "", accountName: mine.account_name ?? "", accountNumber: mine.account_number ?? "" }}
            />
          </div>
        </Section>
      )}
    </>
  );
}

/** Name, clan and a short "where they receive" line, for the organizer deciding on a request. */
function MemberInfo({ m, s }: { m: MemberRow; s: Dict }) {
  const receiving = [m.bank_name, m.account_number].filter(Boolean).join(" · ") || (m.qr_file_id ? s.fQr : s.noReceiving);
  return (
    <div className="min-w-0">
      <p className="font-medium text-ink">{m.full_name}</p>
      <p className="text-sm text-ink-soft">
        {m.clan_name ?? s.noClan} · {receiving}
      </p>
    </div>
  );
}

/** Where to send this round's money. */
function PayDetails({ m, s }: { m: MemberRow; s: Dict }) {
  return (
    <div className="mt-3 flex flex-wrap items-start gap-4 rounded-lg border border-line bg-paper/60 p-4">
      {m.qr_file_id && (
        // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked upload
        <img src={`/files/${m.qr_file_id}`} alt={s.fQr} className="size-40 rounded-md border border-line bg-white object-contain" />
      )}
      <dl className="space-y-1 text-sm">
        {m.bank_name && (
          <div>
            <dt className="inline text-ink-soft">{s.fBank}: </dt>
            <dd className="inline font-medium text-ink">{m.bank_name}</dd>
          </div>
        )}
        {m.account_name && (
          <div>
            <dt className="inline text-ink-soft">{s.fAccountName}: </dt>
            <dd className="inline font-medium text-ink">{m.account_name}</dd>
          </div>
        )}
        {m.account_number && (
          <div>
            <dt className="inline text-ink-soft">{s.fAccountNumber}: </dt>
            <dd className="tabular inline font-medium text-ink">{m.account_number}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit` and then `npm run lint`
Expected: no errors.

- [ ] **Step 4: Smoke-test in the browser**

With `npm run dev`, create a group as user A. You should see the invite code, an order list with only A, and the Start button. Pressing **Start now** shows "A group needs at least 2 members."

- [ ] **Step 5: Commit**

```bash
git add "app/savings/[id]/page.tsx" "app/savings/[id]/controls.tsx"
git commit -m "feat(savings): group page with ordering, start, payments and schedule"
```

---

### Task 9: Admin — savings fee rate and fees owed

**Files:**
- Modify: `app/actions/admin.ts`, `app/admin/forms.tsx`, `app/admin/page.tsx`

**Interfaces:**
- Consumes: the `savings_fees` table, `platform_settings.savings_fee_percent` and the `t.admin.savings*` keys.
- Produces:
  - `updateSavingsFee(_s: FormState, fd: FormData): Promise<FormState>`. Field: `fee`.
  - `markSavingsFeeReceived(fd: FormData): Promise<void>`. Field: `feeId`.
  - `SavingsFeeForm({ current }: { current: string })`

- [ ] **Step 1: Append to `app/actions/admin.ts`**

```ts
/** The savings group fee is separate from the funeral fee; each group keeps the rate it started with. */
export async function updateSavingsFee(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("super_admin");
  const t = await getT();
  const raw = String(formData.get("fee") ?? "").trim();
  const fee = Number(raw);
  if (raw === "" || !Number.isFinite(fee) || fee < 0 || fee > 100) {
    return { errors: { fee: [t.errors.feeRange] }, values: { fee: raw } };
  }
  const rounded = Math.round(fee * 100) / 100;
  await query(`UPDATE platform_settings SET savings_fee_percent = $1, updated_at = now() WHERE id = 1`, [rounded]);
  await query(`INSERT INTO audit_logs (actor_id, action, details) VALUES ($1, 'platform.savings_fee_updated', $2)`, [
    admin.id,
    JSON.stringify({ savings_fee_percent: rounded }),
  ]);
  revalidatePath("/admin");
  return { success: fmt(t.admin.savingsFeeSaved, { fee: rounded }) };
}

/** The system owner confirms a savings round's fee arrived. */
export async function markSavingsFeeReceived(formData: FormData) {
  const admin = await requireRole("super_admin");
  const feeId = String(formData.get("feeId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(feeId)) return;
  const updated = await query<{ id: string }>(
    `UPDATE savings_fees SET status = 'received', received_at = now(), received_by = $2
      WHERE id = $1 AND status = 'owed' RETURNING id`,
    [feeId, admin.id],
  );
  if (updated[0]) {
    await query(`INSERT INTO audit_logs (actor_id, action, target_id) VALUES ($1, 'platform.savings_fee_received', $2)`, [admin.id, feeId]);
  }
  revalidatePath("/admin");
}
```

- [ ] **Step 2: Add `SavingsFeeForm` to `app/admin/forms.tsx`**

Change the import to `import { createClan, updatePlatformFee, updateSavingsFee } from "@/app/actions/admin";` and append:

```tsx
export function SavingsFeeForm({ current }: { current: string }) {
  const [state, action] = useActionState(updateSavingsFee, undefined);
  const a = useT().admin;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      <Field
        label={a.savingsFeeLabel}
        name="fee"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        max="100"
        icon={<PercentIcon width={18} height={18} />}
        defaultValue={state?.values?.fee ?? Number(current)}
        errors={state?.errors?.fee}
        hint={a.savingsFeeHint}
      />
      <SubmitButton variant="quiet" pendingLabel={a.saving} className="w-full">
        {a.saveSavingsFee}
      </SubmitButton>
    </form>
  );
}
```

- [ ] **Step 3: Update `app/admin/page.tsx`**

1. Imports:
   - Change `import { markFeeReceived, setClanActive } from "@/app/actions/admin";` to `import { markFeeReceived, markSavingsFeeReceived, setClanActive } from "@/app/actions/admin";`
   - Change `import { CreateClanForm, PlatformFeeForm } from "./forms";` to `import { CreateClanForm, PlatformFeeForm, SavingsFeeForm } from "./forms";`
2. Destructuring: change `const [clans, totals, settings, money, fees, counts] = await Promise.all([` to `const [clans, totals, settings, money, fees, counts, savingsFees] = await Promise.all([`.
3. Settings query: change it to `queryOne<{ platform_fee_percent: string; savings_fee_percent: string }>(\`SELECT platform_fee_percent, savings_fee_percent FROM platform_settings WHERE id = 1\`),`.
4. Add a new last element to the `Promise.all` array, after `countPeople(),`:

```ts
    query<{
      id: string;
      group_name: string;
      round_no: number;
      receiver_name: string;
      receiver_phone: string;
      percent: string;
      base_amount: string;
      fee_amount: string;
      status: "owed" | "received";
      created_at: Date;
    }>(
      `SELECT f.id, g.name AS group_name, r.round_no, u.full_name AS receiver_name, u.phone AS receiver_phone,
              f.percent, f.base_amount, f.fee_amount, f.status, f.created_at
         FROM savings_fees f
         JOIN savings_rounds r ON r.id = f.round_id
         JOIN savings_groups g ON g.id = r.group_id
         JOIN users u ON u.id = f.payer_user_id
        ORDER BY (f.status = 'owed') DESC, f.created_at DESC
        LIMIT 50`,
    ),
```

5. After `const fee = settings?.platform_fee_percent ?? "1.50";`, add `const savingsFee = settings?.savings_fee_percent ?? "1.00";`.
6. Directly after the closing `</Section>` of the `a.feesTitle` section (still inside the left column `<div className="min-w-0">`), add:

```tsx
          <Section title={a.savingsFeesTitle}>
            {savingsFees.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{a.noSavingsFees}</p>
            ) : (
              <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                    <tr>
                      <th className="px-4 py-3 font-medium">{a.colGroup}</th>
                      <th className="px-4 py-3 text-right font-medium">{a.colBase}</th>
                      <th className="px-4 py-3 text-right font-medium">{a.colFee}</th>
                      <th className="px-4 py-3 font-medium">{a.colStatus}</th>
                      <th className="px-4 py-3"><span className="sr-only">{a.markReceived}</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {savingsFees.map((f) => (
                      <tr key={f.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{f.group_name}</p>
                          <p className="text-xs text-muted">
                            {fmt(t.savings.roundNo, { n: f.round_no })} · {f.receiver_name} · {f.receiver_phone} · {formatDate(f.created_at, locale)}
                          </p>
                        </td>
                        <td className="tabular px-4 py-3 text-right text-ink-soft">{formatKip(f.base_amount)}</td>
                        <td className="tabular px-4 py-3 text-right font-semibold text-ink">
                          {formatKip(f.fee_amount)}
                          <span className="block text-xs font-normal text-muted">{Number(f.percent)}%</span>
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={f.status === "owed" ? "warn" : "ok"}>{a.feeStatus[f.status]}</Pill>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {f.status === "owed" && (
                            <form action={markSavingsFeeReceived}>
                              <input type="hidden" name="feeId" value={f.id} />
                              <button type="submit" className="rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-ok hover:bg-ok-wash">
                                {a.markReceived}
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
```

   The receiver's phone is shown so the platform owner can contact them to collect the fee.

7. In the right column, after the `a.feeTitle` section, add:

```tsx
          <Section title={a.savingsFeeTitle}>
            <div className="rounded-xl border border-line bg-surface p-5">
              <SavingsFeeForm current={savingsFee} />
            </div>
          </Section>
```

- [ ] **Step 4: Type-check, lint, look**

Run: `npx tsc --noEmit` and then `npm run lint`. Expected: no errors.

In the dev server as the super admin, `/admin` should show a **Savings group fee** form with 1, and a **Savings group fees** section reading "No savings group fees yet." Save 2.5; the success notice should read "Savings group fee set to 2.5%."

- [ ] **Step 5: Commit**

```bash
git add app/actions/admin.ts app/admin/forms.tsx app/admin/page.tsx
git commit -m "feat(savings): admin sets the savings fee and marks fees received"
```

---

### Task 10: End-to-end verification

**Files:** none (unless a check fails, in which case fix it in the owning task's files and note it in that commit).

You need three accounts: **A**, a general user; **B**, a clan member; **C**, a clan leader. Use `npm run db:setup -- --demo` if the database has no clan yet. Keep three browser profiles or private windows open.

- [ ] **Step 1: Create.** A creates "Test group": 100000, Monthly, start date today, and an account name and number. The page shows the invite code.
- [ ] **Step 2: Join (Review Focus 3).**
  - B opens the copied link and asks to join with a QR image only.
  - C types the code in lowercase with a dash and asks to join.
  - A sees both under **Asking to join**. A declines C, and C gets "declined" in notifications.
  - C opens the same link again and asks again. A now sees C again, and approves both.
  - After the group starts (step 3), C opening the link gets "No group is taking members with this code."
- [ ] **Step 3: Order and start (Review Focus 4).**
  - A clicks **Draw at random**; the order changes. A moves people with ↑/↓ into the order B, A, C and saves.
  - The forms never let someone save without receiving details, so simulate it in the database: set `account_name = NULL, account_number = NULL, qr_file_id = NULL` on C's `savings_members` row. Press **Start now**: it shows "These members still need receiving details: C". Restore C's row.
  - Set `start_date` to yesterday in the database and press Start: it shows "The first due date has passed…". Then fix the date through **Edit group**.
  - Start succeeds. Round 1 shows "B receives 200,000 ₭". A and C each got "send 100,000 ₭ to B", and B got "round 1 is yours".
- [ ] **Step 4: Pay and confirm (Review Focus 1).**
  - A uploads a slip. B sees it, with **View slip** opening the image, and rejects it with the reason "wrong amount". A sees "Not accepted: wrong amount" and uploads again.
  - C uploads a slip.
  - B opens the round in two tabs and presses **Received** on A's slip in one and C's slip in the other at nearly the same time.
  - Then run `SELECT COUNT(*) FROM savings_fees` (expected 1). Also run `SELECT round_no, status FROM savings_rounds WHERE group_id = '<id>' ORDER BY 1` (expected `1 done`, `2 collecting`, `3 upcoming`).
  - B got "round 1 is complete… fee owed: 2,000 ₭" (1%, or 2.5% if Task 9's test changed the rate *before* starting).
- [ ] **Step 5: Stale page (Review Focus 2).**
  - In round 2 (receiver A), C opens the group page with the slip form showing. Meanwhile A presses **Received in cash** on C's row.
  - C then submits a slip. Expected: "This has changed since you opened the page…". C's row stays **Received**, marked Cash.
  - B pays normally and A confirms. Round 3 opens.
- [ ] **Step 6: Finish and fees.**
  - A organizer **Remind** sends "Reminder sent to 2 people". Pressing it again shows "A reminder was already sent today."
  - Complete round 3 (receiver C). The group shows **Finished** and "Every member has received their pot". Everyone got the completion notification.
  - As the super admin, `/admin` lists three savings fees as owed. **Mark received** on one changes it to received.
- [ ] **Step 7: File access (Review Focus 5).**
  - While signed in as a fourth user who is not in the group, open B's QR URL and one of A's slip URLs (copy them from A's or B's browser). Both answer 404.
  - C, a member who is not the receiver of that round, opening A's round-1 slip URL also gets 404.
- [ ] **Step 8: Languages and phone width.** Switch to ລາວ and Hmoob and open `/savings`, a group page, `/savings/new`, `/savings/join` and `/admin`. No raw keys and no `{placeholder}` text should show. Open the group page in a 375 px-wide window and check there is no horizontal scroll.
- [ ] **Step 9: Full checks.**

Run: `npm test` and then `npm run lint` and then `npm run build`
Expected: tests pass, lint is clean, and the build succeeds.

- [ ] **Step 10: Commit any fixes made during verification**

```bash
git add <the files you changed>
git commit -m "fix(savings): issues found in end-to-end check"
```
