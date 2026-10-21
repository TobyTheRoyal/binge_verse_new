import type { QueryClient } from "@tanstack/react-query";

const VIEWING_QUERY_ROOTS = [
  "ratings",
  "watchlist",
  "watch-progress",
  "watch-progress-list",
  "continue-watching",
  "season-details",
  "details",
  "taste-dna",
  "home-taste-dna",
  "home",
  "browse",
  "release-events",
  "home-release-events",
  "release-events-title",
];

export function invalidateViewingData(client: QueryClient) {
  return client.invalidateQueries({
    predicate: (query) => VIEWING_QUERY_ROOTS.includes(String(query.queryKey[0])),
  });
}
