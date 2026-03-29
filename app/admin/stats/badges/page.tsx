import Link from "next/link";
import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { playerBadges, players, seasons } from "@/src/db/schema";
import { BADGE_CATEGORY_ORDER, BadgeMeta, getBadgeMeta, getBadgeRarity } from "@/src/lib/badges";

type BadgeStatsPageProps = {
  searchParams: Promise<{ seasonId?: string | string[] }>;
};

type HallOfFameEntry = {
  playerId: number;
  playerName: string;
  badgeCount: number;
};

type BadgeDistributionEntry = {
  badgeKey: string;
  badgeCount: number;
  meta: BadgeMeta;
};

type BadgeOwnerRow = {
  badgeKey: string;
  playerId: number;
  playerName: string;
  seasonId: number;
  seasonName: string;
};

const orderedBadgeCategories = [...BADGE_CATEGORY_ORDER, "Unbekannt"] as const;

const badgeCategoryOrder = new Map<string, number>(
  orderedBadgeCategories.map((category, index) => [category, index]),
);

export default async function BadgeStatsPage({ searchParams }: BadgeStatsPageProps) {
  const allSeasons = await db
    .select({
      id: seasons.id,
      name: seasons.name,
    })
    .from(seasons)
    .orderBy(desc(seasons.startDate), desc(seasons.id));

  const params = await searchParams;
  const seasonIdParam = Array.isArray(params.seasonId) ? params.seasonId[0] : params.seasonId;

  const parsedSeasonId = Number(seasonIdParam);
  const selectedSeason =
    seasonIdParam !== undefined && seasonIdParam !== "" && Number.isInteger(parsedSeasonId)
      ? allSeasons.find((season) => season.id === parsedSeasonId) ?? null
      : null;

  const validSeasonId = selectedSeason?.id;
  const seasonFilter = validSeasonId ? eq(playerBadges.seasonId, validSeasonId) : undefined;

  const [hallOfFameRows, badgeDistributionRows, badgeOwnerRows] = await Promise.all([
    db
      .select({
        playerId: players.id,
        playerName: players.name,
        badgeCount: count(playerBadges.id),
      })
      .from(playerBadges)
      .innerJoin(players, eq(playerBadges.playerId, players.id))
      .where(seasonFilter)
      .groupBy(players.id, players.name)
      .orderBy(desc(count(playerBadges.id)), asc(players.name)),

    db
      .select({
        badgeKey: playerBadges.badgeKey,
        badgeCount: count(playerBadges.id),
      })
      .from(playerBadges)
      .where(seasonFilter)
      .groupBy(playerBadges.badgeKey),

    db
      .select({
        badgeKey: playerBadges.badgeKey,
        playerId: players.id,
        playerName: players.name,
        seasonId: seasons.id,
        seasonName: seasons.name,
      })
      .from(playerBadges)
      .innerJoin(players, eq(playerBadges.playerId, players.id))
      .innerJoin(seasons, eq(playerBadges.seasonId, seasons.id))
      .where(seasonFilter)
      .orderBy(asc(playerBadges.badgeKey), asc(players.name), desc(seasons.id)),
  ]);

  const hallOfFame: HallOfFameEntry[] = [...hallOfFameRows].sort((a, b) => {
    if (b.badgeCount !== a.badgeCount) {
      return b.badgeCount - a.badgeCount;
    }

    return a.playerName.localeCompare(b.playerName, "de");
  });

  const badgeDistribution: BadgeDistributionEntry[] = badgeDistributionRows
    .map((row) => ({
      badgeKey: row.badgeKey,
      badgeCount: row.badgeCount,
      meta: getBadgeMeta(row.badgeKey),
    }))
    .sort((a, b) => {
      if (b.badgeCount !== a.badgeCount) {
        return b.badgeCount - a.badgeCount;
      }

      const categoryOrderA = badgeCategoryOrder.get(a.meta.category) ?? Number.MAX_SAFE_INTEGER;
      const categoryOrderB = badgeCategoryOrder.get(b.meta.category) ?? Number.MAX_SAFE_INTEGER;
      if (categoryOrderA !== categoryOrderB) {
        return categoryOrderA - categoryOrderB;
      }

      const byLabel = a.meta.label.localeCompare(b.meta.label, "de");
      if (byLabel !== 0) {
        return byLabel;
      }

      return a.badgeKey.localeCompare(b.badgeKey, "de");
    });

  const ownerGroups = new Map<string, BadgeOwnerRow[]>();
  for (const row of badgeOwnerRows) {
    const current = ownerGroups.get(row.badgeKey) ?? [];
    current.push(row);
    ownerGroups.set(row.badgeKey, current);
  }

  const groupedBadges = Array.from(ownerGroups.entries())
    .map(([badgeKey, rows]) => ({
      badgeKey,
      meta: getBadgeMeta(badgeKey),
      owners: [...rows].sort((a, b) => {
        const byName = a.playerName.localeCompare(b.playerName, "de");
        if (byName !== 0) {
          return byName;
        }

        return b.seasonId - a.seasonId;
      }),
    }))
    .sort((a, b) => {
      const categoryOrderA = badgeCategoryOrder.get(a.meta.category) ?? Number.MAX_SAFE_INTEGER;
      const categoryOrderB = badgeCategoryOrder.get(b.meta.category) ?? Number.MAX_SAFE_INTEGER;
      if (categoryOrderA !== categoryOrderB) {
        return categoryOrderA - categoryOrderB;
      }

      const byLabel = a.meta.label.localeCompare(b.meta.label, "de");
      if (byLabel !== 0) {
        return byLabel;
      }

      return a.badgeKey.localeCompare(b.badgeKey, "de");
    });

  const badgesByCategory = orderedBadgeCategories
    .map((category) => ({
      category,
      badges: groupedBadges.filter((badge) => badge.meta.category === category),
    }))
    .filter((group) => group.badges.length > 0);

  const hasAnyBadges = badgeOwnerRows.length > 0;
  const seasonQuery = validSeasonId ? `?seasonId=${validSeasonId}` : "";

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/stats" className="hover:text-zinc-900">
            ← Zurück zu Statistiken
          </Link>
        </p>

        <h1 className="text-2xl font-semibold">Badge Hall of Fame</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Globale Badge-Übersicht: Ranking, Verteilung und Besitzer pro Badge.
        </p>

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

        {!hasAnyBadges ? (
          <p className="mt-6 rounded-xl border border-zinc-300 bg-stone-50 px-4 py-3 text-zinc-600">
            Noch keine Badges vergeben.
          </p>
        ) : null}

        <div className="mt-6 space-y-6">
          <section className="rounded-2xl border border-zinc-300 bg-stone-50 p-5">
            <h2 className="text-lg font-semibold text-zinc-900">Hall of Fame</h2>
            <p className="mt-1 text-sm text-zinc-500">Spieler mit den meisten Badges (gesamt).</p>

            {hallOfFame.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">Keine Badge-Rankings vorhanden.</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-300 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-stone-50 text-zinc-600">
                    <tr>
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Spieler</th>
                      <th className="px-4 py-3 text-left">Badges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hallOfFame.map((entry, index) => (
                      <tr key={entry.playerId} className="border-t border-zinc-300">
                        <td className="px-4 py-3 text-zinc-500">{index + 1}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/players/${entry.playerId}`}
                            className="font-medium text-zinc-900 hover:text-zinc-700"
                          >
                            {entry.playerName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-semibold text-red-300">{entry.badgeCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-300 bg-stone-50 p-5">
            <h2 className="text-lg font-semibold text-zinc-900">Badge-Verteilung</h2>
            <p className="mt-1 text-sm text-zinc-500">Wie häufig jedes Badge vergeben wurde.</p>

            {badgeDistribution.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">Noch keine Badge-Verteilungen vorhanden.</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-300 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-stone-50 text-zinc-600">
                    <tr>
                      <th className="px-4 py-3 text-left">Badge</th>
                      <th className="px-4 py-3 text-left">Kategorie</th>
                      <th className="px-4 py-3 text-left">Häufigkeit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {badgeDistribution.map((entry) => {
                      const meta = getBadgeMeta(entry.badgeKey);
                      const rarity = getBadgeRarity(entry.badgeCount);

                      return (
                        <tr key={entry.badgeKey} className="border-t border-zinc-300">
                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/stats/badges/${entry.badgeKey}${seasonQuery}`}
                              className="font-medium text-zinc-900 hover:text-zinc-700"
                            >
                              <span className="mr-1" aria-hidden="true">
                                {meta.emoji}
                              </span>
                              {meta.label}
                            </Link>
                            <p className="text-xs text-zinc-500">{entry.badgeKey}</p>
                          </td>
                          <td className="px-4 py-3 text-zinc-600">{meta.category}</td>
                          <td className="px-4 py-3 font-semibold text-red-300">
                            {entry.badgeCount}
                            {rarity ? <span className="ml-2 text-xs text-zinc-500">({rarity})</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-300 bg-stone-50 p-5">
            <h2 className="text-lg font-semibold text-zinc-900">Wer hat welches Badge?</h2>
            <p className="mt-1 text-sm text-zinc-500">Gruppiert nach Kategorie und Badge.</p>

            {badgesByCategory.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">Noch keine Badge-Besitzer vorhanden.</p>
            ) : (
              <div className="mt-4 space-y-5">
                {badgesByCategory.map((group) => (
                  <section key={group.category}>
                    <h3 className="mb-3 text-sm font-medium text-zinc-700">{group.category}</h3>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {group.badges.map((badge) => (
                        <article
                          key={badge.badgeKey}
                          className="rounded-xl border border-zinc-300 bg-white p-3"
                        >
                          <Link
                            href={`/admin/stats/badges/${badge.badgeKey}${seasonQuery}`}
                            className="font-medium text-zinc-900 hover:text-zinc-700"
                          >
                            <span className="mr-1" aria-hidden="true">
                              {badge.meta.emoji}
                            </span>
                            {badge.meta.label}
                          </Link>
                          <p className="mt-0.5 text-xs text-zinc-500">{badge.badgeKey}</p>
                          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                            {badge.owners.map((owner) => (
                              <li key={`${badge.badgeKey}-${owner.playerId}-${owner.seasonId}`}>
                                <Link
                                  href={`/admin/players/${owner.playerId}`}
                                  className="font-medium text-zinc-900 hover:text-zinc-700"
                                >
                                  {owner.playerName}
                                </Link>
                                {validSeasonId ? null : (
                                  <span className="text-zinc-500"> · {owner.seasonName}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}