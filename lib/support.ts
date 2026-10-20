import "server-only";
import { query, queryOne } from "./db";

/** One chat message, shaped the same way the WebSocket sends it, so the page can mix both. */
export type ChatMessage = { id: string; body: string; fromStaff: boolean; senderName: string | null; createdAt: string };
export type SupportStatus = "open" | "closed";

const HISTORY = 200;

async function messages(threadId: string): Promise<ChatMessage[]> {
  const rows = await query<{ id: string; body: string; from_staff: boolean; sender_name: string | null; created_at: Date }>(
    `SELECT * FROM (
       SELECT m.id, m.body, m.from_staff, u.full_name AS sender_name, m.created_at
         FROM support_messages m LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.thread_id = $1
        ORDER BY m.id DESC LIMIT ${HISTORY}
     ) last ORDER BY id`,
    [threadId],
  );
  return rows.map((r) => ({ id: r.id, body: r.body, fromStaff: r.from_staff, senderName: r.sender_name, createdAt: r.created_at.toISOString() }));
}

/** A person's own conversation, if they have started one. */
export async function myConversation(userId: string) {
  const thread = await queryOne<{ id: string; status: SupportStatus }>(`SELECT id, status FROM support_threads WHERE user_id = $1`, [userId]);
  return { threadId: thread?.id ?? null, status: thread?.status ?? ("open" as SupportStatus), messages: thread ? await messages(thread.id) : [] };
}

export type InboxRow = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  clan_name: string | null;
  status: SupportStatus;
  last_message_at: Date;
  last_body: string | null;
  last_from_staff: boolean | null;
  unread: string;
};

/** Every conversation for staff: unanswered first, then newest. */
export function inbox(status: SupportStatus | "all") {
  return query<InboxRow>(
    `SELECT t.id, t.user_id, u.full_name, u.phone, c.name AS clan_name, t.status, t.last_message_at,
            lm.body AS last_body, lm.from_staff AS last_from_staff,
            (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id AND NOT m.from_staff AND m.created_at > t.staff_last_read_at) AS unread
       FROM support_threads t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN clans c ON c.id = u.clan_id
       LEFT JOIN LATERAL (SELECT body, from_staff FROM support_messages WHERE thread_id = t.id ORDER BY id DESC LIMIT 1) lm ON TRUE
      WHERE $1 = 'all' OR t.status::text = $1
      ORDER BY (lm.from_staff IS FALSE AND t.status = 'open') DESC, t.last_message_at DESC
      LIMIT 300`,
    [status],
  );
}

/** One conversation for staff, with who it's with. */
export async function conversation(threadId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) return null;
  const thread = await queryOne<{ id: string; user_id: string; full_name: string; phone: string; status: SupportStatus }>(
    `SELECT t.id, t.user_id, u.full_name, u.phone, t.status FROM support_threads t JOIN users u ON u.id = t.user_id WHERE t.id = $1`,
    [threadId],
  );
  return thread ? { ...thread, messages: await messages(thread.id) } : null;
}

/** Replies from the platform team the person hasn't seen yet. */
export async function unreadForUser(userId: string) {
  const r = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM support_messages m JOIN support_threads t ON t.id = m.thread_id
      WHERE t.user_id = $1 AND m.from_staff AND m.created_at > t.user_last_read_at`,
    [userId],
  );
  return Number(r?.n ?? 0);
}

/** Conversations with something new from the person that no staff member has read. */
export async function unreadThreadsForStaff() {
  const r = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM support_threads t
      WHERE EXISTS (SELECT 1 FROM support_messages m WHERE m.thread_id = t.id AND NOT m.from_staff AND m.created_at > t.staff_last_read_at)`,
  );
  return Number(r?.n ?? 0);
}
