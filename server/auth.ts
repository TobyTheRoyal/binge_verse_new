import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { parseCookie, stringifySetCookie } from "cookie";
import type { Response } from "express";
import mongoose from "mongoose";
import { Session, User } from "./db/models.js";
import { config } from "./config.js";
import { PublicError } from "./errors.js";
import { loginSchema, registrationSchema } from "../shared/auth.js";
import { USER_ROLES, type UserRole } from "../shared/catalog.js";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isAdmin: boolean;
};
export type AuthContext = { user?: AuthUser | null; response?: Response; request?: Request };
type CookieRequest = Request | { headers: { cookie?: string } };
export const AUTH_COOKIE_NAME = config.isProduction
  ? "__Host-bingeverse_session"
  : "bingeverse_session";
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
// Fixed-cost password comparison also runs for an unknown email address.
const dummyHash = bcrypt.hashSync(randomBytes(32).toString("hex"), 12);

export function sessionToken(request?: CookieRequest | null) {
  const headers = request?.headers;
  const cookie = headers && "get" in headers ? headers.get("cookie") : headers?.cookie;
  const token = parseCookie(cookie ?? "")[AUTH_COOKIE_NAME];
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function getUserProfile(user: AuthUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isAdmin: user.role === "ADMIN" || user.role === "EDITOR",
  };
}

export async function getAuthUserFromRequest(
  request?: CookieRequest | null,
): Promise<AuthUser | null> {
  const token = sessionToken(request);
  if (!token || mongoose.connection.readyState !== 1) return null;
  const session = await Session.findOne({
    tokenHash: tokenHash(token),
    expiresAt: { $gt: new Date() },
  })
    .select("userId")
    .lean();
  if (!session) return null;
  const user = await User.findById(session.userId).select("name email role").lean();
  if (!user) return null;
  const role = USER_ROLES.includes(user.role) ? user.role : "USER";
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role,
    isAdmin: role === "ADMIN" || role === "EDITOR",
  };
}

const cookieOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.isProduction,
};

export async function setAuthCookie(
  response: Response | undefined | null,
  user: { id: string },
  request?: CookieRequest | null,
) {
  if (!response) throw new Error("Session response unavailable.");
  const previous = sessionToken(request);
  if (previous) await Session.deleteOne({ tokenHash: tokenHash(previous) });
  const token = randomBytes(32).toString("base64url");
  await Session.create({
    userId: user.id,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + config.SESSION_TTL_SECONDS * 1000),
  });
  response.append(
    "Set-Cookie",
    stringifySetCookie(AUTH_COOKIE_NAME, token, {
      ...cookieOptions,
      maxAge: config.SESSION_TTL_SECONDS,
    }),
  );
}

export async function clearAuthCookie(
  response: Response | undefined | null,
  request?: CookieRequest | null,
) {
  const token = sessionToken(request);
  if (token) await Session.deleteOne({ tokenHash: tokenHash(token) });
  response?.append(
    "Set-Cookie",
    stringifySetCookie(AUTH_COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 }),
  );
}

export function requireAuth(context: AuthContext) {
  if (!context.user) throw new PublicError("Bitte melde dich an.", 401, "UNAUTHENTICATED");
  return context.user;
}

export function authorizeUser(context: AuthContext, userId?: string | null) {
  const user = requireAuth(context);
  if (userId && user.id !== userId)
    throw new PublicError("Zugriff nicht erlaubt.", 403, "FORBIDDEN");
  return user.id;
}

export function requireAdmin(context: AuthContext) {
  const user = requireAuth(context);
  if (user.role !== "ADMIN" && user.role !== "EDITOR")
    throw new PublicError("Zugriff nicht erlaubt.", 403, "FORBIDDEN");
  return user;
}

function assertDb() {
  if (mongoose.connection.readyState !== 1)
    throw new PublicError("Dienst vorübergehend nicht verfügbar.", 503, "SERVICE_UNAVAILABLE");
}

export async function registerUser(input: unknown) {
  assertDb();
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success)
    throw new PublicError(
      "Bitte verwende einen Namen, eine gültige E-Mail und ein Passwort mit mindestens 15 Zeichen (maximal 72 UTF-8-Bytes).",
    );
  const { name, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const user = await User.create({ name, email, passwordHash, role: "USER" });
    return getUserProfile({ id: String(user._id), name, email, role: "USER", isAdmin: false });
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      throw new PublicError(
        "Registrierung nicht möglich. Verwende die Anmeldung oder eine andere E-Mail-Adresse.",
        409,
      );
    }
    throw error;
  }
}

export async function loginUser(input: unknown) {
  assertDb();
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success)
    throw new PublicError("E-Mail oder Passwort ist ungültig.", 401, "UNAUTHENTICATED");
  const user = await User.findOne({ email: parsed.data.email })
    .select("name email role passwordHash")
    .lean();
  const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? dummyHash);
  if (!user || !valid)
    throw new PublicError("E-Mail oder Passwort ist ungültig.", 401, "UNAUTHENTICATED");
  const role = USER_ROLES.includes(user.role) ? user.role : "USER";
  return getUserProfile({
    id: String(user._id),
    name: user.name,
    email: user.email,
    role,
    isAdmin: role === "ADMIN",
  });
}
