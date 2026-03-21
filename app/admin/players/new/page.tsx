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
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <section className="mx-auto w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <p className="mb-4 text-sm text-zinc-300">
          <Link href="/admin/players" className="hover:text-white">← Zurück zu Spielern</Link>
        </p>

        <h1 className="mb-4 text-2xl font-semibold">Neuer Spieler</h1>

        {hasError ? (
          <p className="mb-4 rounded-lg border border-red-700/40 bg-red-950/40 px-3 py-2 text-red-300">
            Bitte einen Namen eingeben.
          </p>
        ) : null}

        <form action={createPlayer} className="flex max-w-md flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-300">Name</span>
            <input
              type="text"
              name="name"
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            className="w-fit rounded-lg border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Speichern
          </button>
        </form>
      </section>
    </main>
  );
}
