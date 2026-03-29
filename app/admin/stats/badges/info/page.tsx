import Link from "next/link";
import { BADGE_CATEGORY_ORDER, BADGE_KEYS, getBadgeMeta } from "@/src/lib/badges";

const orderedCategories = [...BADGE_CATEGORY_ORDER, "Unbekannt"] as const;

const categoryOrder = new Map<string, number>(
  orderedCategories.map((category, index) => [category, index]),
);

const badgeInfoEntries = Object.values(BADGE_KEYS)
  .map((badgeKey) => ({
    badgeKey,
    meta: getBadgeMeta(badgeKey),
  }))
  .sort((a, b) => {
    const categoryOrderA = categoryOrder.get(a.meta.category) ?? Number.MAX_SAFE_INTEGER;
    const categoryOrderB = categoryOrder.get(b.meta.category) ?? Number.MAX_SAFE_INTEGER;

    if (categoryOrderA !== categoryOrderB) {
      return categoryOrderA - categoryOrderB;
    }

    const byLabel = a.meta.label.localeCompare(b.meta.label, "de");
    if (byLabel !== 0) {
      return byLabel;
    }

    return a.badgeKey.localeCompare(b.badgeKey, "de");
  });

export default function BadgeInfoPage() {
  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/admin/stats/badges" className="hover:text-zinc-900">
            ← Zurück zur Badge Hall of Fame
          </Link>
        </p>

        <h1 className="text-2xl font-semibold">Badge-Erklärungen</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Übersicht aller Badge-Keys inkl. Emoji, Label, Kategorie und Beschreibung.
        </p>

        <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-300 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-zinc-600">
              <tr>
                <th className="px-4 py-3 text-left">Badge</th>
                <th className="px-4 py-3 text-left">Kategorie</th>
                <th className="px-4 py-3 text-left">Beschreibung</th>
                <th className="px-4 py-3 text-left">Key</th>
              </tr>
            </thead>
            <tbody>
              {badgeInfoEntries.map((entry) => (
                <tr key={entry.badgeKey} className="border-t border-zinc-300">
                  <td className="px-4 py-3">
                    <span className="mr-1" aria-hidden="true">
                      {entry.meta.emoji}
                    </span>
                    <span className="font-medium text-zinc-900">{entry.meta.label}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{entry.meta.category}</td>
                  <td className="px-4 py-3 text-zinc-600">{entry.meta.description}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{entry.badgeKey}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
