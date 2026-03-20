import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/src/db";
import { players } from "@/src/db/schema";

export default async function NewPlayerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";

  async function createPlayer(formData: FormData) {
    "use server";

    const nameRaw = formData.get("name");
    const name = String(nameRaw ?? "").trim();

    if (!name) {
      redirect("/admin/players/new?error=1");
    }

    const insertedPlayers = await db
      .insert(players)
      .values({ name })
      .returning({ id: players.id });

    const newPlayerId = insertedPlayers[0]?.id;

    if (!newPlayerId) {
      redirect("/admin/players");
    }

    redirect(`/admin/players/${newPlayerId}`);
  }

  return (
    <main className="p-6">
      <p className="mb-4">
        <Link href="/admin/players">← Zurück zu Spielern</Link>
      </p>

      <h1 className="text-xl font-semibold mb-4">Neuer Spieler</h1>

      {hasError ? <p className="mb-4 text-red-700">Bitte einen Namen eingeben.</p> : null}

      <form action={createPlayer} className="flex flex-col gap-3 max-w-md">
        <label className="flex flex-col gap-1">
          <span>Name</span>
          <input type="text" name="name" required />
        </label>

        <button type="submit">Speichern</button>
      </form>
    </main>
  );
}
