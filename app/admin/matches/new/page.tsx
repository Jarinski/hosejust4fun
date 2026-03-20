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
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">Neues Spiel anlegen</h1>

      {isSuccess ? (
        <p className="mb-4 text-green-700">Spiel wurde erfolgreich angelegt.</p>
      ) : null}

      {hasError ? (
        <p className="mb-4 text-red-700">Bitte alle Pflichtfelder korrekt ausfüllen.</p>
      ) : null}

      <form action={createMatch} className="flex flex-col gap-3 max-w-md">
        <label className="flex flex-col gap-1">
          <span>Saison</span>
          <select name="seasonId" required>
            <option value="">Bitte wählen</option>
            {allSeasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span>Datum des Spiels</span>
          <input type="date" name="matchDate" required />
        </label>

        <label className="flex flex-col gap-1">
          <span>Team 1 Name</span>
          <input type="text" name="team1Name" required />
        </label>

        <label className="flex flex-col gap-1">
          <span>Team 2 Name</span>
          <input type="text" name="team2Name" required />
        </label>

        <button type="submit">Speichern</button>
      </form>
    </main>
  );
}