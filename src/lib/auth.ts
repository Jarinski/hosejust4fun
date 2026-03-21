import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type AdminAccount = {
  username: string;
  password: string;
};

type SessionPayload = {
  username: string;
  exp: number;
};

export const SESSION_COOKIE_NAME = "hose_admin_session";

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

function getAuthSecret() {
  return process.env.AUTH_SECRET ?? "dev-only-auth-secret-change-me";
}

function sign(value: string) {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

function getConfiguredAdminAccounts(): AdminAccount[] {
  const jsonConfig = process.env.ADMIN_ACCOUNTS_JSON;

  if (jsonConfig) {
    try {
      const parsed = JSON.parse(jsonConfig) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (item): item is AdminAccount =>
              Boolean(
                item &&
                  typeof item === "object" &&
                  typeof (item as { username?: unknown }).username === "string" &&
                  typeof (item as { password?: unknown }).password === "string"
              )
          )
          .map((item) => ({
            username: item.username.trim(),
            password: item.password,
          }))
          .filter((item) => item.username.length > 0 && item.password.length > 0);
      }
    } catch {
      // Fallback auf Einzel-Account per ENV.
    }
  }

  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (username && password) {
    return [{ username, password }];
  }

  return [];
}

export function hasAdminAccountsConfigured() {
  return getConfiguredAdminAccounts().length > 0;
}

export function verifyAdminCredentials(username: string, password: string) {
  const normalizedUsername = username.trim();
  const accounts = getConfiguredAdminAccounts();

  return accounts.find(
    (account) => account.username === normalizedUsername && account.password === password
  );
}

function buildSessionToken(payload: SessionPayload) {
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

function parseSessionToken(token: string): SessionPayload | null {
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    return null;
  }

  const expectedSignature = sign(payloadBase64);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")) as SessionPayload;

    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.username !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    if (payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function getAdminSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = parseSessionToken(token);
  if (!payload) {
    return null;
  }

  return { username: payload.username };
}

export async function createAdminSession(username: string) {
  const store = await cookies();
  const payload: SessionPayload = {
    username,
    exp: Date.now() + SESSION_DURATION_SECONDS * 1000,
  };

  store.set({
    name: SESSION_COOKIE_NAME,
    value: buildSessionToken(payload),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export function sanitizeNextPath(nextPath: string | null | undefined) {
  if (!nextPath) {
    return "/";
  }

  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/";
  }

  return nextPath;
}

export async function requireAdmin(nextPath: string) {
  const session = await getAdminSession();

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(sanitizeNextPath(nextPath))}`);
  }

  return session;
}

export async function requireAdminInAction() {
  const session = await getAdminSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}