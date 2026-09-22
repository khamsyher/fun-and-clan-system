# Fund & Clan Management System

Multi-tenant funeral mutual-aid fund platform for Lao clans. Next.js 16 · Tailwind CSS v4 · PostgreSQL via `pg` (no ORM).

**Phase 1:** sign-in, member registration with leader approval, and role-based dashboards for Super Admin, Clan Leader and Member.

**Phase 2:** fund mode and rate changes backed by uploaded meeting minutes, family members (dependents), password change and password reset.

**Phase 3:** death reporting with a locked rate per event, Mode B collection bills with a live progress bar, carried-over debt, platform-fee tracking, two-person payout approval (leader + treasurer), and an append-only fund ledger.

**Phase 4:** members pay by uploading transfer slips that the leader approves or rejects, Mode A contribution periods, and a payment history for every member.

**Phase 5:** income and expense reports for any date range with Excel and PDF export (in the viewer's language, Lao included), and a platform statistics report for the Super Admin.

### Upgrading an existing database
Run `npm run db:setup` again after pulling new code. The schema only adds what is missing and never deletes data.

## Setup

1. **Create the database in Navicat.** Connect to your local PostgreSQL, right-click → *New Database* → name it `fund_clan`.
2. **Configure env.** Open `.env.local` (already created, with a generated `SESSION_SECRET`) and set `DATABASE_URL` to your Navicat connection:
   ```
   DATABASE_URL=postgresql://postgres:<your-password>@localhost:5432/fund_clan
   ```
   Change `SUPER_ADMIN_PHONE` / `SUPER_ADMIN_PASSWORD` to your own before the next step.
3. **Create tables + your super admin account:**
   ```
   npm run db:setup            # schema + super admin
   npm run db:setup -- --demo  # also a demo clan (VANG01) with a leader and members
   ```
   Or, instead: run `db/schema.sql` in a Navicat query window. The super admin must then be created by the script, since it hashes the password.
4. `npm run dev` → http://localhost:3000

### Demo accounts (`--demo`)
| Role | Phone | Password |
|---|---|---|
| Super Admin | value of `SUPER_ADMIN_PHONE` | value of `SUPER_ADMIN_PASSWORD` |
| Clan Leader (VANG01) | 02011111111 | Password123 |
| Member | 02022222222 | Password123 |
| Pending members | 02033333333, 02044444444 | Password123 |

## How it works

| Flow | Behaviour |
|---|---|
| Register (`/register`) | Member enters the clan code → account created as **pending** |
| Leader approval (`/clan`) | Leader approves or declines. Only then can the member sign in |
| Sign in (`/login`) | Phone + password → redirected to `/admin`, `/clan` or `/member` by role |
| Super Admin (`/admin`) | Create clans and their leader accounts, enable or disable clans, set the platform fee %, reset a leader's password |
| Fund settings (`/clan/settings`) | Leader changes fund mode (A/B), amount and Mode A schedule. Each change needs a meeting date and the minutes (JPG/PNG/WebP/PDF, max 5 MB); every version is kept with its document |
| Family (`/member/family`) | Member adds, edits and removes spouse, children and parents; the leader sees each member's family on `/clan` |
| Events (`/clan/events`) | Leader reports a death (member or dependent). **Mode B:** one bill per member account at the locked rate; leader records cash/transfer payments (with undo); closing turns unpaid bills into debt that shows on the next bill, and records the platform fee. **Mode A:** payout comes from the central fund; the fee is taken on the payout |
| Payouts | Leader requests → a **treasurer** (a member the leader assigns) approves or rejects with a reason → leader records it paid, with optional proof. The database forbids the same person requesting and approving |
| Fund (`/clan/fund`) | Balance, money received (e.g. Mode A savings), outstanding debts with "record payment", and the full ledger |
| Members (`/member/events`) | Every member sees each collection's live progress bar (refreshes every 15 s), their own bill, and the payout record |
| Platform fees (`/admin`) | Super Admin sees fees owed and received per event and marks each one received |
| Payments (`/member/payments`) | Member sees what they owe (open bills, earlier debt, Mode A dues), uploads a transfer slip (photo/PDF, 5 MB) for any of them, can include earlier debt with a new bill, and sees their slips and full payment history |
| Slips (`/clan/slips`) | Leader sees each slip beside the expected amount (mismatches flagged), approves it (records the payment in the ledger) or rejects it with a reason the member sees |
| Contributions (`/clan/contributions`) | Mode A only: leader opens a period (`2026-09` or `2026`) and every active member gets a due at the locked rate; paid by slip or recorded as cash |
| Reports (`/clan/reports`) | Leader picks a date range (or this month / this year / last year / all time) and sees opening balance, income by type, expenses, corrections, closing balance, each funeral event, contributions, what is still owed, and the ledger. **Export Excel** (numbers stay numbers, formatted in ₭) or **Export PDF** (A4 landscape, page numbers) |
| Platform report (`/admin/reports`) | Super Admin: per-clan totals (members, events, collected, paid out, fees owed/received) and fees by month, with the same Excel/PDF export. Totals only, no member-level data |
| Account (`/account`) | Everyone can change their password; this signs out their other devices. Leaders can reset a member's password, and the Super Admin can reset a leader's |

### Security & tenant isolation
- Passwords are hashed with scrypt (`lib/password.ts`).
- The session is a signed JWT (`jose`) in an httpOnly cookie (`lib/session.ts`).
- `proxy.ts` does fast cookie-only role redirects. `lib/dal.ts` re-checks the user **in the database on every request**, so a disabled user or clan loses access immediately.
- **Strict rate compliance is enforced by the database:** a trigger rejects any change to a clan's mode or rate, including one made directly in Navicat, unless the same transaction records an approved change with its meeting minutes.
- **Money is tamper-evident:** an event's rate, mode and fee % are locked by a trigger, bill amounts can't change, and `fund_ledger` is append-only, so corrections are reversing entries.
- **Slips are private:** only the member who uploaded a slip and their clan leader can open it. Payments recorded from a slip can't be undone by hand.
- Uploaded files are stored in the `files` table and served only to signed-in users of the same clan (`/files/[id]`). The type is checked from the file content, not the file name.
- Every clan query is scoped by the signed-in user's `clan_id`. A leader can't read or change another clan's members, even by sending a forged member id.

## Languages
English, Lao and Hmong via the language button (top right). Text lives in `lib/i18n/en.json`, `la.json` and `hm.json`. `en.json` defines the keys, and TypeScript fails the build if a translation is missing one. The Lao and Hmong wording should be reviewed by native speakers before launch.

## Structure
```
db/schema.sql          tables: clans, users, dependents, platform_settings, audit_logs
scripts/db-setup.ts    applies schema, seeds super admin (+ demo)
lib/                   db pool, session, DAL, validation (zod), formatting
lib/i18n/              dictionaries (en, lo, hmn) + locale cookie helpers
proxy.ts               optimistic route guard
app/(auth)/            login + register
app/admin|clan|member  role dashboards
app/actions/           server actions (auth, admin, clan)
```

## Reports & exports
- Day boundaries use Laos time (Asia/Vientiane).
- PDFs embed Public Sans (Latin) and Noto Sans Lao from `@fontsource` packages; amounts are written as "Kip" / "ກີບ" because neither font has the ₭ sign. `next.config.ts` marks `pdfkit` and `exceljs` as server-external and traces the font files into deployments.

## All TOR phases are built
Suggested next steps: native-speaker review of the Lao and Hmong text, SMS/WhatsApp notifications for new bills, and a payment-gateway integration if the platform fee should transfer automatically.
