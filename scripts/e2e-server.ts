import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { metadataFixture } from "../tests/fixtures/tmdb.js";
import { adminAccount, e2eOrigin, e2ePort } from "../tests/e2e/environment.js";

const metadata = createServer(metadataFixture);
metadata.listen(0, "127.0.0.1");
await once(metadata, "listening");
const metadataPort = (metadata.address() as AddressInfo).port;
const database = await MongoMemoryServer.create();
const client = new mongoose.mongo.MongoClient(database.getUri());
await client.connect();
const admin = await client
  .db("binge_e2e")
  .collection("users")
  .insertOne({
    name: "Test Admin",
    email: adminAccount.email,
    passwordHash: await bcrypt.hash(adminAccount.password, 4),
    role: "ADMIN",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
await client
  .db("binge_e2e")
  .collection("releaseevents")
  .insertMany(
    [
      { tmdbId: 693134, title: "Dune: Part Two", publicationStatus: "PUBLISHED" },
      { tmdbId: 872585, title: "Unveroeffentlichter Entwurf", publicationStatus: "DRAFT" },
    ].map((item) => ({
      ...item,
      mediaType: "movie",
      posterPath: "/calendar.svg",
      provider: "Paramount+",
      region: "AT",
      releaseDate: "2026-10-15",
      releaseYear: 2026,
      releaseMonth: 10,
      datePrecision: "EXACT",
      releaseType: "MOVIE_PREMIERE",
      confirmationStatus: "CONFIRMED",
      createdBy: admin.insertedId.toString(),
      updatedBy: admin.insertedId.toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
await client.close();

const child = spawn(process.execPath, ["dist-server/server/server.js"], {
  // Forward shutdown once instead of also signaling the child's process group.
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    DOTENV_CONFIG_PATH: fileURLToPath(
      new URL("../server/tests/fixtures/test.env", import.meta.url),
    ),
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: String(e2ePort),
    APP_ORIGINS: e2eOrigin,
    MONGODB_URI: database.getUri(),
    MONGODB_DB: "binge_e2e",
    REDIS_URL: "",
    TMDB_API_KEY: "test-only",
    TMDB_API_ORIGIN: `http://127.0.0.1:${metadataPort}`,
    OMDB_API_KEY: "",
    DEMO_ENABLED: "true",
    REGISTRATION_ENABLED: "true",
    RUN_MIGRATIONS: "true",
    SERVE_WEB: "true",
    DEV_COOKIE_NAME: "binge_e2e_session",
    DEMO_RATE_LIMIT: "100",
    DEMO_DAILY_LIMIT: "10000",
    API_RATE_LIMIT: "100000",
    AUTH_RATE_LIMIT: "10000",
    DATABASE_MAX_TIME_MS: "15000",
    RATE_LIMIT_WINDOW_MS: "1000",
  },
  stdio: "inherit",
});
process.once("SIGINT", () => child.kill("SIGINT"));
process.once("SIGTERM", () => child.kill("SIGTERM"));
try {
  console.log(`Disposable E2E application: ${e2eOrigin}`);
  process.exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 0));
  });
} finally {
  metadata.close();
  await database.stop();
}
