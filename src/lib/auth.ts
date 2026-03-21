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
const MIN_AUTH_SECRET_LENGTH = 32;

const LOGIN_MAX_FAILED_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

type LoginAttemptState = {
  failedAt: number[];
  lockedUntil: number;
};

const loginAttemptsByIp = new Map<string, LoginAttemptState>();

function getAuthSecret() {
  const secretFromEnv = process.env.AUTH_SECRET;
  if (!secretFromEnv || secretFromEnv.length < MIN_AUTH_SECRET_LENGTH) {
    return null;
  }

  return secretFromEnv;
}

function sign(value: string) {
  const secret = getAuthSecret();
  if (!secret) {
    return null;
  }

  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function hasAuthSecretConfigured() {
  return Boolean(getAuthSecret());
}

function getConfiguredAdminAccounts(): AdminAccount[] {
  const jsonConfig = process.env.ADMIN_ACCOUNTS_JSON ?? process.env.ADMIN_USERS_JSON;

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

export function getClientIpFromHeaders(headers: Headers) {
  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const xRealIp = headers.get("x-real-ip")?.trim();
  if (xRealIp) {
    return xRealIp;
  }

  return "unknown";
}

function getOrCreateLoginAttemptState(ip: string) {
  const existing = loginAttemptsByIp.get(ip);
  if (existing) {
    return existing;
  }

  const created: LoginAttemptState = {
    failedAt: [],
    lockedUntil: 0,
  };

  loginAttemptsByIp.set(ip, created);
  return created;
}

function pruneExpiredAttempts(state: LoginAttemptState, now: number) {
  state.failedAt = state.failedAt.filter((timestamp) => now - timestamp <= LOGIN_WINDOW_MS);

  if (state.failedAt.length === 0 && state.lockedUntil <= now) {
    state.lockedUntil = 0;
  }
}

export function checkLoginRateLimit(ip: string) {
  const now = Date.now();
  const state = getOrCreateLoginAttemptState(ip);
  pruneExpiredAttempts(state, now);

  if (state.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((state.lockedUntil - now) / 1000);
    console.warn("[auth] admin_login_locked", { ip, retryAfterSeconds });

    return {
      allowed: false,
      retryAfterSeconds,
      remainingAttempts: 0,
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, LOGIN_MAX_FAILED_ATTEMPTS - state.failedAt.length),
  };
}

export function recordFailedLoginAttempt(ip: string, username: string) {
  const now = Date.now();
  const state = getOrCreateLoginAttemptState(ip);

  pruneExpiredAttempts(state, now);
  state.failedAt.push(now);

  const failures = state.failedAt.length;
  const shouldLock = failures >= LOGIN_MAX_FAILED_ATTEMPTS;

  if (shouldLock) {
    state.lockedUntil = now + LOGIN_LOCK_MS;
    state.failedAt = [];
  }

  console.warn("[auth] admin_login_failed", {
    ip,
    username,
    failuresWithinWindow: failures,
    maxFailures: LOGIN_MAX_FAILED_ATTEMPTS,
    lockedUntil: shouldLock ? new Date(state.lockedUntil).toISOString() : null,
  });

  return {
    locked: shouldLock,
    retryAfterSeconds: shouldLock ? Math.ceil(LOGIN_LOCK_MS / 1000) : 0,
  };
}

export function resetFailedLoginAttempts(ip: string) {
  loginAttemptsByIp.delete(ip);
}

function buildSessionToken(payload: SessionPayload) {
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(payloadBase64);

  if (!signature) {
    throw new Error(
      `AUTH_SECRET muss gesetzt sein und mindestens ${MIN_AUTH_SECRET_LENGTH} Zeichen haben.`
    );
  }

  return `${payloadBase64}.${signature}`;
}

function parseSessionToken(token: string): SessionPayload | null {
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    return null;
  }

  const expectedSignature = sign(payloadBase64);
  if (!expectedSignature) {
    return null;
  }

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