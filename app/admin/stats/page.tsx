import Link from "next/link";

const statsPages = [
  {
    title: "Topscorer",
    href: "/admin/stats/topscorer",
    description: "Die meisten Tore pro Spieler",
  },
  {
    title: "Top-Assists",
    href: "/admin/stats/topassists",
    description: "Die meisten Vorlagen pro Spieler",
  },
  {
    title: "Scorer-Assist-Kombinationen",
    href: "/admin/stats/scorer-assist-combos",
    description: "Wer legt wem am häufigsten auf",
  },
  {
    title: "Duo-Performance",
    href: "/admin/stats/duo-performance",
    description: "Wie gut 2 Spieler zusammen performen (Tore & Spiele)",
  },
  {
    title: "Trio-Performance",
    href: "/admin/stats/trio-performance",
    description: "Wie gut 3 Spieler zusammen performen",
  },
] as const;

export default function StatsOverviewPage() {
  return (
    <main className="p-6">
      <p className="mb-4">
        <Link href="/admin/matches">← Zurück zu Matches</Link>
      </p>

      <h1 className="text-xl font-semibold mb-4">Statistiken</h1>

      <ul className="space-y-4">
        {statsPages.map((page) => (
          <li key={page.href}>
            <h2 className="font-medium">{page.title}</h2>
            <p className="text-sm text-gray-600">{page.description}</p>
            <p>
              <Link href={page.href}>Zur Statistik</Link>
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}