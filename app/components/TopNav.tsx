"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/admin/matches", label: "Matches" },
  { href: "/admin/players", label: "Spieler" },
  { href: "/admin/stats", label: "Statistiken" },
] as const;

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/90 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-wide text-zinc-100 sm:text-base">
          HoSe Just4Fun
        </Link>

        <nav className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
                  isActive
                    ? "border-zinc-300 bg-zinc-100 text-zinc-900"
                    : "border-zinc-700 bg-zinc-900/70 text-zinc-200 hover:border-zinc-500 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}