import { randomUUID } from "node:crypto";

export function createDemoId(expiresAt: Date) {
  return `demo:${expiresAt.getTime()}:${randomUUID()}`;
}

export function demoExpiry(userId: string) {
  const match = /^demo:(\d{13}):[a-f0-9-]{36}$/.exec(userId);
  return match ? new Date(Number(match[1])) : null;
}

export function demoRecordFields(userId: string) {
  const expiresAt = demoExpiry(userId);
  return expiresAt ? { demoExpiresAt: expiresAt } : {};
}

export function demoProfile(id: string) {
  const expiresAt = demoExpiry(id);
  if (!expiresAt || expiresAt.getTime() <= Date.now()) return null;
  return {
    id,
    name: "Demo-Gast",
    email: "demo@binge.invalid",
    role: "USER" as const,
    isAdmin: false,
    isDemo: true,
  };
}
