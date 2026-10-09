-- Fund & Clan Management System — Phase 1 schema
-- Run this in Navicat (Query window) against your database, or use `npm run db:setup`.
-- Safe to re-run: every object is created only if it does not already exist.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'clan_admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- pending: registered, waiting for the clan leader to approve
  -- active: may use the system
  -- rejected: registration declined by the clan leader
  -- disabled: account switched off (by super admin or clan leader)
  CREATE TYPE user_status AS ENUM ('pending', 'active', 'rejected', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- A: pre-collected savings into the central fund
  -- B: collect on demand when a death is reported
  CREATE TYPE fund_mode AS ENUM ('A', 'B');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Platform settings (single row, owned by the super admin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_settings (
  id                   SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  platform_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 1.50
                       CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Clans (tenants)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(20)  NOT NULL UNIQUE,  -- short code members type when registering
  name                VARCHAR(150) NOT NULL,
  description         TEXT,
  fund_mode           fund_mode    NOT NULL DEFAULT 'B',
  contribution_amount BIGINT       NOT NULL DEFAULT 100000 CHECK (contribution_amount >= 0), -- Kip per person per event
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Users (all three roles). Every non-super-admin row belongs to exactly one clan;
-- all tenant queries in the app are scoped by clan_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id       UUID REFERENCES clans(id) ON DELETE RESTRICT,
  role          user_role   NOT NULL DEFAULT 'member',
  status        user_status NOT NULL DEFAULT 'pending',
  full_name     VARCHAR(150) NOT NULL,
  phone         VARCHAR(20)  NOT NULL UNIQUE,  -- login identifier
  email         VARCHAR(150),
  village       VARCHAR(150),
  password_hash TEXT NOT NULL,
  approved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_clan_required CHECK (
    (role = 'super_admin' AND clan_id IS NULL) OR
    (role <> 'super_admin' AND clan_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_clan_status_idx ON users (clan_id, status);

-- ---------------------------------------------------------------------------
-- Dependents (family members linked to a primary member). UI comes in a later phase.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dependents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id       UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  member_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name     VARCHAR(150) NOT NULL,
  relationship  VARCHAR(30)  NOT NULL, -- spouse, child, father, mother, ...
  date_of_birth DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dependents_member_idx ON dependents (clan_id, member_id);

-- ---------------------------------------------------------------------------
-- Audit log (who did what, per clan)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  clan_id    UUID REFERENCES clans(id) ON DELETE SET NULL,
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(60) NOT NULL,
  target_id  UUID,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_clan_idx ON audit_logs (clan_id, created_at DESC);

-- ===========================================================================
-- Phase 2: fund settings with meeting minutes, dependents, password changes.
-- Everything below is additive and safe to run on an existing Phase 1 database.
-- ===========================================================================

DO $$ BEGIN
  CREATE TYPE contribution_period AS ENUM ('monthly', 'yearly'); -- Mode A savings schedule
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE clans ADD COLUMN IF NOT EXISTS contribution_period contribution_period;
ALTER TABLE clans ADD COLUMN IF NOT EXISTS rate_version INT NOT NULL DEFAULT 1; -- bumps on every approved change

-- Every session token carries session_version; changing or resetting a password bumps it,
-- which ends all older sessions without relying on clocks.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- Uploaded files (meeting minutes now, transfer slips in Phase 4).
-- Stored in the database so backups include them and every file belongs to one clan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id      UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  purpose      VARCHAR(30)  NOT NULL, -- 'meeting_minutes'
  file_name    VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size_bytes   INT          NOT NULL CHECK (size_bytes > 0),
  data         BYTEA        NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS files_clan_idx ON files (clan_id, purpose);

-- ---------------------------------------------------------------------------
-- Every change to fund mode / rate, with the meeting minutes that approved it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clan_rate_changes (
  id               BIGSERIAL PRIMARY KEY,
  clan_id          UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  changed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  version          INT NOT NULL,
  old_fund_mode    fund_mode NOT NULL,
  new_fund_mode    fund_mode NOT NULL,
  old_amount       BIGINT NOT NULL,
  new_amount       BIGINT NOT NULL CHECK (new_amount > 0),
  old_period       contribution_period,
  new_period       contribution_period,
  meeting_date     DATE NOT NULL,
  note             TEXT,
  minutes_file_id  UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clan_id, version)
);

-- Strict rate compliance, enforced by the database itself: a clan's mode, rate or
-- period can only change in the same transaction that records an approved change
-- (with its minutes) for exactly those values. Direct edits are rejected.
CREATE OR REPLACE FUNCTION enforce_rate_change_approval() RETURNS trigger AS $$
BEGIN
  IF NEW.fund_mode IS DISTINCT FROM OLD.fund_mode
     OR NEW.contribution_amount IS DISTINCT FROM OLD.contribution_amount
     OR NEW.contribution_period IS DISTINCT FROM OLD.contribution_period THEN
    IF NOT EXISTS (
      SELECT 1 FROM clan_rate_changes r
       WHERE r.clan_id = NEW.id
         AND r.created_at = now()
         AND r.version = NEW.rate_version
         AND r.new_fund_mode = NEW.fund_mode
         AND r.new_amount = NEW.contribution_amount
         AND r.new_period IS NOT DISTINCT FROM NEW.contribution_period
    ) THEN
      RAISE EXCEPTION 'Fund mode / rate can only change with approved meeting minutes (clan_rate_changes)';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clans_rate_change_guard ON clans;
CREATE TRIGGER clans_rate_change_guard
  BEFORE UPDATE OF fund_mode, contribution_amount, contribution_period ON clans
  FOR EACH ROW EXECUTE FUNCTION enforce_rate_change_approval();

-- ---------------------------------------------------------------------------
-- Dependents: soft delete (Phase 3 death events will reference them) + allowed relationships.
-- ---------------------------------------------------------------------------
ALTER TABLE dependents ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE dependents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DO $$ BEGIN
  ALTER TABLE dependents ADD CONSTRAINT dependents_relationship_check
    CHECK (relationship IN ('spouse', 'child', 'father', 'mother'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===========================================================================
-- Phase 3: death events, collection bills, debt carry-over, fund ledger,
-- platform fees, and two-person payout approval. Additive and re-runnable.
-- ===========================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_treasurer BOOLEAN NOT NULL DEFAULT FALSE; -- second approver for payouts
ALTER TABLE users ADD COLUMN IF NOT EXISTS deceased_at DATE;
ALTER TABLE dependents ADD COLUMN IF NOT EXISTS deceased_at DATE;

DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('collecting', 'awaiting_payout', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- unpaid: event still collecting | paid: paid for this event | carried: event closed unpaid, now a debt
  -- settled: a carried debt paid later | void: event cancelled
  CREATE TYPE bill_status AS ENUM ('unpaid', 'paid', 'carried', 'settled', 'void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM ('requested', 'approved', 'rejected', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ledger_type AS ENUM ('deposit', 'collection', 'debt_collection', 'platform_fee', 'payout', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fee_status AS ENUM ('owed', 'received');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- A reported death. The rate, mode and fee % are copied in at report time and locked.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS death_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id               UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  event_no              INT  NOT NULL,
  deceased_member_id    UUID REFERENCES users(id) ON DELETE RESTRICT,
  deceased_dependent_id UUID REFERENCES dependents(id) ON DELETE RESTRICT,
  family_member_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, -- the household's member account
  deceased_name         VARCHAR(150) NOT NULL,
  deceased_relationship VARCHAR(30), -- null when the deceased is the member themself
  date_of_death         DATE NOT NULL,
  note                  TEXT,
  fund_mode             fund_mode NOT NULL,
  rate_version          INT NOT NULL,
  rate_amount           BIGINT NOT NULL CHECK (rate_amount > 0),
  platform_fee_percent  NUMERIC(5, 2) NOT NULL,
  status                event_status NOT NULL,
  gross_collected       BIGINT, -- set when collection closes (Mode B)
  fee_amount            BIGINT,
  reported_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at             TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  cancelled_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at          TIMESTAMPTZ,
  UNIQUE (clan_id, event_no),
  CONSTRAINT death_events_one_deceased CHECK ((deceased_member_id IS NULL) <> (deceased_dependent_id IS NULL))
);
CREATE INDEX IF NOT EXISTS death_events_clan_idx ON death_events (clan_id, reported_at DESC);
-- The same person can't be reported twice (unless the earlier report was cancelled).
CREATE UNIQUE INDEX IF NOT EXISTS death_events_member_once ON death_events (deceased_member_id)
  WHERE deceased_member_id IS NOT NULL AND status <> 'cancelled';
CREATE UNIQUE INDEX IF NOT EXISTS death_events_dependent_once ON death_events (deceased_dependent_id)
  WHERE deceased_dependent_id IS NOT NULL AND status <> 'cancelled';

-- Strict rate compliance for events: the copied rate, mode and fee % can never be edited.
CREATE OR REPLACE FUNCTION lock_event_rate() RETURNS trigger AS $$
BEGIN
  IF NEW.rate_amount IS DISTINCT FROM OLD.rate_amount
     OR NEW.rate_version IS DISTINCT FROM OLD.rate_version
     OR NEW.fund_mode IS DISTINCT FROM OLD.fund_mode
     OR NEW.platform_fee_percent IS DISTINCT FROM OLD.platform_fee_percent THEN
    RAISE EXCEPTION 'The rate of a reported event is locked and cannot be changed';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS death_events_rate_lock ON death_events;
CREATE TRIGGER death_events_rate_lock BEFORE UPDATE ON death_events
  FOR EACH ROW EXECUTE FUNCTION lock_event_rate();

-- ---------------------------------------------------------------------------
-- One bill per member account per Mode B event (the rate is per household).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_bills (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id      UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  event_id     UUID NOT NULL REFERENCES death_events(id) ON DELETE RESTRICT,
  member_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount       BIGINT NOT NULL CHECK (amount > 0),
  carried_in   BIGINT NOT NULL DEFAULT 0, -- earlier debt shown on this bill
  status       bill_status NOT NULL DEFAULT 'unpaid',
  paid_at      TIMESTAMPTZ,
  paid_method  VARCHAR(20), -- 'cash' | 'transfer'
  recorded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, member_id)
);
CREATE INDEX IF NOT EXISTS event_bills_member_idx ON event_bills (clan_id, member_id, status);

CREATE OR REPLACE FUNCTION lock_bill_amount() RETURNS trigger AS $$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'A bill amount is locked and cannot be changed';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS event_bills_amount_lock ON event_bills;
CREATE TRIGGER event_bills_amount_lock BEFORE UPDATE ON event_bills
  FOR EACH ROW EXECUTE FUNCTION lock_bill_amount();

-- ---------------------------------------------------------------------------
-- Payout to the bereaved family: the leader requests, a treasurer approves, the leader pays.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payouts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id        UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  event_id       UUID NOT NULL REFERENCES death_events(id) ON DELETE RESTRICT,
  amount         BIGINT NOT NULL CHECK (amount > 0),
  receiver_name  VARCHAR(150) NOT NULL,
  receiver_phone VARCHAR(20),
  note           TEXT,
  status         payout_status NOT NULL DEFAULT 'requested',
  requested_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by     UUID REFERENCES users(id) ON DELETE RESTRICT,
  decided_at     TIMESTAMPTZ,
  decision_note  TEXT,
  paid_by        UUID REFERENCES users(id) ON DELETE RESTRICT,
  paid_at        TIMESTAMPTZ,
  paid_method    VARCHAR(20),
  proof_file_id  UUID REFERENCES files(id) ON DELETE RESTRICT,
  -- Two different people: whoever approves can never be whoever requested.
  CONSTRAINT payouts_two_people CHECK (decided_by IS NULL OR decided_by <> requested_by)
);
-- At most one live (not rejected) payout per event.
CREATE UNIQUE INDEX IF NOT EXISTS payouts_one_live ON payouts (event_id) WHERE status <> 'rejected';

-- ---------------------------------------------------------------------------
-- Fund ledger: every Kip in (+) or out (-). Append-only; mistakes are fixed with a reversing entry.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fund_ledger (
  id          BIGSERIAL PRIMARY KEY,
  clan_id     UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  entry_type  ledger_type NOT NULL,
  amount      BIGINT NOT NULL CHECK (amount <> 0),
  event_id    UUID REFERENCES death_events(id) ON DELETE RESTRICT,
  bill_id     UUID REFERENCES event_bills(id) ON DELETE RESTRICT,
  payout_id   UUID REFERENCES payouts(id) ON DELETE RESTRICT,
  note        TEXT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fund_ledger_clan_idx ON fund_ledger (clan_id, created_at DESC);

CREATE OR REPLACE FUNCTION ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'The fund ledger is append-only; record a reversing entry instead';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS fund_ledger_append_only ON fund_ledger;
CREATE TRIGGER fund_ledger_append_only BEFORE UPDATE OR DELETE ON fund_ledger
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

-- ---------------------------------------------------------------------------
-- Platform fee per event, owed to the system owner until the super admin marks it received.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_fees (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id      UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  event_id     UUID NOT NULL UNIQUE REFERENCES death_events(id) ON DELETE RESTRICT,
  percent      NUMERIC(5, 2) NOT NULL,
  base_amount  BIGINT NOT NULL,
  fee_amount   BIGINT NOT NULL CHECK (fee_amount >= 0),
  status       fee_status NOT NULL DEFAULT 'owed',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at  TIMESTAMPTZ,
  received_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ===========================================================================
-- Phase 4: Mode A contribution periods, member transfer slips with leader review,
-- payment history. Additive and re-runnable.
-- ===========================================================================

ALTER TYPE ledger_type ADD VALUE IF NOT EXISTS 'contribution';

DO $$ BEGIN
  CREATE TYPE due_status AS ENUM ('unpaid', 'paid', 'void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE slip_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- A Mode A savings period (e.g. '2026-09' monthly or '2026' yearly). The amount is
-- copied from the clan's approved rate when the period opens and never changes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contribution_periods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id      UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  label        VARCHAR(7) NOT NULL, -- YYYY-MM or YYYY
  period_type  contribution_period NOT NULL,
  amount       BIGINT NOT NULL CHECK (amount > 0),
  rate_version INT NOT NULL,
  opened_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clan_id, label)
);

CREATE OR REPLACE FUNCTION lock_period_amount() RETURNS trigger AS $$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.rate_version IS DISTINCT FROM OLD.rate_version THEN
    RAISE EXCEPTION 'A contribution period amount is locked and cannot be changed';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS contribution_periods_amount_lock ON contribution_periods;
CREATE TRIGGER contribution_periods_amount_lock BEFORE UPDATE ON contribution_periods
  FOR EACH ROW EXECUTE FUNCTION lock_period_amount();

-- One due per member per period.
CREATE TABLE IF NOT EXISTS contribution_dues (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id      UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  period_id    UUID NOT NULL REFERENCES contribution_periods(id) ON DELETE RESTRICT,
  member_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount       BIGINT NOT NULL CHECK (amount > 0),
  status       due_status NOT NULL DEFAULT 'unpaid',
  paid_at      TIMESTAMPTZ,
  paid_method  VARCHAR(20),
  recorded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_id, member_id)
);
CREATE INDEX IF NOT EXISTS contribution_dues_member_idx ON contribution_dues (clan_id, member_id, status);
DROP TRIGGER IF EXISTS contribution_dues_amount_lock ON contribution_dues;
CREATE TRIGGER contribution_dues_amount_lock BEFORE UPDATE ON contribution_dues
  FOR EACH ROW EXECUTE FUNCTION lock_bill_amount();

-- ---------------------------------------------------------------------------
-- Proof of transfer uploaded by a member for one bill (optionally with their earlier
-- debt) or one contribution due. The leader approves or rejects it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_slips (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id        UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  member_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  bill_id        UUID REFERENCES event_bills(id) ON DELETE RESTRICT,
  due_id         UUID REFERENCES contribution_dues(id) ON DELETE RESTRICT,
  include_debt   BOOLEAN NOT NULL DEFAULT FALSE,
  amount_claimed BIGINT NOT NULL CHECK (amount_claimed > 0),
  transfer_date  DATE NOT NULL,
  note           TEXT,
  file_id        UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  status         slip_status NOT NULL DEFAULT 'pending',
  reviewed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  review_note    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_slips_one_target CHECK ((bill_id IS NULL) <> (due_id IS NULL))
);
CREATE INDEX IF NOT EXISTS payment_slips_clan_idx ON payment_slips (clan_id, status, created_at DESC);
-- Only one slip waiting for review per bill / due.
CREATE UNIQUE INDEX IF NOT EXISTS payment_slips_one_pending_bill ON payment_slips (bill_id) WHERE status = 'pending' AND bill_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_slips_one_pending_due ON payment_slips (due_id) WHERE status = 'pending' AND due_id IS NOT NULL;

ALTER TABLE fund_ledger ADD COLUMN IF NOT EXISTS due_id UUID REFERENCES contribution_dues(id) ON DELETE RESTRICT;
ALTER TABLE fund_ledger ADD COLUMN IF NOT EXISTS slip_id UUID REFERENCES payment_slips(id) ON DELETE RESTRICT;

-- ===========================================================================
-- Donations: a member or leader asks for help (illness, fire, school fees...).
-- Visible to every signed-in user across all clans; donors transfer money
-- directly to the person who asked, so none of this touches a clan's fund ledger.
-- ===========================================================================

DO $$ BEGIN
  CREATE TYPE donation_request_status AS ENUM ('open', 'closed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE donation_status AS ENUM ('pending', 'confirmed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS donation_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id        UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT, -- the asker's clan, shown for context
  created_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title          VARCHAR(150) NOT NULL,
  story          TEXT NOT NULL,
  target_amount  BIGINT CHECK (target_amount IS NULL OR target_amount > 0), -- optional goal
  deadline       DATE,
  bank_name      VARCHAR(100),
  account_name   VARCHAR(150),
  account_number VARCHAR(50),
  photo_file_id  UUID REFERENCES files(id) ON DELETE RESTRICT, -- cover photo (public to signed-in users)
  qr_file_id     UUID REFERENCES files(id) ON DELETE RESTRICT, -- payment QR (public to signed-in users)
  status         donation_request_status NOT NULL DEFAULT 'open',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS donation_requests_feed_idx ON donation_requests (status, created_at DESC);

-- One donation: the donor uploads proof of transfer, the asker confirms it arrived.
CREATE TABLE IF NOT EXISTS donations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES donation_requests(id) ON DELETE RESTRICT,
  donor_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount        BIGINT NOT NULL CHECK (amount > 0),
  transfer_date DATE NOT NULL,
  message       TEXT,
  anonymous     BOOLEAN NOT NULL DEFAULT FALSE, -- hides the donor's name from everyone but the asker
  slip_file_id  UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  status        donation_status NOT NULL DEFAULT 'pending',
  review_note   TEXT,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS donations_request_idx ON donations (request_id, status);
CREATE INDEX IF NOT EXISTS donations_donor_idx ON donations (donor_id, created_at DESC);

-- A donation's amount is fixed once given; only its review status may change.
CREATE OR REPLACE FUNCTION lock_donation_amount() RETURNS trigger AS $$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.donor_id IS DISTINCT FROM OLD.donor_id
     OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.slip_file_id IS DISTINCT FROM OLD.slip_file_id THEN
    RAISE EXCEPTION 'A donation record is locked and cannot be changed';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS donations_amount_lock ON donations;
CREATE TRIGGER donations_amount_lock BEFORE UPDATE ON donations
  FOR EACH ROW EXECUTE FUNCTION lock_donation_amount();

-- ===========================================================================
-- Notifications: one row per person per thing that happened. Written by the
-- actions that cause them; the text itself is built from `type` + `params`
-- so every reader sees it in their own language.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(40) NOT NULL,
  params     JSONB NOT NULL DEFAULT '{}'::jsonb,
  link       VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- ===========================================================================
-- General users: someone who is not in any Seng (clan). They register without a
-- clan code, see only the donations area, and can ask a clan's leader to let
-- them in later. Additive and re-runnable.
-- ===========================================================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';

-- A general user has no clan; members and leaders must have one.
-- Written as role::text on purpose: PostgreSQL refuses to use an enum value in the
-- same transaction that added it, and db/schema.sql is applied in one go.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_clan_required;
ALTER TABLE users ADD CONSTRAINT users_clan_required CHECK (
  (role::text IN ('super_admin', 'user') AND clan_id IS NULL) OR
  (role::text IN ('clan_admin', 'member') AND clan_id IS NOT NULL)
);

-- Donation requests, and the photos attached to them, may come from someone with no clan.
ALTER TABLE donation_requests ALTER COLUMN clan_id DROP NOT NULL;
ALTER TABLE files ALTER COLUMN clan_id DROP NOT NULL;

DO $$ BEGIN
  -- pending: waiting for the clan leader | withdrawn: taken back by the asker
  CREATE TYPE join_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- A general user asking to join a clan. Approving it is what turns them into a
-- member, so every clan-scoped query keeps seeing only people who were let in.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clan_join_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id     UUID NOT NULL REFERENCES clans(id) ON DELETE RESTRICT,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      join_status NOT NULL DEFAULT 'pending',
  note        TEXT, -- the leader's reason when declined
  decided_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One request at a time per person, so nobody can queue up at every clan at once.
CREATE UNIQUE INDEX IF NOT EXISTS clan_join_requests_one_pending ON clan_join_requests (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS clan_join_requests_clan_idx ON clan_join_requests (clan_id, status, created_at DESC);

-- ===========================================================================
-- Fuller profiles: who someone is, how to reach them, and the identity
-- documents their clan leader checks. Additive and re-runnable.
-- ===========================================================================
DO $$ BEGIN
  CREATE TYPE gender AS ENUM ('female', 'male', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- full_name stays the name the app displays; first/last are kept separately and
-- rewrite full_name whenever both are given.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name    VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name     VARCHAR(80);
-- Age is never stored: it is worked out from the date of birth, so it can't go stale.
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender        gender;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_file_id UUID REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS district      VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS province      VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp      VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook      VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tiktok        VARCHAR(150);

DO $$ BEGIN
  CREATE TYPE id_document AS ENUM ('national_id', 'family_book', 'passport', 'driving_licence', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Identity documents (KYC). Someone records their own; their clan leader is the
-- one who confirms the document was seen. Nobody else can read the scan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type    id_document NOT NULL,
  doc_number  VARCHAR(60) NOT NULL,
  issued_on   DATE,
  expires_on  DATE,
  file_id     UUID REFERENCES files(id) ON DELETE RESTRICT, -- photo or PDF of the document
  note        VARCHAR(200),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_documents_dates CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX IF NOT EXISTS user_documents_user_idx ON user_documents (user_id, created_at DESC);
-- The same document is only recorded once per person.
CREATE UNIQUE INDEX IF NOT EXISTS user_documents_once ON user_documents (user_id, doc_type, doc_number);

-- ===========================================================================
-- KYC review: the platform owner (super admin) decides on identity documents,
-- and an approved document is what opens up joining a clan and asking for
-- donations. Additive and re-runnable.
-- ===========================================================================
DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS status      kyc_status NOT NULL DEFAULT 'pending';
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS review_note VARCHAR(300); -- why it was turned down
-- verified_at / verified_by now record the decision, whichever way it went.
UPDATE user_documents SET status = 'approved' WHERE verified_at IS NOT NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS user_documents_queue_idx ON user_documents (status, created_at);
