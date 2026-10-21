import { randomUUID, createHash } from "node:crypto";
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

export async function createApplication(schema: GraphQLSchema) {
  const app = express();
  app.disable("x-powered-by");
  if (config.TRUST_PROXY)
    app.set(
      "trust proxy",
      config.TRUST_PROXY.split(",").map((value) => value.trim()),
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
      contentSecurityPolicy: config.isProduction ? undefined : false,
      strictTransportSecurity: config.isProduction
        ? { maxAge: 31536000, includeSubDomains: false }
        : false,
    }),
  );
  app.use((request, response, next) => {
    const origin = request.headers.origin;
    if (
      (origin && !config.origins.includes(origin)) ||
      request.headers["sec-fetch-site"] === "cross-site"
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
    response.json({ user: user ? getUserProfile(user) : null });
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
