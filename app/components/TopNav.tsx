"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TopNavProps = {
  isAdmin: boolean;
};

const publicNavItems = [
  { href: "/", label: "Dashboard" },
  { href: "/spieltag", label: "Spieltag" },
  { href: "/stats", label: "Statistiken" },
] as const;

const adminNavItems = [
  { href: "/admin/matches", label: "Matches" },
  { href: "/admin/players", label: "Spieler" },
] as const;

export function TopNav({ isAdmin }: TopNavProps) {
  const pathname = usePathname();
  const navItems = isAdmin ? [...publicNavItems, ...adminNavItems] : publicNavItems;

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-300/90 bg-stone-100/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-wide text-zinc-900 sm:text-base">
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
                    ? "border-zinc-900 bg-zinc-900 text-zinc-100"
                    : "border-zinc-300 bg-white/80 text-zinc-700 hover:border-zinc-500 hover:text-zinc-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          {isAdmin ? (
            <Link
              href="/logout"
              prefetch={false}
              className="rounded-md border border-zinc-300 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-500 hover:text-zinc-900 sm:text-sm"
            >
              Logout
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-zinc-300 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-500 hover:text-zinc-900 sm:text-sm"
            >
              Admin Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}