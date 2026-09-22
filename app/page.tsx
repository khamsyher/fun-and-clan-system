import { redirect } from "next/navigation";

// Signed-in users are sent to their dashboard by proxy.ts; everyone else signs in.
export default function Home() {
  redirect("/login");
}
