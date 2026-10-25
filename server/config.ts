import "dotenv/config";
import { z } from "zod";

const integer = (fallback: number, min = 1, max = 1_000_000_000) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = z
    .object({
      NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
      HOST: z.string().default("127.0.0.1"),
      PORT: integer(4000, 1, 65535),
      APP_ORIGINS: z.string().optional(),
      MONGODB_URI: z.string().optional(),
      MONGODB_DB: z.string().default("binge_verse"),
      REDIS_URL: z.string().optional(),
      TRUST_PROXY: z.string().default(""),
      TMDB_API_KEY: z.string().optional(),
      TMDB_API_ORIGIN: z.url().default("https://api.themoviedb.org"),
      OMDB_API_KEY: z.string().optional(),
      TMDB_LANGUAGE: z.string().default("de-DE"),
      DEMO_ENABLED: z
        .enum(["true", "false"])
        .default(env.NODE_ENV === "production" ? "false" : "true")
        .transform((value) => value === "true"),
      REGISTRATION_ENABLED: z
        .enum(["true", "false"])
        .default("true")
        .transform((value) => value === "true"),
      SERVE_WEB: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
      RUN_MIGRATIONS: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
      DEMO_TTL_SECONDS: integer(86400, 300, 86400),
      DEMO_RATE_LIMIT: integer(5, 1, 100),
      DEMO_DAILY_LIMIT: integer(200, 1, 10000),
      SESSION_TTL_SECONDS: integer(604800, 300, 2592000),
      DEV_COOKIE_NAME: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,80}$/)
        .default("bingeverse_session"),
      API_RATE_LIMIT: integer(300),
      API_RATE_WINDOW_MS: integer(60000, 1000),
      AUTH_RATE_LIMIT: integer(15),
      RATE_LIMIT_WINDOW_MS: integer(900000),
      UPSTREAM_TIMEOUT_MS: integer(8000, 100, 60000),
      UPSTREAM_CONCURRENCY: integer(8, 1, 100),
      UPSTREAM_QUEUE_LIMIT: integer(100, 1, 10000),
      METADATA_CACHE_MAX: integer(2000, 1, 100000),
      METADATA_CACHE_MAX_BYTES: integer(33554432, 1024, 536870912),
      METADATA_CACHE_TTL_MS: integer(300000, 1000, 86400000),
      GRAPHQL_MAX_TOKENS: integer(10000),
      GRAPHQL_MAX_DEPTH: integer(12, 1, 30),
      GRAPHQL_MAX_ALIASES: integer(15, 1, 100),
      GRAPHQL_MAX_COST: integer(15000),
      GRAPHQL_MAX_ROOT_FIELDS: integer(10, 1, 100),
      GRAPHQL_MAX_ARRAY_ITEMS: integer(200, 1, 1000),
      GRAPHQL_MAX_QUERY_LENGTH: integer(32768, 1000, 100000),
      DATABASE_MAX_TIME_MS: integer(5000, 100, 60000),
      DATABASE_POOL_SIZE: integer(20, 1, 100),
    })
    .safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  const config = {
    ...parsed.data,
    APP_ORIGINS: parsed.data.APP_ORIGINS ?? env.RENDER_EXTERNAL_URL,
  };
  const isProduction = config.NODE_ENV === "production";
  if (
    config.TMDB_API_ORIGIN !== "https://api.themoviedb.org" &&
    !(config.NODE_ENV === "test" && /^http:\/\/127\.0\.0\.1:\d+$/.test(config.TMDB_API_ORIGIN))
  )
    throw new Error("Custom metadata origins are allowed only for loopback test fixtures.");
  if (
    isProduction &&
    (!config.APP_ORIGINS || !config.MONGODB_URI || !config.REDIS_URL || !config.TMDB_API_KEY)
  ) {
    throw new Error("Production requires APP_ORIGINS, MONGODB_URI, REDIS_URL and TMDB_API_KEY.");
  }
  const origins = (config.APP_ORIGINS ?? "http://localhost:8080,http://127.0.0.1:8080")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !origins.length ||
    origins.some((value) => {
      try {
        const url = new URL(value);
        return (
          value !== url.origin ||
          !["http:", "https:"].includes(url.protocol) ||
          (isProduction && url.protocol !== "https:")
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error("APP_ORIGINS must contain exact origins; production requires HTTPS.");
  return Object.freeze({ ...config, isProduction, origins });
}

export const config = loadConfig();
