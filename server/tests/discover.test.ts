import test from "node:test";
import assert from "node:assert/strict";
import { discoverParameters } from "../services/discover.js";
import { validateSavedMedia } from "../validation.js";

test("series discover maps date sorting, Romance keywords and Austrian subscriptions", () => {
  const params = discoverParameters({
    media: "tv",
    page: 3,
    sort: "primary_release_date.desc",
    genre: "keyword:9840",
    language: "de",
    provider: "8",
    year: "2026",
  });
  assert.equal(params.sort_by, "first_air_date.desc");
  assert.equal(params.with_keywords, "9840");
  assert.equal(params.with_genres, undefined);
  assert.equal(params.watch_region, "AT");
  assert.equal(params.with_original_language, "de");
  assert.equal(params.first_air_date_year, "2026");
  assert.equal(params.page, 3);
});

test("saved title validation prevents malformed metadata and strips excess properties", () => {
  const input = {
    userId: "owner",
    tmdbId: 603,
    mediaType: "movie",
    title: "The Matrix",
    releaseDate: "1999-03-30",
    role: "ADMIN",
  };
  assert.equal("role" in validateSavedMedia(input), false);
  assert.throws(() => validateSavedMedia({ ...input, tmdbId: -1 }));
  assert.throws(() => validateSavedMedia({ ...input, releaseDate: "2026-02-31" }));
  assert.throws(() =>
    validateSavedMedia({ ...input, posterPath: "https://untrusted.example/tracker" }),
  );
});
