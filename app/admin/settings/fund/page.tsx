import { redirect } from "next/navigation";

/** The platform fee moved to the Fund page; this keeps old links and bookmarks working. */
export default function FundSettingsMoved() {
  redirect("/admin/fund#platform-fee");
}
