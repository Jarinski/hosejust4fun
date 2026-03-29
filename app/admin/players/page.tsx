import { redirect } from "next/navigation";

export default async function PlayersPage() {
  redirect("/stats/players");
}