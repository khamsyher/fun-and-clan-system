// Live support chat over WebSocket, at /ws/support.
//
// Runs inside the custom server (server.ts), next to Next.js but outside it: Next's route
// handlers can't hold a socket open. So this file can't use lib/session or lib/db (they are
// server-only and need Next's request context); it verifies the same signed session cookie
// itself, with the same secret, and keeps its own small database pool.
//
// Who talks to whom: every person (not platform staff) has one conversation with the platform
// team. Staff (super admin and support) see every conversation. A message is saved first and
// only then sent live to the conversation's owner and to every connected staff member, so what
// people see is always what the database has.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { jwtVerify } from "jose";
import { Pool } from "pg";
import { WebSocketServer, type WebSocket } from "ws";

export const SUPPORT_PATH = "/ws/support";
const SESSION_COOKIE = "session";
const STAFF = new Set(["super_admin", "support"]);
const MAX_BODY = 2000;
const MAX_FRAME = 8 * 1024;
// At most this many messages per socket in the window, so one tab can't flood everyone.
const RATE_LIMIT = { count: 10, windowMs: 10_000 };

type Person = { id: string; name: string; staff: boolean };
type Client = { ws: WebSocket; person: Person; sessionVersion: number; alive: boolean; sent: number[] };

type Incoming =
  | { type: "send"; body: string; threadId?: string }
  | { type: "read"; threadId?: string }
  | { type: "status"; threadId: string; status: "open" | "closed" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createSupportSocket() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters in .env.local");
  const key = new TextEncoder().encode(secret);
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });
  const clients = new Set<Client>();

  /** Who is on the other end: a valid session cookie for an active account, still current. */
  async function authenticate(req: IncomingMessage): Promise<{ person: Person; sessionVersion: number } | null> {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
      const version = typeof payload.sessionVersion === "number" ? payload.sessionVersion : 1;
      const user = await currentUser(String(payload.userId));
      if (!user || user.session_version !== version) return null;
      return { person: { id: user.id, name: user.full_name, staff: STAFF.has(user.role) }, sessionVersion: version };
    } catch {
      return null;
    }
  }

  async function currentUser(id: string) {
    if (!UUID.test(id)) return null;
    const r = await db.query<{ id: string; full_name: string; role: string; session_version: number }>(
      `SELECT id, full_name, role::text AS role, session_version FROM users WHERE id = $1 AND status = 'active'`,
      [id],
    );
    return r.rows[0] ?? null;
  }

  /** Called by server.ts for upgrade requests to SUPPORT_PATH. */
  async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    // The browser sends the session cookie to any page that opens a socket here, so only our
    // own pages may: a socket opened from another site is refused (cross-site WebSocket hijacking).
    if (!sameOrigin(req)) return reject(socket, 403);
    const auth = await authenticate(req);
    if (!auth) return reject(socket, 401);
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client: Client = { ws, person: auth.person, sessionVersion: auth.sessionVersion, alive: true, sent: [] };
      clients.add(client);
      ws.on("pong", () => (client.alive = true));
      ws.on("close", () => clients.delete(client));
      ws.on("error", () => clients.delete(client));
      ws.on("message", (raw) => {
        onMessage(client, raw.toString()).catch((err) => {
          console.error("[support] message failed:", err);
          send(ws, { type: "error", code: "server" });
        });
      });
      send(ws, { type: "ready", staff: auth.person.staff });
    });
  }

  async function onMessage(client: Client, raw: string) {
    let msg: Incoming;
    try {
      msg = JSON.parse(raw);
    } catch {
      return send(client.ws, { type: "error", code: "bad_request" });
    }

    // Re-check the account on every message: blocking someone or changing their password
    // ends their chat at once, not when their tab happens to reconnect.
    const user = await currentUser(client.person.id);
    if (!user || user.session_version !== client.sessionVersion || STAFF.has(user.role) !== client.person.staff) {
      send(client.ws, { type: "error", code: "signed_out" });
      return client.ws.close(4401, "signed out");
    }

    if (msg.type === "send") return onSend(client, msg);
    if (msg.type === "read") return onRead(client, msg);
    if (msg.type === "status" && client.person.staff) return onStatus(client, msg);
    send(client.ws, { type: "error", code: "bad_request" });
  }

  async function onSend(client: Client, msg: { body: string; threadId?: string }) {
    const body = typeof msg.body === "string" ? msg.body.trim() : "";
    if (!body || body.length > MAX_BODY) return send(client.ws, { type: "error", code: "bad_body" });

    const now = Date.now();
    client.sent = client.sent.filter((t) => now - t < RATE_LIMIT.windowMs);
    if (client.sent.length >= RATE_LIMIT.count) return send(client.ws, { type: "error", code: "too_fast" });
    client.sent.push(now);

    const staff = client.person.staff;
    const conn = await db.connect();
    try {
      await conn.query("BEGIN");
      // A person writes into their own conversation (started on their first message);
      // staff write into the conversation they have open.
      const thread = staff
        ? (await conn.query<{ id: string; user_id: string }>(`SELECT id, user_id FROM support_threads WHERE id = $1 FOR UPDATE`, [
            UUID.test(String(msg.threadId)) ? msg.threadId : null,
          ])).rows[0]
        : (
            await conn.query<{ id: string; user_id: string }>(
              `INSERT INTO support_threads (user_id) VALUES ($1)
               ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
               RETURNING id, user_id`,
              [client.person.id],
            )
          ).rows[0];
      if (!thread) {
        await conn.query("ROLLBACK");
        return send(client.ws, { type: "error", code: "no_thread" });
      }

      const saved = (
        await conn.query<{ id: string; created_at: Date }>(
          `INSERT INTO support_messages (thread_id, sender_id, from_staff, body) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
          [thread.id, client.person.id, staff, body],
        )
      ).rows[0];
      // Writing counts as having read the conversation, and a person writing again reopens it.
      await conn.query(
        `UPDATE support_threads
            SET last_message_at = $2,
                status = CASE WHEN $3 THEN status ELSE 'open' END,
                ${staff ? "staff_last_read_at" : "user_last_read_at"} = $2
          WHERE id = $1`,
        [thread.id, saved.created_at, staff],
      );
      await conn.query("COMMIT");

      const message = {
        id: saved.id,
        body,
        fromStaff: staff,
        senderName: client.person.name,
        createdAt: saved.created_at.toISOString(),
      };
      deliver(thread.user_id, { type: "message", threadId: thread.id, message });
    } catch (err) {
      await conn.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }

  async function onRead(client: Client, msg: { threadId?: string }) {
    if (client.person.staff) {
      if (!UUID.test(String(msg.threadId))) return;
      const r = await db.query<{ user_id: string }>(`UPDATE support_threads SET staff_last_read_at = now() WHERE id = $1 RETURNING user_id`, [
        msg.threadId,
      ]);
      // Other staff clear the same unread mark.
      if (r.rows[0]) toStaff({ type: "read", threadId: msg.threadId, by: "staff" });
    } else {
      await db.query(`UPDATE support_threads SET user_last_read_at = now() WHERE user_id = $1`, [client.person.id]);
    }
  }

  async function onStatus(client: Client, msg: { threadId: string; status: "open" | "closed" }) {
    if (!UUID.test(String(msg.threadId)) || (msg.status !== "open" && msg.status !== "closed")) return;
    const r = await db.query<{ user_id: string }>(`UPDATE support_threads SET status = $2 WHERE id = $1 RETURNING user_id`, [
      msg.threadId,
      msg.status,
    ]);
    if (r.rows[0]) deliver(r.rows[0].user_id, { type: "status", threadId: msg.threadId, status: msg.status, by: client.person.name });
  }

  /** To the conversation's owner (all their tabs) and to every staff member. */
  function deliver(ownerId: string, event: object) {
    for (const c of clients) if (c.person.staff || c.person.id === ownerId) send(c.ws, event);
  }
  function toStaff(event: object) {
    for (const c of clients) if (c.person.staff) send(c.ws, event);
  }

  // Drop sockets that stopped answering (closed laptop, lost network) so they don't pile up.
  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        clients.delete(c);
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, 30_000);
  heartbeat.unref();

  return { handleUpgrade };
}

function send(ws: WebSocket, event: object) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
}

function reject(socket: Duplex, status: 401 | 403) {
  socket.write(`HTTP/1.1 ${status} ${status === 401 ? "Unauthorized" : "Forbidden"}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function readCookie(header: string | undefined, name: string) {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
