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
  {
    title: "Gegentor-Statistik",
    href: "/admin/stats/goals-against",
    description: "Wer kassiert die meisten Gegentore pro Spiel und welche Team-Kombis sind anfällig",
  },
] as const;

export default function StatsOverviewPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <p className="mb-4 text-sm text-zinc-300">
          <Link href="/admin/matches" className="hover:text-white">← Zurück zu Matches</Link>
        </p>

        <h1 className="mb-4 text-2xl font-semibold">Statistiken</h1>

        <ul className="space-y-3">
          {statsPages.map((page) => (
            <li key={page.href} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <h2 className="font-medium">{page.title}</h2>
              <p className="text-sm text-zinc-400">{page.description}</p>
              <p className="mt-2">
                <Link href={page.href} className="text-sm text-red-300 hover:text-red-200">
                  Zur Statistik →
                </Link>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}