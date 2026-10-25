import "dotenv/config";
import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server-core";

const database = await MongoMemoryServer.create();
const port = process.env.DEMO_PREVIEW_PORT ?? "4100";
const child = spawn(process.execPath, ["--import", "tsx", "server/server.ts"], {
  env: {
    ...process.env,
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: port,
    APP_ORIGINS: `http://127.0.0.1:${port}`,
    MONGODB_URI: database.getUri(),
    MONGODB_DB: "binge_demo_preview",
    REDIS_URL: "",
    DEMO_ENABLED: "true",
    DEV_COOKIE_NAME: "binge_portfolio_preview",
    REGISTRATION_ENABLED: "false",
    SERVE_WEB: "true",
    RUN_MIGRATIONS: "true",
  },
  stdio: "inherit",
});
process.once("SIGINT", () => child.kill("SIGINT"));
process.once("SIGTERM", () => child.kill("SIGTERM"));
try {
  console.log(`Isolated demo preview: http://127.0.0.1:${port}/demo`);
  process.exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 0));
  });
} finally {
  await database.stop();
}
