export const TMDB_IMG = "https://image.tmdb.org/t/p";

export function posterUrl(
  path: string | null,
  size: "w92" | "w185" | "w342" | "w500" | "original" = "w342",
) {
  return path ? `${TMDB_IMG}/${size}${path}` : null;
}
