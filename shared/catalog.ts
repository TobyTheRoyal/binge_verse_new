export const MEDIA_TYPES = ["movie", "tv"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
export const WATCH_STATUSES = [
  "PLAN_TO_WATCH",
  "WATCHING",
  "COMPLETED",
  "ON_HOLD",
  "DROPPED",
] as const;
export type WatchStatus = (typeof WATCH_STATUSES)[number];
export const USER_ROLES = ["USER", "EDITOR", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const RELEASE_TYPES = [
  "CINEMA_RELEASE",
  "MOVIE_PREMIERE",
  "MOVIE_CATALOG",
  "TV_SERIES_PREMIERE",
  "TV_SEASON",
  "TV_EPISODE",
  "TV_CATALOG",
] as const;
export type ReleaseType = (typeof RELEASE_TYPES)[number];
export const PUBLICATION_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];
export const CONFIRMATION_STATUSES = [
  "ANNOUNCED",
  "CONFIRMED",
  "UNCONFIRMED",
  "POSTPONED",
  "CANCELLED",
] as const;
export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number];
export const DATE_PRECISIONS = ["EXACT", "MONTH", "QUARTER", "YEAR", "UNKNOWN"] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];
export const WATCH_REGION = "AT";
export const STREAMING_PROVIDERS = [
  { id: "8", name: "Netflix" },
  { id: "337", name: "Disney+" },
  { id: "350", name: "Apple TV+" },
  { id: "29|30", name: "Sky", browseName: "Sky / WOW" },
  { id: "1899", name: "HBO Max" },
  { id: "2750", name: "RTL+" },
  { id: "531", name: "Paramount+" },
  { id: "9", name: "Prime Video" },
] as const;
export const CALENDAR_PROVIDERS = [...STREAMING_PROVIDERS.map((provider) => provider.name), "Kino"];
export const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  CINEMA_RELEASE: "Kinostart",
  MOVIE_PREMIERE: "Filmpremiere",
  MOVIE_CATALOG: "Film im Katalog",
  TV_SERIES_PREMIERE: "Serienpremiere",
  TV_SEASON: "Neue Staffel",
  TV_EPISODE: "Neue Episode",
  TV_CATALOG: "Serie im Katalog",
};
