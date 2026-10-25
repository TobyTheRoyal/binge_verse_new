const port = Number(process.env.E2E_PORT ?? 4199);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid E2E_PORT.");

// There is deliberately no remote baseURL override: these tests mutate disposable local data.
export const e2eOrigin = `http://127.0.0.1:${port}`;
export const e2ePort = port;
export const testDate = "2026-10-15T12:00:00.000Z";
export const adminAccount = { email: "admin@binge.test", password: "test-only-admin-password" };
