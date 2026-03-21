import { redirect } from "next/navigation";
import { db } from "@/src/db";
import { matches, seasons } from "@/src/db/schema";

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const allSeasons = await db.select().from(seasons);
  const params = await searchParams;
  const isSuccess = params.success === "1";
  const hasError = params.error === "1";

  async function createMatch(formData: FormData) {
    "use server";

    const seasonIdRaw = formData.get("seasonId");
    const matchDateRaw = formData.get("matchDate");
    const team1NameRaw = formData.get("team1Name");
    const team2NameRaw = formData.get("team2Name");

    const seasonId = Number(seasonIdRaw);
    const matchDate = String(matchDateRaw ?? "").trim();
    const team1Name = String(team1NameRaw ?? "").trim();
    const team2Name = String(team2NameRaw ?? "").trim();

    if (!Number.isInteger(seasonId) || !matchDate || !team1Name || !team2Name) {
      redirect("/admin/matches/new?error=1");
    }

    await db.insert(matches).values({
      seasonId,
      matchDate: new Date(`${matchDate}T00:00:00`),
      team1Name,
      team2Name,
    });

    redirect("/admin/matches/new?success=1");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <section className="mx-auto w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h1 className="mb-4 text-2xl font-semibold">Neues Spiel anlegen</h1>

        {isSuccess ? (
          <p className="mb-4 rounded-lg border border-emerald-700/40 bg-emerald-950/40 px-3 py-2 text-emerald-300">
            Spiel wurde erfolgreich angelegt.
          </p>
        ) : null}

        {hasError ? (
          <p className="mb-4 rounded-lg border border-red-700/40 bg-red-950/40 px-3 py-2 text-red-300">
            Bitte alle Pflichtfelder korrekt ausfüllen.
          </p>
        ) : null}

        <form action={createMatch} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-300">Saison</span>
            <select name="seasonId" required className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
            <option value="">Bitte wählen</option>
            {allSeasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-300">Datum des Spiels</span>
            <input
              type="date"
              name="matchDate"
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-300">Team 1 Name</span>
            <input
              type="text"
              name="team1Name"
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-300">Team 2 Name</span>
            <input
              type="text"
              name="team2Name"
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