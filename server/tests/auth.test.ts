import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import type { Response } from "express";
import { Session, User } from "../db/models.js";
import { createDemoId } from "../demo/identity.js";
import {
  AUTH_COOKIE_NAME,
  authorizeUser,
  clearAuthCookie,
  getAuthUserFromRequest,
  requireAdmin,
  sessionToken,
  setAuthCookie,
} from "../auth.js";

const descriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
Object.defineProperty(mongoose.connection, "readyState", { configurable: true, get: () => 1 });
after(() => {
  mock.restoreAll();
  if (descriptor) Object.defineProperty(mongoose.connection, "readyState", descriptor);
  else Reflect.deleteProperty(mongoose.connection, "readyState");
});
const sessions = new Map<string, { userId: string; tokenHash: string; expiresAt: Date }>();
const account = { _id: "test-user", name: "Test", email: "test@example.com", role: "USER" };
mock.method(
  Session,
  "create",
  async (session: { userId: string; tokenHash: string; expiresAt: Date }) => {
    sessions.set(session.tokenHash, session);
    return session;
  },
);
mock.method(Session, "deleteOne", async ({ tokenHash }: { tokenHash: string }) => {
  sessions.delete(tokenHash);
});
mock.method(Session, "findOne", ({ tokenHash }: { tokenHash: string }) => ({
  select: () => ({
    lean: async () => {
      const session = sessions.get(tokenHash);
      return session && session.expiresAt > new Date() ? session : null;
    },
  }),
}));
mock.method(User, "findById", () => ({ select: () => ({ lean: async () => account }) }));

test("sessions persist only token hashes; logout revokes captured cookies", async () => {
  let cookie = "";
  const response = {
    append: (_name: string, value: string) => {
      cookie = value;
    },
  } as unknown as Response;
  await setAuthCookie(response, { id: "test-user" });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const token = sessionToken({ headers: { cookie } });
  assert.ok(token);
  assert.equal(sessions.has(token), false);
  assert.equal(sessions.has(createHash("sha256").update(token).digest("hex")), true);
  const request = { headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` } };
  assert.equal((await getAuthUserFromRequest(request))?.id, "test-user");
  await clearAuthCookie(response, request);
  assert.equal(await getAuthUserFromRequest(request), null);
  assert.match(cookie, /Max-Age=0/);
});

test("invalid and old JWT cookies never authenticate", async () => {
  const headers = { cookie: `${AUTH_COOKIE_NAME}=invalid`, get: "not-a-method" };
  assert.equal(sessionToken({ headers }), null);
  assert.equal(sessionToken({ headers: { cookie: `${AUTH_COOKIE_NAME}=%E0%A4%A` } }), null);
  assert.equal(
    await getAuthUserFromRequest({
      headers: { cookie: `${AUTH_COOKIE_NAME}=eyJhbGci.unsafe.signature` },
    }),
    null,
  );
});

test("login rotates the previous session; expiry and role changes are checked server-side", async () => {
  let cookie = "";
  const response = {
    append: (_name: string, value: string) => {
      cookie = value;
    },
  } as unknown as Response;
  await setAuthCookie(response, { id: "test-user" });
  const oldRequest = { headers: { cookie } };
  await setAuthCookie(response, { id: "test-user" }, oldRequest);
  assert.equal(await getAuthUserFromRequest(oldRequest), null);
  const currentRequest = { headers: { cookie } };
  account.role = "ADMIN";
  assert.equal((await getAuthUserFromRequest(currentRequest))?.role, "ADMIN");
  account.role = "USER";
  assert.equal((await getAuthUserFromRequest(currentRequest))?.role, "USER");
  const token = sessionToken(currentRequest)!;
  sessions.get(createHash("sha256").update(token).digest("hex"))!.expiresAt = new Date(0);
  assert.equal(await getAuthUserFromRequest(currentRequest), null);
});

test("ownership and admin checks reject anonymous and different users", () => {
  const user = {
    id: "owner",
    name: "Test",
    email: "test@example.com",
    role: "USER" as const,
    isAdmin: false,
  };
  assert.throws(() => authorizeUser({}, "owner"));
  assert.equal(authorizeUser({ user }, "owner"), "owner");
  assert.throws(() => authorizeUser({ user }, "another-user"));
  assert.throws(() => requireAdmin({ user }));
  assert.equal(requireAdmin({ user: { ...user, role: "ADMIN" } }).id, "owner");
});

test("demo authentication uses a revocable stored session bounded by the visitor expiry", async () => {
  let cookie = "";
  const response = {
    append: (_name: string, value: string) => {
      cookie = value;
    },
  } as unknown as Response;
  const expiresAt = new Date(Date.now() + 60000);
  await setAuthCookie(response, { id: createDemoId(expiresAt) });
  const request = { headers: { cookie } };
  const user = await getAuthUserFromRequest(request);
  assert.equal(user?.isDemo, true);
  assert.equal(user?.role, "USER");
  assert.equal(user?.isAdmin, false);
  assert.equal(
    sessions
      .get(createHash("sha256").update(sessionToken(request)!).digest("hex"))
      ?.expiresAt.getTime(),
    expiresAt.getTime(),
  );
  await clearAuthCookie(response, request);
  assert.equal(await getAuthUserFromRequest(request), null);
});
