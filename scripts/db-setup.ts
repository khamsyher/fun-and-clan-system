// Creates the schema and seeds the super admin (and optionally demo data).
// Usage: npm run db:setup                    -> schema + super admin
//        npm run db:setup -- --demo          -> also a demo clan, leader and members
//        npm run db:setup -- --savings-demo  -> also 10 demo users and 3 savings groups
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { hashPassword } from "../lib/password";

process.loadEnvFile?.(join(process.cwd(), ".env.local"));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
    await client.query(schema);
    console.log("✓ Schema applied");

    const phone = process.env.SUPER_ADMIN_PHONE;
    const password = process.env.SUPER_ADMIN_PASSWORD;
    const name = process.env.SUPER_ADMIN_NAME ?? "System Owner";
    if (!phone || !password) {
      console.log("! SUPER_ADMIN_PHONE / SUPER_ADMIN_PASSWORD not set — skipped super admin seed");
    } else {
      const res = await client.query(
        `INSERT INTO users (role, status, full_name, phone, password_hash)
         VALUES ('super_admin', 'active', $1, $2, $3)
         ON CONFLICT (phone) DO NOTHING RETURNING id`,
        [name, phone, await hashPassword(password)],
      );
      console.log(res.rowCount ? `✓ Super admin created (${phone})` : `• Super admin ${phone} already exists`);
    }

    if (process.argv.includes("--demo")) await seedDemo(client);
    if (process.argv.includes("--savings-demo")) await seedSavingsDemo(client);
  } finally {
    await client.end();
  }
}

async function seedDemo(client: Client) {
  const clan = await client.query<{ id: string }>(
    `INSERT INTO clans (code, name, description, fund_mode, contribution_amount)
     VALUES ('VANG01', 'Vang Clan — Vientiane', 'Demo clan', 'B', 100000)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  const clanId = clan.rows[0].id;
  const pw = await hashPassword("Password123");
  const people: [string, string, string, string][] = [
    ["clan_admin", "active", "Tou Vang", "02011111111"],
    ["member", "active", "Mai Vang", "02022222222"],
    ["member", "pending", "Chue Vang", "02033333333"],
    ["member", "pending", "Pheng Vang", "02044444444"],
  ];
  for (const [role, status, fullName, phone] of people) {
    await client.query(
      `INSERT INTO users (clan_id, role, status, full_name, phone, password_hash, approved_at)
       VALUES ($1, $2::user_role, $3::user_status, $4, $5, $6, CASE WHEN $3::user_status = 'active' THEN now() END) ON CONFLICT (phone) DO NOTHING`,
      [clanId, role, status, fullName, phone, pw],
    );
  }
  // A general user: in no clan, so they see only the donations area.
  await client.query(
    `INSERT INTO users (clan_id, role, status, full_name, phone, password_hash)
     VALUES (NULL, 'user', 'active', 'Bee Lor', '02085555555', $1) ON CONFLICT (phone) DO NOTHING`,
    [pw],
  );
  // The demo accounts come identity-checked, since joining a clan and asking for
  // donations both need an approved document.
  await client.query(
    `INSERT INTO user_documents (user_id, doc_type, doc_number, status, verified_at, verified_by)
     SELECT u.id, 'national_id', 'DEMO-' || right(u.phone, 4), 'approved', now(),
            (SELECT id FROM users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1)
       FROM users u
      WHERE u.phone IN ('02011111111', '02022222222', '02085555555')
     ON CONFLICT (user_id, doc_type, doc_number) DO NOTHING`,
  );
  console.log("✓ Demo clan VANG01 seeded (all demo passwords: Password123)");
  console.log("    leader 02011111111 · member 02022222222 · pending 02033333333, 02044444444");
  console.log("    general user (no clan) 02085555555");
}

// Ten general users (no clan, identity approved) and three savings groups, one of each kind:
// running mid-way, still forming, and finished. Built the way the app builds them — rounds
// and payments as startGroup writes them, fees as a completed round records them — so every
// savings screen has realistic data. Re-running skips what already exists.
const SAVINGS_PEOPLE: [string, string, string][] = [
  // name, phone, bank account number
  ["Nou Xiong", "02090000001", "0101-0000-0001"],
  ["Kia Thao", "02090000002", "0101-0000-0002"],
  ["Pa Yang", "02090000003", "0101-0000-0003"],
  ["Tong Lee", "02090000004", "0101-0000-0004"],
  ["Mai Her", "02090000005", "0101-0000-0005"],
  ["Vue Lor", "02090000006", "0101-0000-0006"],
  ["Ying Moua", "02090000007", "0101-0000-0007"],
  ["Chong Vang", "02090000008", "0101-0000-0008"],
  ["Shoua Cha", "02090000009", "0101-0000-0009"],
  ["Fue Khang", "02090000010", "0101-0000-0010"],
];

type DemoGroup = {
  code: string;
  name: string;
  description: string;
  amount: number;
  period: "weekly" | "monthly";
  /** Round 1's due date, as SQL relative to today. */
  start: string;
  /** Indexes into SAVINGS_PEOPLE, in turn order; the first is the organizer. */
  members: number[];
  pending?: number[];
  /** forming: not started. Otherwise how many rounds are fully paid, and payments confirmed in the next. */
  state: { status: "forming" } | { status: "active" | "completed"; roundsDone: number; paidInNext: number };
};

const SAVINGS_GROUPS: DemoGroup[] = [
  {
    code: "SAVE01",
    name: "Neighbours monthly savings",
    description: "Five neighbours saving together; each month one of us takes the pot.",
    amount: 500000,
    period: "monthly",
    start: "date_trunc('month', CURRENT_DATE - interval '1 month')::date",
    members: [0, 1, 2, 3, 4],
    state: { status: "active", roundsDone: 1, paidInNext: 2 },
  },
  {
    code: "SAVE02",
    name: "Market friends weekly",
    description: "Stall holders at the morning market.",
    amount: 100000,
    period: "weekly",
    start: "CURRENT_DATE + 14",
    members: [5, 6, 7, 8],
    pending: [9],
    state: { status: "forming" },
  },
  {
    code: "SAVE03",
    name: "Family circle",
    description: "Cousins helping each other with school fees.",
    amount: 200000,
    period: "monthly",
    start: "date_trunc('month', CURRENT_DATE - interval '4 months')::date",
    members: [1, 6, 9],
    state: { status: "completed", roundsDone: 3, paidInNext: 0 },
  },
];

async function seedSavingsDemo(client: Client) {
  const pw = await hashPassword("Password123");
  const ids: string[] = [];
  for (const [fullName, phone] of SAVINGS_PEOPLE) {
    await client.query(
      `INSERT INTO users (clan_id, role, status, full_name, phone, password_hash)
       VALUES (NULL, 'user', 'active', $1, $2, $3) ON CONFLICT (phone) DO NOTHING`,
      [fullName, phone, pw],
    );
    ids.push((await client.query<{ id: string }>(`SELECT id FROM users WHERE phone = $1`, [phone])).rows[0].id);
  }
  // Identity-checked, like the other demo accounts, so they can also join clans or be made leaders.
  await client.query(
    `INSERT INTO user_documents (user_id, doc_type, doc_number, status, verified_at, verified_by)
     SELECT u.id, 'national_id', 'DEMO-' || right(u.phone, 4), 'approved', now(),
            (SELECT id FROM users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1)
       FROM users u WHERE u.id = ANY($1::uuid[])
     ON CONFLICT (user_id, doc_type, doc_number) DO NOTHING`,
    [ids],
  );
  console.log(`✓ ${SAVINGS_PEOPLE.length} demo users (password Password123): phones 02090000001 – 02090000010`);

  const fee = (await client.query<{ p: string }>(`SELECT savings_fee_percent AS p FROM platform_settings WHERE id = 1`)).rows[0]?.p ?? "1.00";

  for (const g of SAVINGS_GROUPS) {
    if ((await client.query(`SELECT 1 FROM savings_groups WHERE invite_code = $1`, [g.code])).rowCount) {
      console.log(`• Savings group ${g.code} already exists`);
      continue;
    }
    await client.query("BEGIN");
    try {
      const started = g.state.status !== "forming";
      const group = (
        await client.query<{ id: string }>(
          `INSERT INTO savings_groups (organizer_id, name, description, amount, period, start_date, invite_code,
                                       fee_percent, status, created_at, started_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, ${g.start}, $6, $7, $8::savings_group_status,
                   now() - interval '7 days', $9, $10)
           RETURNING id`,
          [
            ids[g.members[0]],
            g.name,
            g.description,
            g.amount,
            g.period,
            g.code,
            started ? fee : null,
            g.state.status,
            started ? new Date(Date.now() - 6 * 864e5) : null,
            g.state.status === "completed" ? new Date() : null,
          ],
        )
      ).rows[0].id;

      // Everyone approved has a turn and somewhere to receive the pot.
      const memberIds: string[] = [];
      for (const [turn, person] of g.members.entries()) {
        const [fullName, , account] = SAVINGS_PEOPLE[person];
        const m = await client.query<{ id: string }>(
          `INSERT INTO savings_members (group_id, user_id, status, turn_no, bank_name, account_name, account_number, decided_at)
           VALUES ($1, $2, 'approved', $3, 'BCEL', $4, $5, now()) RETURNING id`,
          [group, ids[person], turn + 1, fullName, account],
        );
        memberIds.push(m.rows[0].id);
      }
      for (const person of g.pending ?? []) {
        await client.query(`INSERT INTO savings_members (group_id, user_id, status) VALUES ($1, $2, 'pending')`, [group, ids[person]]);
      }

      if (g.state.status !== "forming") {
        const { roundsDone, paidInNext } = g.state;
        // Rounds exactly as startGroup writes them: round k to turn k, due k-1 periods after the start.
        for (const [i, receiver] of memberIds.entries()) {
          const roundNo = i + 1;
          const status = roundNo <= roundsDone ? "done" : roundNo === roundsDone + 1 ? "collecting" : "upcoming";
          const round = (
            await client.query<{ id: string }>(
              `INSERT INTO savings_rounds (group_id, round_no, receiver_member_id, due_date, status, opened_at, done_at)
               SELECT $1, $2, $3,
                      CASE WHEN $4 = 'weekly' THEN start_date + ($2 - 1) * 7
                           ELSE (start_date + ($2 - 1) * interval '1 month')::date END,
                      $5::savings_round_status,
                      CASE WHEN $5::text <> 'upcoming' THEN now() END,
                      CASE WHEN $5::text = 'done' THEN now() END
                 FROM savings_groups WHERE id = $1
               RETURNING id`,
              [group, roundNo, receiver, g.period, status],
            )
          ).rows[0].id;

          // Everyone else pays this round's receiver. Done rounds are fully paid (handed over in
          // cash, so no slip files are needed); the collecting round has its first few paid.
          const payers = memberIds.filter((m) => m !== receiver);
          for (const [j, payer] of payers.entries()) {
            const paid = status === "done" || (status === "collecting" && j < paidInNext);
            await client.query(
              `INSERT INTO savings_payments (round_id, payer_member_id, amount, status, confirmed_without_slip, transfer_date, submitted_at, reviewed_at)
               VALUES ($1, $2, $3, $4::savings_payment_status, $5, $6, $7, $7)`,
              [round, payer, g.amount, paid ? "confirmed" : "unpaid", paid, paid ? new Date() : null, paid ? new Date() : null],
            );
          }

          // A finished round leaves its receiver owing the platform fee on the pot.
          if (status === "done") {
            const pot = g.amount * payers.length;
            await client.query(
              `INSERT INTO savings_fees (round_id, payer_user_id, percent, base_amount, fee_amount)
               VALUES ($1, $2, $3, $4, $5)`,
              [round, ids[g.members[i]], fee, pot, Math.round((pot * Number(fee)) / 100)],
            );
          }
        }
      }
      await client.query("COMMIT");
      console.log(`✓ Savings group ${g.code} "${g.name}" (${g.state.status}, ${g.members.length} members)`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
}

main().catch((err) => {
  console.error("✗", err.message);
  process.exit(1);
});
