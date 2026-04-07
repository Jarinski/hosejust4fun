import { redirect } from "next/navigation";
import { requireAdmin } from "@/src/lib/auth";

export default async function PlayersPage() {
  await requireAdmin("/admin/players");
  redirect("/admin/players/new");
}