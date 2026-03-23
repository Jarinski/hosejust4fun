import Link from "next/link";

const publicStatsPages = [
  {
    title: "Topscorer",
    href: "/stats/topscorer",
    description: "Die meisten Tore pro Spieler",
  },
  {
    title: "Top-Assists",
    href: "/stats/topassists",
    description: "Die meisten Vorlagen pro Spieler",
  },
  {
    title: "Scorer-Assist-Kombinationen",
    href: "/stats/scorer-assist-combos",
    description: "Wer legt wem am häufigsten auf",
  },
  {
    title: "Duo-Performance",
    href: "/stats/duo-performance",
    description: "Wie gut 2 Spieler zusammen performen (Tore & Spiele)",
  },
  {
    title: "Trio-Performance",
    href: "/stats/trio-performance",
    description: "Wie gut 3 Spieler zusammen performen",
  },
  {
    title: "Gegentor-Statistik",
    href: "/stats/goals-against",
    description: "Wer kassiert die meisten Gegentore pro Spiel und welche Team-Kombis sind anfällig",
  },
  {
    title: "Wetter-Statistik",
    href: "/stats/weather",
    description: "Spielerleistungen bei Kälte, Regen und Schlechtwetter",
  },
  {
    title: "Tor-Momente",
    href: "/stats/goal-moments",
    description: "1:0-Schützen, Ausgleichstreffer sowie frühe/späte Tore",
  },
  {
    title: "Comeback Impact",
    href: "/stats/comeback-impact",
    description: "Wer trifft, wenn sein Team zurückliegt (inkl. späte Comebacks)",
  },
  {
    title: "Legacy All-Time",
    href: "/stats/legacy",
    description: "Historische Karrierewerte (Tore, Vorlagen, Punkte, Einsätze)",
  },
  {
    title: "Spieler (Legacy + Modern)",
    href: "/stats/players",
    description: "Vergleich je Spieler zwischen Legacy- und modernen Daten",
  },
  {
    title: "Kombinierte Statistiken",
    href: "/stats/combined",
    description: "Gesamttabelle mit Legacy + Modern pro Spielername",
  },
] as const;

export default function PublicStatsOverviewPage() {
  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/" className="hover:text-zinc-900">
            ← Zurück zum Dashboard
          </Link>
        </p>

        <h1 className="mb-2 text-2xl font-semibold">Statistiken</h1>
        <p className="mb-5 text-sm text-zinc-600">
          Öffentliche Auswertungen (Modern + Legacy).
        </p>

        <ul className="space-y-3">
          {publicStatsPages.map((page) => (
            <li key={page.href} className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <h2 className="font-medium text-zinc-900">{page.title}</h2>
              <p className="text-sm text-zinc-600">{page.description}</p>
              <p className="mt-2">
                <Link href={page.href} className="text-sm text-zinc-800 hover:text-zinc-900">
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