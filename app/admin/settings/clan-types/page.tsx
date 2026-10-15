import { redirect } from "next/navigation";

/** Clan types moved to the Clans page; this keeps old links and bookmarks working. */
export default function ClanTypesMoved() {
  redirect("/admin/clans/types");
}
