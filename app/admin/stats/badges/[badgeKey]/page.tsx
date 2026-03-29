import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { playerBadges, players, seasons } from "@/src/db/schema";
import { BADGE_META_BY_KEY, getBadgeMeta, getBadgeRarity } from "@/src/lib/badges";

type BadgeDetailPageProps = {
  params: Promise<{ badgeKey: string }>;
  searchParams: Promise<{ seasonId?: string | string[] }>;
};

export default async function BadgeDetailPage({ params, searchParams }: BadgeDetailPageProps) {
  const routeParams = await params;
  const badgeKey = routeParams.badgeKey;

  const isKnownBadge = Object.prototype.hasOwnProperty.call(BADGE_META_BY_KEY, badgeKey);
  if (!isKnownBadge) {
    return (
      <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
        <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-300 bg-white p-6">
          <p className="mb-4 text-sm text-zinc-600">
            <Link href="/admin/stats/badges" className="hover:text-zinc-900">
              ← Zurück zur Badge Hall of Fame
            </Link>
          </p>
          <h1 className="text-xl font-semibold">Unbekanntes Badge</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Der Badge-Key <code>{badgeKey}</code> ist nicht bekannt.
          </p>
        </section>
      </main>
    );
  }

  const allSeasons = await db
    .select({
      id: seasons.id,
      name: seasons.name,
    })
    .from(seasons)
    .orderBy(desc(seasons.startDate), desc(seasons.id));

  const paramsSearch = await searchParams;
  const seasonIdParam = Array.isArray(paramsSearch.seasonId)
    ? paramsSearch.seasonId[0]
    : paramsSearch.seasonId;

  const parsedSeasonId = Number(seasonIdParam);
  const selectedSeason =
    seasonIdParam !== undefined && seasonIdParam !== "" && Number.isInteger(parsedSeasonId)
      ? allSeasons.find((season) => season.id === parsedSeasonId) ?? null
      : null;

  const validSeasonId = selectedSeason?.id;
  const badgeFilter = validSeasonId
    ? and(eq(playerBadges.badgeKey, badgeKey), eq(playerBadges.seasonId, validSeasonId))
    : eq(playerBadges.badgeKey, badgeKey);

  const [metricsRows, ownerRows] = await Promise.all([
    db
      .select({
        totalAwards: sql<number>`count(*)`,
        ownerCount: sql<number>`count(distinct ${playerBadges.playerId})`,
      })
      .from(playerBadges)
      .where(badgeFilter),
    db
      .select({
        playerId: players.id,
        playerName: players.name,
        seasonId: seasons.id,
        seasonName: seasons.name,
        matchId: playerBadges.matchId,
      })
      .from(playerBadges)
      .innerJoin(players, eq(playerBadges.playerId, players.id))
      .innerJoin(seasons, eq(playerBadges.seasonId, seasons.id))
      .where(badgeFilter)
      .orderBy(desc(seasons.startDate), desc(seasons.id), asc(players.name)),
  ]);

  const totalAwards = Number(metricsRows[0]?.totalAwards ?? 0);
  const ownerCount = Number(metricsRows[0]?.ownerCount ?? 0);
  const rarity = getBadgeRarity(ownerCount);
  const badgeMeta = getBadgeMeta(badgeKey);

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/admin/stats/badges" className="hover:text-zinc-900">
            ← Zurück zur Badge Hall of Fame
          </Link>
        </p>

        <h1 className="text-2xl font-semibold text-zinc-900">
          <span className="mr-2" aria-hidden="true">
            {badgeMeta.emoji}
          </span>
          {badgeMeta.label}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">Kategorie: {badgeMeta.category}</p>
        {badgeMeta.description ? <p className="mt-1 text-sm text-zinc-500">{badgeMeta.description}</p> : null}
        <p className="mt-1 text-xs text-zinc-500">Key: {badgeKey}</p>

        <form method="GET" className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="seasonId" className="text-sm text-zinc-600">
            Saison:
          </label>
          <select
            id="seasonId"
            name="seasonId"
            defaultValue={validSeasonId?.toString() ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Alle Saisons</option>
            {allSeasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 bg-stone-50 px-3 py-2 text-sm hover:border-zinc-500"
          >
            Filtern
          </button>
        </form>

        <p className="mt-3 text-sm text-zinc-500">
          Aktive Ansicht: {selectedSeason ? selectedSeason.name : "Alle Saisons"}
        </p>

        {seasonIdParam && !selectedSeason ? (
          <p className="mt-2 text-sm text-amber-300">
            Ungültige Saison gewählt. Es werden alle Saisons angezeigt.
          </p>
        ) : null}

        <section className="mt-6 rounded-2xl border border-zinc-300 bg-stone-50 p-5">
          <h2 className="text-lg font-semibold text-zinc-900">Seltenheit</h2>
          <p className="mt-2 text-sm text-zinc-600">
            {rarity ? (
              <>
                Dieses Badge ist in dieser Ansicht <span className="font-semibold">{rarity}</span>.
              </>
            ) : (
              "Für diese Ansicht sind keine Besitzer vorhanden."
            )}
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-300 bg-stone-50 p-5">
          <h2 className="text-lg font-semibold text-zinc-900">Kennzahlen</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border border-zinc-300 bg-white p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Gesamtvergaben</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{totalAwards}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-white p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Verschiedene Besitzer</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{ownerCount}</p>
            </article>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-300 bg-stone-50 p-5">
          <h2 className="text-lg font-semibold text-zinc-900">Besitzer</h2>
          <p className="mt-1 text-sm text-zinc-500">Sortiert nach Saison (absteigend), dann Spielername.</p>

          {ownerRows.length === 0 ? (
            <p className="mt-4 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-600">
              Keine Badge-Besitzer in dieser Ansicht.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-300 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-stone-50 text-zinc-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Spieler</th>
                    <th className="px-4 py-3 text-left">Saison</th>
                    <th className="px-4 py-3 text-left">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerRows.map((owner) => (
                    <tr
                      key={`${badgeKey}-${owner.playerId}-${owner.seasonId}`}
                      className="border-t border-zinc-300"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/players/${owner.playerId}`}
                          className="font-medium text-zinc-900 hover:text-zinc-700"
                        >
                          {owner.playerName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{owner.seasonName}</td>
                      <td className="px-4 py-3 text-zinc-600">
                        {owner.matchId ? (
                          <Link
                            href={`/admin/matches/${owner.matchId}`}
                            className="font-medium text-zinc-900 hover:text-zinc-700"
                          >
                            #{owner.matchId}
                          </Link>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}