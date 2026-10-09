# Fund & Clan Management System

Multi-tenant funeral mutual-aid fund platform for Lao clans. Next.js 16 · Tailwind CSS v4 · PostgreSQL via `pg` (no ORM).

**Phase 1:** sign-in, member registration with leader approval, and role-based dashboards for Super Admin, Clan Leader and Member.

**Phase 2:** fund mode and rate changes backed by uploaded meeting minutes, family members (dependents), password change and password reset.

**Phase 3:** death reporting with a locked rate per event, Mode B collection bills with a live progress bar, carried-over debt, platform-fee tracking, two-person payout approval (leader + treasurer), and an append-only fund ledger.

**Phase 4:** members pay by uploading transfer slips that the leader approves or rejects, Mode A contribution periods, and a payment history for every member.

**Phase 5:** income and expense reports for any date range with Excel and PDF export (in the viewer's language, Lao included), and a platform statistics report for the Super Admin.

**Donations:** any member or leader can ask for help, every signed-in user of every clan sees the requests, donors upload a transfer slip, and the person who asked confirms it arrived.

**General users:** someone who belongs to no Seng can register without a clan code, use the donations area only, and later send a clan code to that clan's leader to become a member.

**Profiles and KYC:** everyone keeps their own personal details, address and contact channels (WhatsApp, Facebook, TikTok) with a profile photo, and records their identity documents. The Super Admin approves them, and an approved document is what lets someone join a clan or ask for donations.

### Upgrading an existing database
Run `npm run db:setup` again after pulling new code. The schema only adds what is missing and never deletes data.

## Setup

1. **Create the database in Navicat.** Connect to your local PostgreSQL, right-click → *New Database* → name it `fund_clan`.
2. **Configure env.** Open `.env.local` (already created, with a generated `SESSION_SECRET`) and set `DATABASE_URL` to your Navicat connection:
   ```
   DATABASE_URL=postgresql://postgres:<your-password>@localhost:5432/fund_clan
   ```
   Change `SUPER_ADMIN_PHONE` / `SUPER_ADMIN_PASSWORD` to your own before the next step.
   When you deploy, also set `SITE_URL` to the public address (e.g. `https://fund.example.la`), so shared donation links and their Facebook previews point at the real site. On localhost it is worked out from the request and can be left unset.
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
| General user (no clan) | 02085555555 | Password123 |

## Two areas

The product is two things, and the header says which one you are in:

- **Funeral fund** — one clan's business: members, deaths, collections, payments, the fund and its reports. The Super Admin's equivalent is **Platform** (clans, accounts, identity checks, platform reports).
- **Donations** — the whole platform's: anyone the platform has identified can ask for help, and anyone signed in can give, across every clan.

A feature belongs to exactly one area. The tabs under the switcher are that area's sections, and they come from one list in `lib/navigation.ts` — adding a page there is what puts it in the header. Account and notifications sit in the header itself, because they belong to neither area.

## How it works

| Flow | Behaviour |
|---|---|
| Register (`/register`) | The clan code is **optional**. With one, the account is created as **pending** for that clan. Without one, the person becomes a **general user** straight away and can sign in at once |
| Leader approval (`/clan`) | Leader approves or declines. Only then can the member sign in |
| General users | Someone who is in no Seng. They see **only the donations area** — no clan fund, events, payments or family — and can ask for help and give like anyone else. `/member`, `/clan` and `/admin` are out of reach |
| Joining a clan later (`/account`) | A general user sends a clan code to that clan's leader, who sees the request on `/clan` and approves or declines it. Approving makes them a **member** of that clan; because their role changed, their old session ends and they sign in again. They can take a waiting request back and ask a different clan |
| Sign in (`/login`) | Phone + password → redirected to `/admin`, `/clan`, `/member` or `/donations` by role |
| Super Admin (`/admin`) | Create clans and their leader accounts, enable or disable clans, set the platform fee %, reset a leader's password |
| People (`/admin`) | One card per kind of account — everyone, clan leaders, members, general users, awaiting approval — each opening that part of the user list |
| Users (`/admin/users`) | Every account on the platform: name, phone, email, role, clan (or "no clan"), status and last sign-in. Searchable by name, phone, email or clan code, and filtered by kind (`?people=leaders`, `members`, `general`, `waiting`). From here the Super Admin can **block** an account (which signs that person out at once) or **delete** one, and **View details** opens the person's own page |
| One person (`/admin/users/[id]`) | Everything about one account — profile and contact details, when they joined, who approved them, last sign-in, when the password last changed — with counts of their family, requests for help, donations, unpaid bills and slips, the history of what has been done to the account, and the actions: block, **reset the password** to a temporary one, and delete. Identity documents appear as **type and verified state only**: the number is masked and the scan is not linked |
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
| Donations (`/donations`) | **Cross-clan.** A member or leader posts a request (title, story, optional target and deadline, photo, bank account / QR). Everyone signed in sees all requests and can give: the donor uploads their transfer slip, optionally anonymously, and the **person who asked** confirms it arrived or rejects it with a reason. Only confirmed donations count towards the total. The asker can **edit** their request afterwards (details, payment information, photo/QR) and close or reopen it |
| Sharing a request (`/d/[id]`) | Every request has a **public page** that opens without signing in, for Facebook, WhatsApp, Telegram or a copied link. It shows the title, story, photo and progress, and deliberately **not** the bank account, QR code or donor names. A visitor who wants to give is sent to sign in and comes straight back to the request |
| Notifications (bell in the header, `/notifications`) | Each person is told what concerns them: an identity document arriving for review (to the Super Admin, who also carries a count on the Identity tab until the queue is clear) and its decision, registration approved, a new collection and what they owe, debt carried over, slips uploaded/approved/rejected, payouts awaiting a treasurer and paid, savings periods opened, and donations received/confirmed/rejected. The bell shows the unread count; opening it marks them read |
| Account (`/account`) | Everyone keeps their own **profile** here: first and last name, date of birth (the age is worked out from it, never stored), gender, profile photo, village / district / province, and how to reach them — email, WhatsApp, Facebook, TikTok. Details are **read until "Edit" is pressed**, then saved or cancelled. The sign-in phone number is shown but not editable. The page also shows their role, **account status** and clan (or "not in a clan yet"), and lets them change their password, which signs out their other devices |
| Identity documents (`/account`) | Each person records their own ID: national ID card, family book, passport, driving licence or another document, with its number, issue and expiry dates, a note and a photo or PDF of it. Each one waits for the platform's decision, and a turned-down document shows the reason. A document that has been sent in can be **opened but never deleted** — it is the evidence of an identity check, so a wrong one is turned down rather than erased. An unconfirmed identity is **warned about at the top of the account page**, and each state (not confirmed / waiting / approved / not accepted) carries its own colour, icon and words |
| Identity checks (`/admin/kyc`) | **Only the Super Admin approves identity documents.** The queue shows everyone waiting, oldest first, with the person, their clan, the document and its scan; turning one down needs a reason, which the person sees. An approval can be taken back with **Review again**, putting the document back in the queue. Decisions can also be made from a person's own page |
| What KYC unlocks | **An approved document is required before someone can join a clan or ask for donations.** Both are refused by the server as well as hidden in the UI. Giving to someone else's request is not gated |
| Checking a member (`/clan/members/[id]`) | A clan leader opens any member of their own clan from the members table and sees their personal details, contact channels and documents — but the decision is the platform's, not theirs |

### Security & tenant isolation
- Passwords are hashed with scrypt (`lib/password.ts`).
- The session is a signed JWT (`jose`) in an httpOnly cookie (`lib/session.ts`).
- `proxy.ts` does fast cookie-only role redirects. `lib/dal.ts` re-checks the user **in the database on every request**, so a disabled user or clan loses access immediately.
- **Strict rate compliance is enforced by the database:** a trigger rejects any change to a clan's mode or rate, including one made directly in Navicat, unless the same transaction records an approved change with its meeting minutes.
- **Money is tamper-evident:** an event's rate, mode and fee % are locked by a trigger, bill amounts can't change, and `fund_ledger` is append-only, so corrections are reversing entries.
- **The public share page gives nothing away:** `/d/[id]` serves only the title, story, cover photo and totals — never the bank account, QR code, donor names or amounts — and it is marked `noindex` so it stays out of search results. Only the cover photo of a live request is public (`/d/[id]/photo`); every other upload still needs a session.
- **The Super Admin sees accounts, not a clan's money:** `/admin/users` shows every account (name, phone, role, clan, status) so the platform owner can support and audit the system, and counts of what each person has done — never the amounts. No member's payments, bills, debts or family are readable, the platform report stays totals-only, and the Super Admin still cannot open a clan's fund or events.
- **A Super Admin account can't be blocked or deleted**, by anyone including itself, so the platform can never be locked out of its own administration. Blocking bumps `session_version`, so the blocked person is signed out within the same request rather than when their week-old cookie expires.
- **Identity documents are readable by three people only:** the person who added them, the Super Admin who decides on them, and the leader of their own clan. Another clan's leader gets a 404 on the page, the scan and even the profile photo (`/files/[id]` enforces this). A profile photo is open to the person's own clan and the Super Admin, never across clans.
- **Approving identity rests with the platform, not with the clan that benefits from it.** A clan leader can look at a member's document but has no approve button, and the approval is what unlocks joining a clan and asking for money — so the two are deliberately not decided by the same person.
- **Deleting an account is only possible when nothing depends on it.** Bills, slips, payouts, events and donations hold the row with `ON DELETE RESTRICT`; the database refusing is what the delete relies on, and the answer offered is to block the account instead. Money history can never be erased by deleting a person.
- **A general user is outside every clan:** the database itself requires `clan_id IS NULL` for them (and for the Super Admin), and a clan's queries only ever see people who were let in — asking to join writes to `clan_join_requests`, never to the clan. Approving is the only thing that sets `clan_id`, and it bumps `session_version`, so the older session carrying the old role dies immediately.
- **Donations stay out of the clan fund:** money goes directly to the person who asked, so nothing is written to `fund_ledger`. Donation photos and QR codes are visible to every signed-in user; donation slips only to the donor and the asker.
- **Slips are private:** only the member who uploaded a slip and their clan leader can open it. Payments recorded from a slip can't be undone by hand.
- Uploaded files are stored in the `files` table and served only to signed-in users of the same clan (`/files/[id]`). The type is checked from the file content, not the file name.
- Every clan query is scoped by the signed-in user's `clan_id`. A leader can't read or change another clan's members, even by sending a forged member id.

## Languages
English, Lao and Hmong via the language button (top right). Text lives in `lib/i18n/en.json`, `la.json` and `hm.json`. `en.json` defines the keys, and TypeScript fails the build if a translation is missing one. The Lao and Hmong wording should be reviewed by native speakers before launch.

## Adding a feature

1. **Pick the area** (funeral fund, platform, or donations) — that decides the role folder the page lives in: `app/clan`, `app/member`, `app/admin` or `app/donations`.
2. **Write the queries** in `lib/<feature>.ts` (`server-only`, scoped by `clan_id` for anything a clan owns), and the writes as server actions in `app/actions/<feature>.ts`. Every action starts with `requireRole(...)`.
3. **Gate it with a capability** from `lib/access.ts` when the rule is about what someone may do rather than where they may go — the page uses it to decide what to show, the action uses the same one because a page can be bypassed.
4. **Add the tab** to the right `sections` list in `lib/navigation.ts`.
5. **Add the words** to `lib/i18n/en.json` first: `en.json` defines the keys and the build fails until `la.json` and `hm.json` have them too.
6. **Add the schema** as a new section at the end of `db/schema.sql`, written so it can be re-run (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, idempotent backfills).

## Structure
```
db/schema.sql          tables: clans, users, dependents, user_documents, clan_join_requests, platform_settings, audit_logs
scripts/db-setup.ts    applies schema, seeds super admin (+ demo)
lib/                   db pool, session, DAL, validation (zod), formatting
lib/navigation.ts      the two areas and every tab in them
lib/access.ts          what a signed-in person may do (used by pages and actions alike)
lib/i18n/              dictionaries (en, lo, hmn) + locale cookie helpers
proxy.ts               optimistic route guard
app/(auth)/            login + register
app/admin|clan|member  role dashboards (admin/users: account management)
app/actions/           server actions (auth, admin, clan)
```

## Reports & exports
- Day boundaries use Laos time (Asia/Vientiane).
- PDFs embed Public Sans (Latin) and Noto Sans Lao from `@fontsource` packages; amounts are written as "Kip" / "ກີບ" because neither font has the ₭ sign. `next.config.ts` marks `pdfkit` and `exceljs` as server-external and traces the font files into deployments.

## All TOR phases are built
Suggested next steps: native-speaker review of the Lao and Hmong text, SMS/WhatsApp notifications for new bills, and a payment-gateway integration if the platform fee should transfer automatically.
