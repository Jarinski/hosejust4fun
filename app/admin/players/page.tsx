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
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <section className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <p className="mb-4 text-sm text-zinc-300">
          <Link href="/admin/stats" className="hover:text-white">← Zurück zu Statistiken</Link>
        </p>

        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Spieler</h1>
          <Link
            href="/admin/players/new"
            className="rounded-lg border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm hover:border-zinc-500"
          >
            + Neuer Spieler
          </Link>
        </div>

        {allPlayers.length === 0 ? (
          <p className="text-zinc-400">Es sind noch keine Spieler vorhanden.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950/70 text-zinc-300">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Erstellt am</th>
                  <th className="px-4 py-3 text-left">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {allPlayers.map((player) => (
                  <tr key={player.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3">{player.name}</td>
                    <td className="px-4 py-3 text-zinc-300">
                      {player.createdAt ? player.createdAt.toLocaleDateString("de-DE") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/players/${player.id}`}
                        className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:border-zinc-500"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}