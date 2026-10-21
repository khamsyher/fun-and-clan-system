// A complete demo world for showing the platform to customers: 100 people and every feature
// in use, at every stage — so each screen has something real to show.
//
//   npm run db:setup          (schema first)
//   npm run db:demo           (this script; refuses to run twice)
//
// Everyone's password is Password123. Phones are 020555 00001 … 00100. See the printed guide.
//
// The data is written the way the app writes it — the same bills, ledger entries, fees and
// statuses its actions create — so every total adds up and every page behaves normally.
// Everything happens in one transaction: either the whole world is created or nothing is.
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { Client } from "pg";
import { hashPassword } from "../lib/password";

process.loadEnvFile?.(join(process.cwd(), ".env.local"));

const PASSWORD = "Password123";
const phone = (n: number) => `020555${String(n).padStart(5, "0")}`;

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

/** Deterministic randomness, so the demo is the same every time it is built. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261021);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;

/** A moment `days` ago, at a plausible daytime hour. */
const ago = (days: number, hour = 9 + Math.floor(rand() * 9)) => {
  const d = new Date(Date.now() - days * 864e5);
  d.setHours(hour, Math.floor(rand() * 60), 0, 0);
  return d;
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const monthLabel = (monthsBack: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBack);
  return { label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, first: new Date(d) };
};

/** A small, real PNG (a pale "document" with a coloured header and grey lines) for demo uploads. */
function demoPng(accent: [number, number, number]) {
  const w = 360,
    h = 220;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      let c: [number, number, number] = [248, 249, 252];
      if (y < 44) c = accent;
      else if ([80, 108, 136, 164].includes(Math.floor(y / 2) * 2) && x > 30 && x < (y === 164 ? 200 : 330)) c = [196, 204, 220];
      else if (x < 3 || x > w - 4 || y > h - 4) c = [220, 225, 235];
      raw.set(c, row + 1 + x * 3);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const SLIP_PNG = demoPng([35, 105, 74]);
const DOC_PNG = demoPng([18, 53, 122]);
const MINUTES_PNG = demoPng([138, 102, 32]);

// ---------------------------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------------------------

const MALE = ["Tou", "Pheng", "Chue", "Neng", "Kou", "Yeng", "Xai", "Fue", "Tong", "Chong", "Lue", "Nhia", "Pao", "Cher", "Teng", "Bee", "Kao", "Seng", "Toua", "Somphone", "Bounmy", "Khamla"];
const FEMALE = ["Mai", "Pa", "Kia", "Nou", "Yer", "Shoua", "Ia", "Ka", "Der", "Zoua", "Chee", "May", "Bao", "Youa", "Lia", "Houa", "Sua", "Xee", "Vilay", "Noy", "Phonsavanh"];
const SURNAMES = ["Thao", "Moua", "Yang", "Her", "Lor", "Khang", "Cha", "Hang", "Lee", "Xiong", "Vang"];
const PLACES = {
  vte: { province: "Vientiane Capital", districts: { Sikhottabong: ["Nongbone", "Dongpaleb"], Xaythany: ["Phonthan", "Nongviengkham"], Chanthabouly: ["Haisok", "Sihom"] } },
  lpb: { province: "Luang Prabang", districts: { "Luang Prabang": ["Ban Xieng Mouane", "Ban Phonheuang"], Nan: ["Ban Nalao"] } },
  xkh: { province: "Xieng Khouang", districts: { Pek: ["Ban Phonsavanh", "Ban Nong Tang"], Paek: ["Ban Lat Houang"] } },
} as const;

type Person = {
  n: number;
  first: string;
  last: string;
  gender: "male" | "female";
  place: keyof typeof PLACES;
  role: "user" | "member" | "clan_admin" | "support";
  status: "active" | "pending";
  clan: 0 | 1 | 2 | 3; // 0 = no clan
  joinedDaysAgo: number;
  kyc: "approved" | "pending" | "rejected" | "none";
  treasurer?: boolean;
  /** Filled in once the person is saved. */
  id: string;
};

function makePerson(n: number, surname: string, place: keyof typeof PLACES, o: Partial<Person>): Person {
  const gender = chance(0.5) ? "male" : "female";
  return {
    n,
    first: pick(gender === "male" ? MALE : FEMALE),
    last: surname,
    gender,
    place,
    role: "member",
    status: "active",
    clan: 0,
    joinedDaysAgo: 30 + Math.floor(rand() * 150),
    kyc: "approved",
    id: "",
    ...o,
  };
}

// 1 leader + 35 members + 4 waiting (Xiong, Vientiane, Mode B) · 1 + 25 (Vang, Luang Prabang, Mode A)
// · 1 + 12 (Lee, Xieng Khouang, Mode B, new) · 20 general users · 1 support staff = 100.
const people: Person[] = [];
people.push(makePerson(1, "Xiong", "vte", { role: "clan_admin", clan: 1, joinedDaysAgo: 175, first: "Tou", gender: "male" }));
for (let n = 2; n <= 36; n++) people.push(makePerson(n, "Xiong", "vte", { clan: 1, treasurer: n === 2, joinedDaysAgo: 120 + Math.floor(rand() * 50) }));
for (let n = 37; n <= 40; n++) people.push(makePerson(n, "Xiong", "vte", { clan: 1, status: "pending", joinedDaysAgo: 2 + n - 37, kyc: n === 40 ? "pending" : "approved" }));
people.push(makePerson(41, "Vang", "lpb", { role: "clan_admin", clan: 2, joinedDaysAgo: 172, first: "Pheng", gender: "male" }));
for (let n = 42; n <= 66; n++) people.push(makePerson(n, "Vang", "lpb", { clan: 2, treasurer: n === 42, joinedDaysAgo: 100 + Math.floor(rand() * 70) }));
people.push(makePerson(67, "Lee", "xkh", { role: "clan_admin", clan: 3, joinedDaysAgo: 40, first: "Nou", gender: "female" }));
for (let n = 68; n <= 79; n++) people.push(makePerson(n, "Lee", "xkh", { clan: 3, treasurer: n === 68, joinedDaysAgo: 10 + Math.floor(rand() * 28) }));
for (let n = 80; n <= 99; n++) {
  const kyc = n >= 82 && n <= 84 ? "pending" : n === 85 ? "rejected" : n === 86 ? "none" : "approved";
  people.push(makePerson(n, pick(SURNAMES), pick(["vte", "lpb", "xkh"] as const), { role: "user", kyc, joinedDaysAgo: 3 + Math.floor(rand() * 160) }));
}
people.push(makePerson(100, "Moua", "vte", { role: "support", kyc: "none", joinedDaysAgo: 90, first: "Shoua", gender: "female" }));
const P = (n: number) => people[n - 1];

// ---------------------------------------------------------------------------------------------

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const q = async <T = Record<string, unknown>,>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
  const one = async <T = Record<string, unknown>,>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0];

  if ((await q(`SELECT 1 FROM users WHERE phone = $1`, [phone(1)])).length) {
    console.log("• The showcase demo is already in this database (phone 02055500001 exists). Nothing changed.");
    await db.end();
    return;
  }
  const owner = await one<{ id: string }>(`SELECT id FROM users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1`);
  if (!owner) throw new Error("Create the super admin first: npm run db:setup");
  const settings = await one<{ platform_fee_percent: string; savings_fee_percent: string }>(
    `SELECT platform_fee_percent, savings_fee_percent FROM platform_settings WHERE id = 1`,
  );
  const feePct = Number(settings.platform_fee_percent);
  const savingsFeePct = Number(settings.savings_fee_percent ?? 1);
  const fee = (base: number, pct = feePct) => Math.round((base * pct) / 100);
  const pw = await hashPassword(PASSWORD);

  await db.query("BEGIN");
  try {
    // ---- Clan types --------------------------------------------------------------------------
    const typeId = async (name: string, description: string) => {
      const found = await one<{ id: string }>(`SELECT id FROM clan_types WHERE lower(name) = lower($1)`, [name]);
      if (found) return found.id;
      return (await one<{ id: string }>(`INSERT INTO clan_types (name, description) VALUES ($1, $2) RETURNING id`, [name, description])).id;
    };
    const familyType = await typeId("Family clan", "Families sharing one surname");
    const villageType = await typeId("Village association", "Neighbours in one village or district");

    // ---- Clans ------------------------------------------------------------------------------
    // Inserted with their final mode and rate: the rate-change guard only watches updates.
    const clan1 = (
      await one<{ id: string }>(
        `INSERT INTO clans (code, name, description, fund_mode, contribution_amount, clan_type_id, created_at)
         VALUES ('XIONG-VTE', 'Xiong Clan — Vientiane', 'Xiong families of Vientiane Capital. Collects when a loss is reported.', 'B', 50000, $1, $2) RETURNING id`,
        [familyType, ago(178)],
      )
    ).id;
    const clan2 = (
      await one<{ id: string }>(
        `INSERT INTO clans (code, name, description, fund_mode, contribution_amount, contribution_period, rate_version, clan_type_id, created_at)
         VALUES ('VANG-LPB', 'Vang Clan — Luang Prabang', 'Saves a little every month into a shared fund.', 'A', 20000, 'monthly', 2, $1, $2) RETURNING id`,
        [familyType, ago(176)],
      )
    ).id;
    const clan3 = (
      await one<{ id: string }>(
        `INSERT INTO clans (code, name, description, fund_mode, contribution_amount, clan_type_id, created_at)
         VALUES ('LEE-XKH', 'Lee Association — Xieng Khouang', 'A new village association, just getting started.', 'B', 30000, $1, $2) RETURNING id`,
        [villageType, ago(42)],
      )
    ).id;
    const clanId = [null, clan1, clan2, clan3] as const;

    // ---- People -----------------------------------------------------------------------------
    for (const p of people) {
      const place = PLACES[p.place];
      const district = pick(Object.keys(place.districts)) as keyof typeof place.districts;
      const village = pick([...(place.districts[district] as readonly string[])]);
      const joined = ago(p.joinedDaysAgo);
      const born = new Date(Date.UTC(1958 + Math.floor(rand() * 45), Math.floor(rand() * 12), 1 + Math.floor(rand() * 27)));
      const row = await one<{ id: string }>(
        `INSERT INTO users (clan_id, role, status, full_name, first_name, last_name, gender, date_of_birth, phone, email,
                            password_hash, village, district, province, is_treasurer, created_at, approved_at, last_login_at)
         VALUES ($1, $2::user_role, $3::user_status, $4, $5, $6, $7::gender, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING id`,
        [
          clanId[p.clan],
          p.role,
          p.status,
          `${p.first} ${p.last}`,
          p.first,
          p.last,
          p.gender,
          ymd(born),
          phone(p.n),
          chance(0.35) ? `${p.first.toLowerCase()}.${p.last.toLowerCase()}${p.n}@example.com` : null,
          pw,
          village,
          district,
          place.province,
          Boolean(p.treasurer),
          joined,
          p.status === "active" ? joined : null,
          chance(0.8) ? ago(Math.floor(rand() * 10)) : null,
        ],
      );
      p.id = row.id;
    }
    // Leaders approved their members; the owner approved leaders and staff.
    for (const [c, leader] of [[1, 1], [2, 41], [3, 67]] as const) {
      await db.query(`UPDATE users SET approved_by = $2 WHERE clan_id = $1 AND role = 'member' AND status = 'active'`, [clanId[c], P(leader).id]);
      await db.query(`UPDATE users SET approved_by = $2 WHERE id = $1`, [P(leader).id, owner.id]);
    }

    // ---- Identity documents -----------------------------------------------------------------
    for (const p of people) {
      if (p.kyc === "none") continue;
      const fileId =
        p.kyc === "pending" || chance(0.25)
          ? (
              await one<{ id: string }>(
                `INSERT INTO files (clan_id, uploaded_by, purpose, file_name, content_type, size_bytes, data, created_at)
                 VALUES ($1, $2, 'kyc_document', 'national-id-demo.png', 'image/png', $3, $4, $5) RETURNING id`,
                [clanId[p.clan], p.id, DOC_PNG.length, DOC_PNG, ago(Math.max(1, p.joinedDaysAgo - 1))],
              )
            ).id
          : null;
      const decided = p.kyc === "approved" || p.kyc === "rejected";
      await db.query(
        `INSERT INTO user_documents (user_id, doc_type, doc_number, issued_on, expires_on, file_id, status, review_note, verified_at, verified_by, created_at)
         VALUES ($1, $2::id_document, $3, $4, $5, $6, $7::kyc_status, $8, $9, $10, $11)`,
        [
          p.id,
          pick(["national_id", "national_id", "family_book", "passport"]),
          `DEMO-${String(100000 + p.n * 7919).slice(-6)}`,
          ymd(ago(900 + Math.floor(rand() * 900))),
          ymd(new Date(Date.now() + (400 + Math.floor(rand() * 1500)) * 864e5)),
          fileId,
          p.kyc,
          p.kyc === "rejected" ? "The photo is too blurry to read the number. Please upload a clearer picture." : null,
          decided ? ago(Math.max(0, p.joinedDaysAgo - 2)) : null,
          decided ? owner.id : null,
          ago(Math.max(1, p.joinedDaysAgo - 1)),
        ],
      );
    }

    // ---- Families ---------------------------------------------------------------------------
    const dependents = new Map<number, { id: string; name: string; relationship: string }[]>();
    for (const p of people) {
      if (p.role === "support" || p.status !== "active" || (p.role === "user" && !chance(0.4))) continue;
      const list: { id: string; name: string; relationship: string }[] = [];
      const add = async (relationship: string, gender: "male" | "female", age: number) => {
        const name = `${pick(gender === "male" ? MALE : FEMALE)} ${relationship === "spouse" ? p.last : p.last}`;
        const r = await one<{ id: string }>(
          `INSERT INTO dependents (clan_id, member_id, full_name, relationship, date_of_birth, created_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [clanId[p.clan], p.id, name, relationship, ymd(new Date(Date.UTC(new Date().getFullYear() - age, Math.floor(rand() * 12), 10))), ago(Math.max(1, p.joinedDaysAgo - 3))],
        );
        list.push({ id: r.id, name, relationship });
      };
      await add("spouse", p.gender === "male" ? "female" : "male", 30 + Math.floor(rand() * 30));
      if (chance(0.7)) await add("father", "male", 62 + Math.floor(rand() * 20));
      if (chance(0.7)) await add("mother", "female", 58 + Math.floor(rand() * 20));
      for (let k = Math.floor(rand() * 3); k > 0; k--) await add("child", chance(0.5) ? "male" : "female", 3 + Math.floor(rand() * 16));
      dependents.set(p.n, list);
    }
    const parentOf = (n: number, rel: "father" | "mother") => {
      const d = dependents.get(n)?.find((x) => x.relationship === rel);
      if (d) return d;
      throw new Error(`demo person ${n} has no ${rel}`);
    };
    // Make sure the people chosen for events below have the parent the story needs.
    const ensureParent = async (n: number, rel: "father" | "mother") => {
      if (dependents.get(n)?.some((x) => x.relationship === rel)) return;
      const p = P(n);
      const name = `${pick(rel === "father" ? MALE : FEMALE)} ${p.last}`;
      const r = await one<{ id: string }>(
        `INSERT INTO dependents (clan_id, member_id, full_name, relationship, date_of_birth, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [clanId[p.clan], p.id, name, rel, "1948-03-10", ago(p.joinedDaysAgo)],
      );
      dependents.set(n, [...(dependents.get(n) ?? []), { id: r.id, name, relationship: rel }]);
    };
    for (const [n, rel] of [[5, "father"], [12, "mother"], [25, "father"], [50, "mother"]] as const) await ensureParent(n, rel);

    // ---- Shared writers that mirror the app's actions ---------------------------------------
    const ledger = (clan: string, type: string, amount: number, at: Date, extra: Record<string, string | null> = {}, by?: string) =>
      db.query(
        `INSERT INTO fund_ledger (clan_id, entry_type, amount, event_id, bill_id, payout_id, due_id, slip_id, note, created_by, created_at)
         VALUES ($1, $2::ledger_type, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [clan, type, amount, extra.event ?? null, extra.bill ?? null, extra.payout ?? null, extra.due ?? null, extra.slip ?? null, extra.note ?? null, by ?? null, at],
      );
    const slipFile = async (clan: string | null, by: string, at: Date, purpose = "slip") =>
      (
        await one<{ id: string }>(
          `INSERT INTO files (clan_id, uploaded_by, purpose, file_name, content_type, size_bytes, data, created_at)
           VALUES ($1, $2, $3, 'transfer-slip-demo.png', 'image/png', $4, $5, $6) RETURNING id`,
          [clan, by, purpose, SLIP_PNG.length, SLIP_PNG, at],
        )
      ).id;
    const notify = (who: number | string, type: string, params: Record<string, string | number>, link: string, at: Date, read = false) =>
      db.query(`INSERT INTO notifications (user_id, type, params, link, created_at, read_at) VALUES ($1, $2, $3, $4, $5, $6)`, [
        typeof who === "number" ? P(who).id : who,
        type,
        JSON.stringify(params),
        link,
        at,
        read ? at : null,
      ]);
    const kip = (n: number) => `${n.toLocaleString("en-US")} ₭`;

    /** A Mode B event: report → bills → payments → (close → carried debts + fee) — as events.ts does. */
    async function modeBEvent(o: {
      clan: string;
      no: number;
      leader: number;
      memberNos: number[];
      deceased: { id: string; name: string; relationship: string };
      familyOf: number;
      reportedDaysAgo: number;
      rate: number;
      paidCash: number[];
      paidBySlip?: number[];
      pendingSlips?: number[];
      close?: { daysAfter: number };
    }) {
      const reported = ago(o.reportedDaysAgo);
      const ev = await one<{ id: string }>(
        `INSERT INTO death_events (clan_id, event_no, deceased_dependent_id, family_member_id, deceased_name, deceased_relationship,
                                   date_of_death, fund_mode, rate_version, rate_amount, platform_fee_percent, status, reported_by, reported_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'B', 1, $8, $9, 'collecting', $10, $11) RETURNING id`,
        [o.clan, o.no, o.deceased.id, P(o.familyOf).id, o.deceased.name, o.deceased.relationship, ymd(ago(o.reportedDaysAgo + 1)), o.rate, feePct, P(o.leader).id, reported],
      );
      await db.query(`UPDATE dependents SET deceased_at = $2 WHERE id = $1`, [o.deceased.id, ymd(ago(o.reportedDaysAgo + 1))]);
      const bills = new Map<number, string>();
      for (const n of o.memberNos) {
        const carried = await one<{ s: string }>(`SELECT COALESCE(SUM(amount), 0) AS s FROM event_bills WHERE member_id = $1 AND status = 'carried'`, [P(n).id]);
        const b = await one<{ id: string }>(
          `INSERT INTO event_bills (clan_id, event_id, member_id, amount, carried_in, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [o.clan, ev.id, P(n).id, o.rate, Number(carried.s), reported],
        );
        bills.set(n, b.id);
      }
      for (const n of o.memberNos) await notify(n, "event_new", { name: o.deceased.name, amount: kip(o.rate) }, `/member/events/${ev.id}`, reported, chance(0.6));
      let day = 0;
      for (const n of o.paidCash) {
        const at = ago(Math.max(0, o.reportedDaysAgo - 1 - (day++ % 6)));
        const method = chance(0.6) ? "cash" : "transfer";
        await db.query(`UPDATE event_bills SET status = 'paid', paid_at = $2, paid_method = $3, recorded_by = $4 WHERE id = $1`, [bills.get(n), at, method, P(o.leader).id]);
        await ledger(o.clan, "collection", o.rate, at, { event: ev.id, bill: bills.get(n)!, note: method }, P(o.leader).id);
      }
      for (const n of o.paidBySlip ?? []) {
        const at = ago(Math.max(0, o.reportedDaysAgo - 2));
        const file = await slipFile(o.clan, P(n).id, at);
        const slip = await one<{ id: string }>(
          `INSERT INTO payment_slips (clan_id, member_id, bill_id, amount_claimed, transfer_date, file_id, status, reviewed_by, reviewed_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, $8, $9) RETURNING id`,
          [o.clan, P(n).id, bills.get(n), o.rate, ymd(at), file, P(o.leader).id, at, at],
        );
        await db.query(`UPDATE event_bills SET status = 'paid', paid_at = $2, paid_method = 'transfer', recorded_by = $3 WHERE id = $1`, [bills.get(n), at, P(o.leader).id]);
        await ledger(o.clan, "collection", o.rate, at, { event: ev.id, bill: bills.get(n)!, slip: slip.id, note: "transfer" }, P(o.leader).id);
      }
      for (const n of o.pendingSlips ?? []) {
        const at = ago(Math.max(0, o.reportedDaysAgo - 3));
        const file = await slipFile(o.clan, P(n).id, at);
        await db.query(
          `INSERT INTO payment_slips (clan_id, member_id, bill_id, amount_claimed, transfer_date, file_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [o.clan, P(n).id, bills.get(n), o.rate, ymd(at), file, at],
        );
        await notify(o.leader, "slip_uploaded", { name: `${P(n).first} ${P(n).last}`, amount: kip(o.rate) }, "/clan/slips", at);
      }
      if (!o.close) return { id: ev.id, gross: 0, fee: 0, closedAt: null as Date | null, bills };

      const closedAt = ago(o.reportedDaysAgo - o.close.daysAfter);
      await db.query(`UPDATE event_bills SET status = 'carried' WHERE event_id = $1 AND status = 'unpaid'`, [ev.id]);
      const gross = o.rate * (o.paidCash.length + (o.paidBySlip?.length ?? 0));
      const f = fee(gross);
      await db.query(
        `UPDATE death_events SET status = 'awaiting_payout', gross_collected = $2, fee_amount = $3, closed_by = $4, closed_at = $5 WHERE id = $1`,
        [ev.id, gross, f, P(o.leader).id, closedAt],
      );
      await db.query(`INSERT INTO platform_fees (clan_id, event_id, percent, base_amount, fee_amount, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [
        o.clan,
        ev.id,
        feePct,
        gross,
        f,
        closedAt,
      ]);
      if (f > 0) await ledger(o.clan, "platform_fee", -f, closedAt, { event: ev.id, note: `${feePct}%` }, P(o.leader).id);
      for (const n of o.memberNos.filter((n) => !o.paidCash.includes(n) && !(o.paidBySlip ?? []).includes(n)))
        await notify(n, "event_debt", { name: o.deceased.name, amount: kip(o.rate) }, "/member/payments", closedAt);
      return { id: ev.id, gross, fee: f, closedAt, bills };
    }

    /** Leader requests, treasurer decides, leader pays — the two-person payout, as payouts.ts does. */
    async function payout(o: { clan: string; event: string; leader: number; treasurer: number; amount: number; receiver: number; requestedAt: Date; stage: "requested" | "approved" | "paid"; modeA?: boolean }) {
      const p = await one<{ id: string }>(
        `INSERT INTO payouts (clan_id, event_id, amount, receiver_name, receiver_phone, note, requested_by, requested_at)
         VALUES ($1, $2, $3, $4, $5, 'For the funeral and the family', $6, $7) RETURNING id`,
        [o.clan, o.event, o.amount, `${P(o.receiver).first} ${P(o.receiver).last}`, phone(o.receiver), P(o.leader).id, o.requestedAt],
      );
      if (o.stage === "requested") {
        await notify(o.treasurer, "payout_requested", { name: `${P(o.leader).first} ${P(o.leader).last}`, amount: kip(o.amount) }, "/member/approvals", o.requestedAt);
        return;
      }
      const decided = new Date(o.requestedAt.getTime() + 3 * 3600e3);
      await db.query(`UPDATE payouts SET status = 'approved', decided_by = $2, decided_at = $3 WHERE id = $1`, [p.id, P(o.treasurer).id, decided]);
      if (o.stage === "approved") return;
      const paid = new Date(decided.getTime() + 20 * 3600e3);
      await db.query(`UPDATE payouts SET status = 'paid', paid_by = $2, paid_at = $3, paid_method = 'cash' WHERE id = $1`, [p.id, P(o.leader).id, paid]);
      await ledger(o.clan, "payout", -o.amount, paid, { event: o.event, payout: p.id, note: "cash" }, P(o.leader).id);
      if (o.modeA) {
        const f = fee(o.amount);
        await db.query(`INSERT INTO platform_fees (clan_id, event_id, percent, base_amount, fee_amount, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [
          o.clan,
          o.event,
          feePct,
          o.amount,
          f,
          paid,
        ]);
        if (f > 0) await ledger(o.clan, "platform_fee", -f, paid, { event: o.event, note: `${feePct}%` }, P(o.leader).id);
      }
      await db.query(`UPDATE death_events SET status = 'completed', completed_at = $2 WHERE id = $1`, [o.event, paid]);
    }

    // ---- Clan 1: Xiong — Mode B, three events at three stages --------------------------------
    const xiongMembers = Array.from({ length: 35 }, (_, i) => i + 2); // 2..36
    // Event 1 (≈4 months ago): finished — paid out, fee received; three households didn't pay.
    const e1 = await modeBEvent({
      clan: clan1, no: 1, leader: 1, memberNos: xiongMembers, deceased: parentOf(5, "father"), familyOf: 5, reportedDaysAgo: 120, rate: 50000,
      paidCash: xiongMembers.filter((n) => n < 34), close: { daysAfter: 10 },
    });
    await payout({ clan: clan1, event: e1.id, leader: 1, treasurer: 2, amount: 1500000, receiver: 5, requestedAt: ago(109), stage: "paid" });
    await db.query(`UPDATE platform_fees SET status = 'received', received_at = $2, received_by = $3 WHERE event_id = $1`, [e1.id, ago(100), owner.id]);
    // One of the three settled the debt later (a debt collection, as settleCarried does).
    {
      const b = await one<{ id: string; amount: string }>(`SELECT id, amount FROM event_bills WHERE event_id = $1 AND member_id = $2`, [e1.id, P(34).id]);
      const at = ago(80);
      await db.query(`UPDATE event_bills SET status = 'settled', paid_at = $2, paid_method = 'cash', recorded_by = $3 WHERE id = $1`, [b.id, at, P(1).id]);
      await ledger(clan1, "debt_collection", Number(b.amount), at, { event: e1.id, bill: b.id, note: "cash" }, P(1).id);
    }
    // Event 2 (≈6 weeks ago): collection closed, payout waiting for the treasurer.
    const e2 = await modeBEvent({
      clan: clan1, no: 2, leader: 1, memberNos: xiongMembers, deceased: parentOf(12, "mother"), familyOf: 12, reportedDaysAgo: 45, rate: 50000,
      paidCash: xiongMembers.filter((n) => n < 35), close: { daysAfter: 9 },
    });
    await payout({ clan: clan1, event: e2.id, leader: 1, treasurer: 2, amount: 1600000, receiver: 12, requestedAt: ago(34), stage: "requested" });
    // Event 3 (5 days ago): still collecting — paid in cash, paid by approved slips, two slips to review.
    await modeBEvent({
      clan: clan1, no: 3, leader: 1, memberNos: xiongMembers, deceased: parentOf(25, "father"), familyOf: 25, reportedDaysAgo: 5, rate: 50000,
      paidCash: xiongMembers.filter((n) => n <= 21), paidBySlip: [22, 23, 24], pendingSlips: [26, 27],
    });

    // Waiting members of clan 1 (approve them as the leader).
    for (const n of [37, 38, 39, 40]) await notify(1, "join_requested", { name: `${P(n).first} ${P(n).last}` }, "/clan", ago(P(n).joinedDaysAgo));

    // ---- Clan 2: Vang — Mode A, monthly savings, one rate change, two events -----------------
    const vangMembers = Array.from({ length: 25 }, (_, i) => i + 42); // 42..66
    await ledger(clan2, "deposit", 500000, ago(175), { note: "Opening balance carried over from the old notebook" }, P(41).id);
    // The rate went from 15,000 to 20,000 two months ago, approved at a clan meeting (with minutes).
    const changeAt = monthLabel(2).first;
    const minutes = await one<{ id: string }>(
      `INSERT INTO files (clan_id, uploaded_by, purpose, file_name, content_type, size_bytes, data, created_at)
       VALUES ($1, $2, 'meeting_minutes', 'meeting-minutes-demo.png', 'image/png', $3, $4, $5) RETURNING id`,
      [clan2, P(41).id, MINUTES_PNG.length, MINUTES_PNG, changeAt],
    );
    await db.query(
      `INSERT INTO clan_rate_changes (clan_id, changed_by, version, old_fund_mode, new_fund_mode, old_amount, new_amount, old_period, new_period, meeting_date, note, minutes_file_id, created_at)
       VALUES ($1, $2, 2, 'A', 'A', 15000, 20000, 'monthly', 'monthly', $3, 'Agreed at the clan meeting: costs have gone up.', $4, $5)`,
      [clan2, P(41).id, ymd(new Date(changeAt.getTime() - 3 * 864e5)), minutes.id, changeAt],
    );
    for (let back = 5; back >= 0; back--) {
      const { label, first } = monthLabel(back);
      const rate = back > 2 ? 15000 : 20000;
      const period = await one<{ id: string }>(
        `INSERT INTO contribution_periods (clan_id, label, period_type, amount, rate_version, opened_by, opened_at) VALUES ($1, $2, 'monthly', $3, $4, $5, $6) RETURNING id`,
        [clan2, label, rate, back > 2 ? 1 : 2, P(41).id, first],
      );
      for (const n of vangMembers) {
        const due = await one<{ id: string }>(
          `INSERT INTO contribution_dues (clan_id, period_id, member_id, amount, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [clan2, period.id, P(n).id, rate, first],
        );
        const paid = back === 0 ? chance(0.45) : chance(0.9);
        if (paid) {
          const at = new Date(Math.min(Date.now() - 3600e3, first.getTime() + (2 + Math.floor(rand() * 20)) * 864e5));
          const method = chance(0.5) ? "cash" : "transfer";
          await db.query(`UPDATE contribution_dues SET status = 'paid', paid_at = $2, paid_method = $3, recorded_by = $4 WHERE id = $1`, [due.id, at, method, P(41).id]);
          await ledger(clan2, "contribution", rate, at, { due: due.id, note: method }, P(41).id);
        } else if (back === 0 && n === 60) {
          // One transfer slip waiting for the leader.
          const at = ago(1);
          const file = await slipFile(clan2, P(n).id, at);
          await db.query(
            `INSERT INTO payment_slips (clan_id, member_id, due_id, amount_claimed, transfer_date, file_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [clan2, P(n).id, due.id, rate, ymd(at), file, at],
          );
          await notify(41, "slip_uploaded", { name: `${P(n).first} ${P(n).last}`, amount: kip(rate) }, "/clan/slips", at);
        }
      }
      if (back === 0) for (const n of vangMembers) await notify(n, "period_opened", { label, amount: kip(rate) }, "/member/payments", first, chance(0.5));
    }
    // Mode A event 1 (≈6 weeks ago): paid straight from the fund, fee owed to the platform.
    {
      const d = parentOf(50, "mother");
      const ev = await one<{ id: string }>(
        `INSERT INTO death_events (clan_id, event_no, deceased_dependent_id, family_member_id, deceased_name, deceased_relationship, date_of_death,
                                   fund_mode, rate_version, rate_amount, platform_fee_percent, status, reported_by, reported_at)
         VALUES ($1, 1, $2, $3, $4, 'mother', $5, 'A', 2, 20000, $6, 'awaiting_payout', $7, $8) RETURNING id`,
        [clan2, d.id, P(50).id, d.name, ymd(ago(44)), feePct, P(41).id, ago(43)],
      );
      await db.query(`UPDATE dependents SET deceased_at = $2 WHERE id = $1`, [d.id, ymd(ago(44))]);
      await payout({ clan: clan2, event: ev.id, leader: 41, treasurer: 42, amount: 1000000, receiver: 50, requestedAt: ago(42), stage: "paid", modeA: true });
    }
    // Mode A event 2 (3 days ago): a member himself; waiting for the leader to request the payout.
    {
      const m = P(66);
      await db.query(
        `INSERT INTO death_events (clan_id, event_no, deceased_member_id, family_member_id, deceased_name, date_of_death,
                                   fund_mode, rate_version, rate_amount, platform_fee_percent, status, reported_by, reported_at, note)
         VALUES ($1, 2, $2, $2, $3, $4, 'A', 2, 20000, $5, 'awaiting_payout', $6, $7, 'The family asked for the ceremony at home.')`,
        [clan2, m.id, `${m.first} ${m.last}`, ymd(ago(4)), feePct, P(41).id, ago(3)],
      );
      await db.query(`UPDATE users SET deceased_at = $2 WHERE id = $1`, [m.id, ymd(ago(4))]);
    }

    // ---- Clan 3: Lee — new, quiet; one person asking to join ---------------------------------
    await db.query(`INSERT INTO clan_join_requests (clan_id, user_id, created_at) VALUES ($1, $2, $3)`, [clan3, P(81).id, ago(2)]);
    await notify(67, "join_requested", { name: `${P(81).first} ${P(81).last}` }, "/clan", ago(2));

    // ---- A request to lead a new clan, for staff to decide ----------------------------------
    await db.query(
      `INSERT INTO clan_leader_requests (user_id, clan_name, description, reason, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [
        P(80).id,
        `${P(80).last} Families — Savannakhet`,
        "About 30 families in Kaysone district who already help each other informally.",
        "The elders asked me to keep the records; I have run the paper notebook for three years.",
        ago(1),
      ],
    );
    const staff = [owner.id, P(100).id];
    for (const s of staff) {
      await notify(s, "leader_requested", { name: `${P(80).first} ${P(80).last}`, clan: `${P(80).last} Families — Savannakhet` }, "/admin/clans/requests", ago(1));
      for (const n of [40, 82, 83, 84]) await notify(s, "kyc_submitted", { name: `${P(n).first} ${P(n).last}` }, "/admin/kyc", ago(P(n).joinedDaysAgo));
    }

    // ---- Donations --------------------------------------------------------------------------
    async function donationRequest(o: { asker: number; title: string; story: string; target: number | null; daysAgo: number; status: "open" | "closed"; gifts: [number, number, "confirmed" | "pending" | "rejected", boolean?][] }) {
      const asker = P(o.asker);
      const r = await one<{ id: string }>(
        `INSERT INTO donation_requests (clan_id, created_by, title, story, target_amount, deadline, bank_name, account_name, account_number, status, created_at, updated_at, closed_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'BCEL', $7, $8, $9::donation_request_status, $10, $10, $11) RETURNING id`,
        [clanId[asker.clan], asker.id, o.title, o.story, o.target, o.target ? ymd(new Date(Date.now() + 20 * 864e5)) : null, `${asker.first} ${asker.last}`, `0100-${String(o.asker).padStart(4, "0")}-5521`, o.status, ago(o.daysAgo), o.status === "closed" ? ago(2) : null],
      );
      let d = o.daysAgo;
      for (const [donor, amount, status, anonymous] of o.gifts) {
        const at = ago(Math.max(0, --d));
        const file = await slipFile(null, P(donor).id, at, "donation_slip");
        await db.query(
          `INSERT INTO donations (request_id, donor_id, amount, transfer_date, message, anonymous, slip_file_id, status, review_note, reviewed_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::donation_status, $9, $10, $11)`,
          [r.id, P(donor).id, amount, ymd(at), chance(0.5) ? "Stay strong. We are with you." : null, Boolean(anonymous), file, status, status === "rejected" ? "This transfer has not arrived in my account." : null, status === "pending" ? null : at, at],
        );
        if (status === "pending") await notify(o.asker, "donation_received", { name: anonymous ? "Someone" : `${P(donor).first} ${P(donor).last}`, amount: kip(amount) }, `/donations/${r.id}`, at);
      }
    }
    await donationRequest({
      asker: 87, title: "Help with my mother's hospital treatment", target: 10000000, daysAgo: 12, status: "open",
      story: "My mother needs surgery at Mahosot Hospital next month. Any help towards the cost means a great deal to our family.",
      gifts: [[3, 200000, "confirmed"], [44, 500000, "confirmed"], [90, 100000, "confirmed", true], [7, 300000, "confirmed"], [69, 150000, "confirmed"], [55, 250000, "confirmed"], [93, 1000000, "confirmed"], [15, 200000, "confirmed"], [48, 300000, "pending"], [91, 100000, "pending"], [30, 50000, "rejected"]],
    });
    await donationRequest({
      asker: 88, title: "Rebuilding after our house fire", target: 20000000, daysAgo: 40, status: "closed",
      story: "A fire destroyed our home in March. Thanks to everyone who helped us rebuild — we have moved back in.",
      gifts: Array.from({ length: 12 }, (_, i): [number, number, "confirmed"] => [[4, 9, 14, 45, 51, 58, 70, 72, 89, 92, 95, 97][i], [500000, 1000000, 750000, 2000000, 300000, 1500000, 500000, 250000, 3000000, 1000000, 2000000, 1200000][i], "confirmed"]),
    });
    await donationRequest({
      asker: 20, title: "School fees for three orphaned children", target: null, daysAgo: 8, status: "open",
      story: "Their parents passed away this year. We are collecting for uniforms, books and fees for the new school year.",
      gifts: [[10, 300000, "confirmed"], [62, 200000, "confirmed", true], [94, 500000, "confirmed"], [33, 150000, "pending"]],
    });

    // ---- Savings groups (members from any clan, or none) ------------------------------------
    async function savingsGroup(o: { code: string; name: string; description: string; amount: number; period: "weekly" | "monthly"; organizer: number; members: number[]; pending?: number[]; startDaysAgo: number; roundsDone: number; paidInCurrent: number; started: boolean }) {
      const all = [o.organizer, ...o.members];
      const g = await one<{ id: string }>(
        `INSERT INTO savings_groups (organizer_id, name, description, amount, period, start_date, invite_code, fee_percent, status, created_at, started_at)
         VALUES ($1, $2, $3, $4, $5::savings_period, $6, $7, $8, $9::savings_group_status, $10, $11) RETURNING id`,
        [P(o.organizer).id, o.name, o.description, o.amount, o.period, ymd(ago(o.startDaysAgo)), o.code, o.started ? savingsFeePct : null, o.started ? "active" : "forming", ago(o.startDaysAgo + 10), o.started ? ago(o.startDaysAgo + 1) : null],
      );
      const memberIds: string[] = [];
      for (const [i, n] of all.entries()) {
        const m = await one<{ id: string }>(
          `INSERT INTO savings_members (group_id, user_id, status, turn_no, bank_name, account_name, account_number, joined_at, decided_at)
           VALUES ($1, $2, 'approved', $3, 'BCEL', $4, $5, $6, $6) RETURNING id`,
          [g.id, P(n).id, i + 1, `${P(n).first} ${P(n).last}`, `0102-${String(n).padStart(4, "0")}-0090`, ago(Math.max(1, o.startDaysAgo + 8 - i))],
        );
        memberIds.push(m.id);
      }
      for (const n of o.pending ?? []) await db.query(`INSERT INTO savings_members (group_id, user_id, status, joined_at) VALUES ($1, $2, 'pending', $3)`, [g.id, P(n).id, ago(1)]);
      if (!o.started) return;
      for (const [i, receiver] of memberIds.entries()) {
        const no = i + 1;
        const status = no <= o.roundsDone ? "done" : no === o.roundsDone + 1 ? "collecting" : "upcoming";
        const due = o.period === "weekly" ? ago(o.startDaysAgo - (no - 1) * 7) : new Date(ago(o.startDaysAgo).getTime() + (no - 1) * 30 * 864e5);
        const r = await one<{ id: string }>(
          `INSERT INTO savings_rounds (group_id, round_no, receiver_member_id, due_date, status, opened_at, done_at) VALUES ($1, $2, $3, $4, $5::savings_round_status, $6, $7) RETURNING id`,
          [g.id, no, receiver, ymd(due), status, status === "upcoming" ? null : due, status === "done" ? new Date(due.getTime() + 5 * 864e5) : null],
        );
        const payers = memberIds.filter((m) => m !== receiver);
        for (const [j, payer] of payers.entries()) {
          const paid = status === "done" || (status === "collecting" && j < o.paidInCurrent);
          const at = new Date(Math.min(Date.now() - 3600e3, due.getTime() + 2 * 864e5));
          await db.query(
            `INSERT INTO savings_payments (round_id, payer_member_id, amount, status, confirmed_without_slip, transfer_date, submitted_at, reviewed_at) VALUES ($1, $2, $3, $4::savings_payment_status, $5, $6, $7, $7)`,
            [r.id, payer, o.amount, paid ? "confirmed" : "unpaid", paid, paid ? ymd(at) : null, paid ? at : null],
          );
        }
        if (status === "done") {
          const pot = o.amount * payers.length;
          await db.query(
            `INSERT INTO savings_fees (round_id, payer_user_id, percent, base_amount, fee_amount, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
            [r.id, P(all[i]).id, savingsFeePct, pot, Math.round((pot * savingsFeePct) / 100), new Date(due.getTime() + 5 * 864e5)],
          );
        }
        if (status === "collecting") await notify(all[i], "savings_your_turn", { group: o.name, round: no, pot: kip(o.amount * payers.length) }, `/savings/${g.id}`, due);
      }
    }
    await savingsGroup({
      code: "DEMO-SV1", name: "Market sellers' circle", description: "Six friends from the morning market, 300,000 each month.", amount: 300000, period: "monthly",
      organizer: 89, members: [90, 91, 92, 10, 45], startDaysAgo: 62, roundsDone: 2, paidInCurrent: 3, started: true,
    });
    await savingsGroup({
      code: "DEMO-SV2", name: "Young families weekly", description: "Small weekly savings for school costs.", amount: 50000, period: "weekly",
      organizer: 96, members: [97, 98], pending: [99], startDaysAgo: -9, roundsDone: 0, paidInCurrent: 0, started: false,
    });

    // ---- Support chats ----------------------------------------------------------------------
    async function chat(user: number, status: "open" | "closed", lines: [boolean, string, number][], staffRead: boolean) {
      const last = lines[lines.length - 1];
      const t = await one<{ id: string }>(
        `INSERT INTO support_threads (user_id, status, last_message_at, user_last_read_at, staff_last_read_at, created_at) VALUES ($1, $2::support_status, $3, $3, $4, $5) RETURNING id`,
        [P(user).id, status, ago(last[2], 15), staffRead ? ago(last[2], 16) : ago(lines[0][2] + 1), ago(lines[0][2], 9)],
      );
      for (const [i, [fromStaff, body, days]] of lines.entries()) {
        await db.query(`INSERT INTO support_messages (thread_id, sender_id, from_staff, body, created_at) VALUES ($1, $2, $3, $4, $5)`, [
          t.id,
          fromStaff ? P(100).id : P(user).id,
          fromStaff,
          body,
          ago(days, 9 + i),
        ]);
      }
    }
    await chat(86, "open", [[false, "Hello, I registered last week but I can't join my family's clan. What do I need to do?", 0]], false);
    await chat(82, "open", [
      [false, "I uploaded my ID card two days ago. How long does checking take?", 2],
      [true, "Hi! We check documents within one or two working days. Yours is in the queue — you'll get a notification as soon as it's done.", 2],
      [false, "Thank you!", 1],
    ], false);
    await chat(15, "closed", [
      [false, "I paid my bill in cash to our leader but it still shows unpaid.", 20],
      [true, "Thanks for letting us know. Your leader records cash payments from the clan page — I've asked them to check it.", 20],
      [false, "It shows paid now. Thank you for the quick help.", 19],
      [true, "Glad it's sorted. Have a good day!", 19],
    ], true);

    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    await db.end();
  }

  // ---- A guide for the presenter ------------------------------------------------------------
  const who = (n: number) => `${phone(n)}  ${P(n).first} ${P(n).last}`;
  console.log(`
✓ Showcase demo created — 100 people, every password: ${PASSWORD}

PLATFORM
  Super admin ........ your own super admin account
  Support staff ...... ${who(100)}  (everything except resetting passwords; answers support chats)

XIONG CLAN — VIENTIANE (XIONG-VTE) · Mode B, 50,000 ₭ per event
  Leader ............. ${who(1)}
  Treasurer .......... ${who(2)}  → has a payout waiting for approval (event 2)
  Members ............ ${phone(3)} … ${phone(36)}  (34 is settled; 35 and 36 owe carried debts)
  Waiting to join .... ${phone(37)} … ${phone(40)}
  Events: #1 finished and paid out · #2 closed, payout waiting · #3 collecting, 2 transfer slips to review

VANG CLAN — LUANG PRABANG (VANG-LPB) · Mode A, 20,000 ₭ every month
  Leader ............. ${who(41)}  → event 2 waits for a payout request; 1 slip to review
  Treasurer .......... ${who(42)}
  Members ............ ${phone(43)} … ${phone(66)}  (6 months of contributions; rate raised 15,000 → 20,000 with minutes)

LEE ASSOCIATION — XIENG KHOUANG (LEE-XKH) · Mode B, new and quiet
  Leader ............. ${who(67)}  → 1 person asking to join
  Members ............ ${phone(68)} … ${phone(79)}

GENERAL USERS (no clan)
  ${who(80)}  asked to lead a new clan (staff: Clans → Leader requests)
  ${who(81)}  asked to join LEE-XKH
  ${phone(82)} … ${phone(84)}  identity documents waiting for review · ${phone(85)} rejected · ${phone(86)} none yet
  ${who(87)}  donation request "hospital treatment" (2 gifts to confirm)
  ${who(88)}  donation request "house fire" (finished)
  ${who(89)}  organizes savings group "Market sellers' circle" (round 3 collecting)
  ${who(96)}  organizes "Young families weekly" (forming; 1 request to approve)

SUPPORT CHAT: 3 conversations (1 unanswered, from ${phone(86)}).
`);
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
