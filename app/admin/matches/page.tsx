import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { matches, seasons } from "@/src/db/schema";

export default async function MatchesPage() {
  const allMatches = await db
    .select({
      id: matches.id,
      matchDate: matches.matchDate,
      seasonName: seasons.name,
      team1Name: matches.team1Name,
      team2Name: matches.team2Name,
    })
    .from(matches)
    .leftJoin(seasons, eq(matches.seasonId, seasons.id))
    .orderBy(desc(matches.matchDate));

  return (
    <main>
      <h1>Spiele</h1>
      <p>
        <Link href="/admin/matches/new">Neues Spiel</Link>
      </p>

      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Saison</th>
            <th>Spiel</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {allMatches.map((match) => (
            <tr key={match.id}>
              <td>{match.matchDate.toLocaleDateString("de-DE")}</td>
              <td>{match.seasonName ?? "—"}</td>
              <td>
                {match.team1Name} vs {match.team2Name}
              </td>
              <td>
                <Link href={`/admin/matches/${match.id}/participants`}>Teilnehmer</Link>{" "}
                <Link href={`/admin/matches/${match.id}/goals`}>Tore</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}