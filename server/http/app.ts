import { randomUUID, createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { createClient } from "redis";
import mongoose from "mongoose";
import { createYoga } from "graphql-yoga";
import type { GraphQLSchema } from "graphql";
import { config } from "../config.js";
import { PublicError, errorStatus } from "../errors.js";
import {
  clearAuthCookie,
  getAuthUserFromRequest,
  getUserProfile,
  loginUser,
  registerUser,
  setAuthCookie,
} from "../auth.js";
import { graphqlProtectionPlugins, inspectGraphqlRequest } from "../graphql/limits.js";
import { startDemo } from "../demo/service.js";

export async function createApplication(
  schema: GraphQLSchema,
  options: { serveWeb?: boolean; webDirectory?: string } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  if (config.TRUST_PROXY)
    app.set(
      "trust proxy",
      config.TRUST_PROXY === "1" ? 1 : config.TRUST_PROXY.split(",").map((value) => value.trim()),
    );
  const redis = config.REDIS_URL
    ? createClient({
        url: config.REDIS_URL,
        socket: { connectTimeout: 5000, reconnectStrategy: false },
      })
    : null;
  redis?.on("error", () => console.error("Rate-limit storage unavailable."));
  await redis?.connect();
  const store = (prefix: string) =>
    redis
      ? new RedisStore({
          prefix: `binge:${prefix}:`,
          sendCommand: (...args: string[]) => redis.sendCommand(args),
        })
      : undefined;
  const limit = (prefix: string, max: number, extra = {}) =>
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      limit: max,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      store: store(prefix),
      passOnStoreError: false,
      message: { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
      ...extra,
    });
  const apiLimiter = limit("api", config.API_RATE_LIMIT, { windowMs: config.API_RATE_WINDOW_MS });
  const authLimiter = limit("auth-ip", config.AUTH_RATE_LIMIT);
  const demoLimiter = limit("demo-ip", config.DEMO_RATE_LIMIT);
  const demoDailyLimiter = limit("demo-daily", config.DEMO_DAILY_LIMIT, {
    windowMs: 86400000,
    keyGenerator: () => "all",
  });
  const accountLimiter = limit("auth-account", config.AUTH_RATE_LIMIT * 2, {
    keyGenerator: (request: express.Request, response: express.Response) => {
      const value = String(response.locals.authEmail ?? request.body?.email ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 254);
      return value
        ? createHash("sha256").update(value).digest("hex")
        : ipKeyGenerator(request.ip ?? "unknown");
    },
  });

  app.use((request, response, next) => {
    response.locals.requestId = randomUUID();
    response.setHeader("X-Request-ID", response.locals.requestId);
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              fontSrc: ["'self'", "https://fonts.gstatic.com"],
              imgSrc: ["'self'", "data:", "https://image.tmdb.org"],
              connectSrc: ["'self'"],
              frameSrc: ["https://www.youtube-nocookie.com", "https://www.youtube.com"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      strictTransportSecurity: config.isProduction
        ? { maxAge: 31536000, includeSubDomains: false }
        : false,
    }),
  );
  app.use((request, response, next) => {
    const origin = request.headers.origin;
    const apiRequest = /^\/(api|graphql)(\/|$)/.test(request.path);
    if (
      apiRequest &&
      ((origin && !config.origins.includes(origin)) ||
        request.headers["sec-fetch-site"] === "cross-site")
    ) {
      response.status(403).json({ error: "Anfrage von dieser Herkunft ist nicht erlaubt." });
      return;
    }
    next();
  });
  app.use(
    cors({
      origin: config.origins,
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token"],
    }),
  );
  app.use(["/api", "/graphql"], apiLimiter);
  app.use((request, response, next) => {
    if (request.method === "POST" && !request.is("application/json")) {
      response.status(415).json({ error: "Content-Type application/json erforderlich." });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "256kb", strict: true }));
  app.get("/health", (_request, response) => response.json({ ok: true }));
  app.get("/ready", (_request, response) => {
    const ready = mongoose.connection.readyState === 1 && (!redis || redis.isReady);
    response.status(ready ? 200 : 503).json({ ready });
  });
  app.get("/api/me", async (request, response) => {
    const user = await getAuthUserFromRequest(request);
    response.json({
      user: user ? getUserProfile(user) : null,
      demoEnabled: config.DEMO_ENABLED,
      registrationEnabled: config.REGISTRATION_ENABLED,
    });
  });
  app.post("/api/demo", demoLimiter, demoDailyLimiter, async (request, response) => {
    const existing = await getAuthUserFromRequest(request);
    if (existing && !existing.isDemo)
      throw new PublicError("Bitte melde dich zuerst von deinem Konto ab.", 409);
    const user = existing ?? (await startDemo());
    if (!existing) await setAuthCookie(response, user, request);
    response.json({ user });
  });
  app.post("/api/register", authLimiter, accountLimiter, async (request, response) => {
    const user = await registerUser(request.body);
    await setAuthCookie(response, user, request);
    response.status(201).json({ user });
  });
  app.post("/api/login", authLimiter, accountLimiter, async (request, response) => {
    const user = await loginUser(request.body);
    await setAuthCookie(response, user, request);
    response.json({ user });
  });
  app.post("/api/logout", async (request, response) => {
    await clearAuthCookie(response, request);
    response.json({ ok: true });
  });
  app.use("/graphql", (request, response, next) => {
    if (request.method === "GET" && !config.isProduction && !request.query.query) return next();
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      response.status(405).json({ error: "GraphQL erfordert POST." });
      return;
    }
    try {
      const inspection = inspectGraphqlRequest(request.body);
      if (inspection.authentication) {
        response.locals.authEmail = inspection.authEmail;
        authLimiter(request, response, (error?: unknown) => {
          if (error) return next(error);
          accountLimiter(request, response, next);
        });
      } else next();
    } catch (error) {
      next(error);
    }
  });
  const yoga = createYoga<{ req: express.Request; res: express.Response }>({
    schema,
    graphqlEndpoint: "/graphql",
    cors: false,
    graphiql: !config.isProduction,
    landingPage: false,
    multipart: false,
    batching: false,
    maxRequestBodySize: 256 * 1024,
    maskedErrors: true,
    plugins: graphqlProtectionPlugins(),
    context: async ({ request, res }) => ({
      request,
      response: res,
      user: await getAuthUserFromRequest(request),
    }),
  });
  app.use("/graphql", yoga as RequestHandler);
  app.use(["/api", "/graphql"], (_request, response) =>
    response.status(404).json({ error: "Endpunkt nicht gefunden." }),
  );
  if (options.serveWeb ?? config.SERVE_WEB) {
    const directory = options.webDirectory ?? resolve("dist");
    const index = resolve(directory, "index.html");
    await access(index);
    app.use(
      express.static(directory, {
        index: false,
        setHeaders: (response, path) => {
          response.setHeader(
            "Cache-Control",
            path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
          );
        },
      }),
    );
    app.use("/assets", (_request, response) =>
      response.status(404).json({ error: "Datei nicht gefunden." }),
    );
    app.get("/{*path}", (_request, response) => {
      response.setHeader("Cache-Control", "no-cache");
      response.sendFile(index);
    });
  }
  const handleError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (response.headersSent) return;
    const malformed = error instanceof SyntaxError;
    const tooLarge =
      error && typeof error === "object" && "type" in error && error.type === "entity.too.large";
    const status = tooLarge ? 413 : malformed ? 400 : errorStatus(error);
    if (status >= 500)
      console.error("Request failed", {
        requestId: response.locals.requestId,
        type: error instanceof Error ? error.name : "Unknown",
      });
    response.status(status).json({
      error:
        error instanceof PublicError
          ? error.message
          : tooLarge
            ? "Anfrage ist zu groß."
            : malformed
              ? "Ungültige JSON-Anfrage."
              : "Dienst vorübergehend nicht verfügbar.",
      requestId: response.locals.requestId,
    });
  };
  app.use(handleError);
  return {
    app,
    close: async () => {
      await redis?.quit();
    },
  };
}
