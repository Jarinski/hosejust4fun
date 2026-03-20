import Link from "next/link";

export default function Home() {
  const sections = [
    {
      title: "Matches",
      href: "/admin/matches",
      description: "Spiele anlegen, verwalten und Ergebnisse dokumentieren.",
    },
    {
      title: "Spieler",
      href: "/admin/players",
      description: "Spielerprofile erfassen und den Kader pflegen.",
    },
    {
      title: "Statistiken",
      href: "/admin/stats",
      description: "Leistungen, Trends und Auswertungen im Überblick.",
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-12 sm:px-8 sm:py-16">
      <section className="mb-10 sm:mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
          HoSe Just4Fun
        </h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-300 sm:text-lg">
          Spieler, Matches und Statistiken für unsere Hobby-Fußballrunde
        </p>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          Fokus: schnelle Datenerfassung und einfache Auswertung.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {section.title}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {section.description}
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-zinc-700 group-hover:text-zinc-900 dark:text-zinc-300 dark:group-hover:text-zinc-100">
              Öffnen →
            </span>
          </Link>
        ))}
      </section>

      <div className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
        Wähle einen Bereich, um direkt loszulegen.
      </div>
    </main>
  );
}
