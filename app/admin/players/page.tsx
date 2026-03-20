import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/src/db";
import { players } from "@/src/db/schema";

export default async function PlayersPage() {
  const allPlayers = await db
    .select({
      id: players.id,
      name: players.name,
      createdAt: players.createdAt,
    })
    .from(players)
    .orderBy(asc(players.name));

  return (
    <main className="p-6">
      <p className="mb-4">
        <Link href="/admin/stats">← Zurück zu Statistiken</Link>
      </p>

      <p className="mb-4">
        <Link href="/admin/players/new">+ Neuer Spieler</Link>
      </p>

      <h1 className="text-xl font-semibold mb-4">Spieler</h1>

      {allPlayers.length === 0 ? (
        <p>Es sind noch keine Spieler vorhanden.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Erstellt am</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {allPlayers.map((player) => (
              <tr key={player.id}>
                <td>{player.name}</td>
                <td>{player.createdAt ? player.createdAt.toLocaleDateString("de-DE") : "—"}</td>
                <td>
                  <Link href={`/admin/players/${player.id}`}>Details</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}