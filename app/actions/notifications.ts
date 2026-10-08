"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/dal";

/** Marks everything the signed-in user has as read (used when they open the bell or the page). */
export async function markAllRead() {
  const me = await requireRole();
  await query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [me.id]);
  revalidatePath("/", "layout");
}
