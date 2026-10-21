import { LRUCache } from "lru-cache";
import { config } from "../config.js";
import { PublicError } from "../errors.js";

type Params = Record<string, string | number | boolean | undefined>;

export class MetadataClient {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  private readonly cache: LRUCache<string, object>;

  constructor(
    private readonly settings: {
      max: number;
      maxBytes?: number;
      ttl: number;
      concurrency: number;
      queueLimit: number;
      timeout: number;
    },
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.cache = new LRUCache({
      max: settings.max,
      ttl: settings.ttl,
      maxSize: settings.maxBytes ?? 33554432,
      sizeCalculation: (value) => Buffer.byteLength(JSON.stringify(value), "utf8"),
      fetchMethod: async (url) => this.fetchJson(url),
    });
  }

  private async fetchJson(url: string) {
    if (this.active >= this.settings.concurrency) {
      if (this.waiting.length >= this.settings.queueLimit)
        throw new PublicError(
          "Zu viele Anfragen. Bitte versuche es gleich erneut.",
          503,
          "SERVICE_UNAVAILABLE",
        );
      await new Promise<void>((resolve, reject) => {
        const release = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          const index = this.waiting.indexOf(release);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(
            new PublicError(
              "Metadatendienst ausgelastet. Bitte versuche es erneut.",
              503,
              "SERVICE_UNAVAILABLE",
            ),
          );
        }, this.settings.timeout);
        this.waiting.push(release);
      });
    } else {
      this.active += 1;
    }
    try {
      const response = await this.fetcher(url, {
        signal: AbortSignal.timeout(this.settings.timeout),
      });
      if (!response.ok)
        throw new PublicError("Metadaten konnten nicht geladen werden.", 502, "UPSTREAM_ERROR");
      return (await response.json()) as object;
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active -= 1;
    }
  }

  async get<T>(url: URL): Promise<T> {
    try {
      const result = await this.cache.fetch(url.href);
      if (!result) throw new Error("Empty upstream response.");
      return result as T;
    } catch (error) {
      if (error instanceof PublicError) throw error;
      throw new PublicError(
        "Metadatendienst vorübergehend nicht verfügbar.",
        502,
        "UPSTREAM_ERROR",
      );
    }
  }
}

const client = new MetadataClient({
  max: config.METADATA_CACHE_MAX,
  maxBytes: config.METADATA_CACHE_MAX_BYTES,
  ttl: config.METADATA_CACHE_TTL_MS,
  concurrency: config.UPSTREAM_CONCURRENCY,
  queueLimit: config.UPSTREAM_QUEUE_LIMIT,
  timeout: config.UPSTREAM_TIMEOUT_MS,
});

export async function tmdb<T>(path: string, params: Params = {}) {
  if (!config.TMDB_API_KEY)
    throw new PublicError("Metadatendienst nicht konfiguriert.", 503, "SERVICE_UNAVAILABLE");
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", config.TMDB_API_KEY);
  url.searchParams.set("language", config.TMDB_LANGUAGE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return client.get<T>(url);
}

export async function getOmdbRatings(imdbId?: string | null) {
  const empty = { imdbRating: null, rottenTomatoesRating: null };
  if (!imdbId || !/^tt\d+$/.test(imdbId) || !config.OMDB_API_KEY) return empty;
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("i", imdbId);
  url.searchParams.set("apikey", config.OMDB_API_KEY);
  try {
    const data = await client.get<{
      imdbRating?: string;
      Ratings?: Array<{ Source: string; Value: string }>;
    }>(url);
    return {
      imdbRating: data.imdbRating && data.imdbRating !== "N/A" ? data.imdbRating : null,
      rottenTomatoesRating:
        data.Ratings?.find((rating) => rating.Source === "Rotten Tomatoes")?.Value ?? null,
    };
  } catch {
    return empty;
  }
}
