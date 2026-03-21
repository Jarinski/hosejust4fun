import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  checkLoginRateLimit,
  createAdminSession,
  getClientIpFromHeaders,
  getAdminSession,
  hasAdminAccountsConfigured,
  recordFailedLoginAttempt,
  resetFailedLoginAttempts,
  sanitizeNextPath,
  verifyAdminCredentials,
} from "@/src/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; retry?: string }>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next);
  const session = await getAdminSession();
  const hasAdminsConfigured = hasAdminAccountsConfigured();

  if (session) {
    redirect(nextPath);
  }

  async function loginAction(formData: FormData) {
    "use server";

    const requestHeaders = await headers();
    const ip = getClientIpFromHeaders(requestHeaders);

    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const targetPath = sanitizeNextPath(String(formData.get("next") ?? "/"));

    const rateLimit = checkLoginRateLimit(ip);
    if (!rateLimit.allowed) {
      redirect(
        `/login?error=locked&retry=${rateLimit.retryAfterSeconds}&next=${encodeURIComponent(targetPath)}`
      );
    }

    if (!hasAdminAccountsConfigured()) {
      redirect(`/login?error=config&next=${encodeURIComponent(targetPath)}`);
    }

    const account = verifyAdminCredentials(username, password);
    if (!account) {
      const failedAttempt = recordFailedLoginAttempt(ip, username || "<empty>");
      if (failedAttempt.locked) {
        redirect(
          `/login?error=locked&retry=${failedAttempt.retryAfterSeconds}&next=${encodeURIComponent(targetPath)}`
        );
      }

      redirect(`/login?error=1&next=${encodeURIComponent(targetPath)}`);
    }

    resetFailedLoginAttempts(ip);
    await createAdminSession(account.username);
    redirect(targetPath);
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-10 text-zinc-900">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-zinc-300 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold">Admin Login</h1>
        <p className="mb-5 text-sm text-zinc-600">
          Nur Admins dürfen Spiele anlegen, Spieler verwalten und Tore bearbeiten.
        </p>

        {!hasAdminsConfigured ? (
          <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Es sind noch keine Admin-Zugangsdaten konfiguriert. Bitte setze <code>ADMIN_USERNAME</code> und
            <code> ADMIN_PASSWORD</code> (oder <code>ADMIN_ACCOUNTS_JSON</code>) in der <code>.env.local</code>.
          </p>
        ) : null}

        {params.error === "1" ? (
          <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            Login fehlgeschlagen. Bitte Benutzername und Passwort prüfen.
          </p>
        ) : null}

        {params.error === "config" ? (
          <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            Admin-Accounts sind nicht konfiguriert.
          </p>
        ) : null}

        {params.error === "locked" ? (
          <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            Zu viele fehlgeschlagene Login-Versuche. Bitte warte
            {" "}
            <strong>{Math.max(1, Math.ceil(Number(params.retry ?? "60") / 60))} Minute(n)</strong>
            {" "}
            und versuche es dann erneut.
          </p>
        ) : null}

        <form action={loginAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={nextPath} />

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-700">Benutzername</span>
            <input
              type="text"
              name="username"
              required
              autoComplete="username"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-700">Passwort</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2"
            />
          </label>

          <button
            type="submit"
            className="w-fit rounded-lg border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
          >
            Einloggen
          </button>
        </form>
      </section>
    </main>
  );
}