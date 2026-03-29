import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/src/db";
import { players } from "@/src/db/schema";
import { requireAdmin, requireAdminInAction } from "@/src/lib/auth";

export default async function NewPlayerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin("/admin/players/new");

  const params = await searchParams;
  const hasError = params.error === "1";

  async function createPlayer(formData: FormData) {
    "use server";

    await requireAdminInAction();

    const nameRaw = formData.get("name");
    const name = String(nameRaw ?? "").trim();
    const isGoalkeeper = formData.get("isGoalkeeper") === "on";

    if (!name) {
      redirect("/admin/players/new?error=1");
    }

    const insertedPlayers = await db
      .insert(players)
      .values({
        name,
        isGoalkeeper,
      })
      .returning({ id: players.id });

    const newPlayerId = insertedPlayers[0]?.id;

    if (!newPlayerId) {
      redirect("/stats/players");
    }

    redirect(`/admin/players/${newPlayerId}`);
  }

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-2xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/stats/players" className="hover:text-zinc-900">← Zurück zu Spielern</Link>
        </p>

        <h1 className="mb-4 text-2xl font-semibold">Neuer Spieler</h1>

        {hasError ? (
          <p className="mb-4 rounded-lg border border-red-700/40 bg-red-950/40 px-3 py-2 text-red-300">
            Bitte einen Namen eingeben.
          </p>
        ) : null}

        <form action={createPlayer} className="flex max-w-md flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600">Name</span>
            <input
              type="text"
              name="name"
              required
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2"
            />
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" name="isGoalkeeper" className="h-4 w-4 accent-zinc-900" />
            <span className="text-sm text-zinc-700">Torhüter</span>
          </label>

          <button
            type="submit"
            className="w-fit rounded-lg border border-zinc-300 bg-stone-50 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Speichern
          </button>
        </form>
      </section>
    </main>
  );
}
