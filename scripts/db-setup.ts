// Creates the schema and seeds the super admin (and optionally a demo clan).
// Usage: npm run db:setup            -> schema + super admin
//        npm run db:setup -- --demo  -> also a demo clan, leader and members
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
  console.log("✓ Demo clan VANG01 seeded (all demo passwords: Password123)");
  console.log("    leader 02011111111 · member 02022222222 · pending 02033333333, 02044444444");
  console.log("    general user (no clan) 02085555555");
}

main().catch((err) => {
  console.error("✗", err.message);
  process.exit(1);
});
