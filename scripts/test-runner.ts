import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";

export async function runTests(testDatabaseUri = process.env.TEST_MONGODB_URI) {
  const files = (await readdir("server/tests"))
    .filter((file) => file.endsWith(".test.ts"))
    .map((file) => `server/tests/${file}`);
  const child = spawn(process.execPath, ["--import", "tsx", "--test", ...files], {
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: new URL("../server/tests/fixtures/test.env", import.meta.url).pathname,
      NODE_ENV: "test",
      DEMO_ENABLED: "true",
      REGISTRATION_ENABLED: "true",
      SERVE_WEB: "false",
      RUN_MIGRATIONS: "false",
      APP_ORIGINS: "http://localhost:8080,http://127.0.0.1:8080",
      MONGODB_URI: "",
      REDIS_URL: "",
      TMDB_API_KEY: "test-only",
      TMDB_API_ORIGIN: "https://api.themoviedb.org",
      OMDB_API_KEY: "",
      TEST_MONGODB_URI: testDatabaseUri,
    },
    stdio: "inherit",
  });
  return new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
