/** Pill colours for savings statuses, shared by the staff list and group pages. */
export const GROUP_TONE = { forming: "info", active: "ok", completed: "mute", cancelled: "bad" } as const;
export const MEMBER_TONE = { pending: "warn", approved: "ok", declined: "mute", removed: "mute" } as const;
export const ROUND_TONE = { upcoming: "mute", collecting: "info", done: "ok" } as const;
