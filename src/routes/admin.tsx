import {
  CALENDAR_PROVIDERS as PROVIDERS,
  WATCH_REGION,
  RELEASE_TYPES,
  CONFIRMATION_STATUSES,
  PUBLICATION_STATUSES,
  DATE_PRECISIONS,
  RELEASE_TYPE_LABELS as releaseTypeLabel,
} from "../../shared/catalog";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Copy, Lock, Plus, Search, Trash2, UploadCloud } from "lucide-react";
import { posterUrl } from "@/lib/media-assets";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@/lib/navigation";
import { searchSuggestions, type MediaItem } from "@/lib/tmdb.functions";
import {
  bulkCreateReleaseEvents,
  bulkDeleteReleaseEvents,
  bulkUpdateReleaseEvents,
  createReleaseEvent,
  deleteReleaseEvent,
  getAdminReleaseEvents,
  getAdminReleaseStats,
  releaseInputFromMedia,
  updateReleaseEvent,
  type ConfirmationStatus,
  type DatePrecision,
  type PublicationStatus,
  type ReleaseEvent,
  type ReleaseInput,
  type ReleaseType,
} from "@/lib/release-calendar";

const REGIONS = [WATCH_REGION];

function emptyDraft() {
  return {
    provider: "Netflix",
    region: WATCH_REGION,
    releaseDate: new Date().toISOString().slice(0, 10),
    datePrecision: "EXACT" as DatePrecision,
    releaseYear: new Date().getFullYear(),
    releaseMonth: new Date().getMonth() + 1,
    releaseQuarter: Math.ceil((new Date().getMonth() + 1) / 3),
    releaseType: "MOVIE_CATALOG" as ReleaseType,
    publicationStatus: "DRAFT" as PublicationStatus,
    confirmationStatus: "ANNOUNCED" as ConfirmationStatus,
    sourceUrl: "",
    notes: "",
    seasonNumber: undefined as number | undefined,
    episodeNumber: undefined as number | undefined,
  };
}

function toInput(
  media: MediaItem,
  draft: ReturnType<typeof emptyDraft>,
  publicationStatus = draft.publicationStatus,
): ReleaseInput {
  return releaseInputFromMedia(media, {
    provider: draft.provider,
    region: draft.region,
    releaseDate: draft.datePrecision === "EXACT" ? draft.releaseDate : null,
    datePrecision: draft.datePrecision,
    releaseYear: draft.releaseYear,
    releaseMonth: draft.releaseMonth,
    releaseQuarter: draft.releaseQuarter,
    releaseType: draft.releaseType,
    publicationStatus,
    confirmationStatus: draft.confirmationStatus,
    sourceUrl: draft.sourceUrl || null,
    notes: draft.notes,
    seasonNumber: draft.seasonNumber || null,
    episodeNumber: draft.episodeNumber || null,
  });
}

function dateLabel(item: ReleaseEvent) {
  if (item.date_precision === "EXACT") return item.release_date ?? "ohne Datum";
  if (item.date_precision === "MONTH") return `${item.release_month}/${item.release_year}`;
  if (item.date_precision === "QUARTER") return `Q${item.release_quarter} ${item.release_year}`;
  if (item.date_precision === "YEAR") return String(item.release_year ?? "Jahr offen");
  return "Unbekannt";
}

export function AdminPage() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRows, setBulkRows] = useState<
    Array<{ media: MediaItem; draft: ReturnType<typeof emptyDraft> }>
  >([]);

  const statsQ = useQuery({
    queryKey: ["admin-release-stats"],
    queryFn: getAdminReleaseStats,
    enabled: Boolean(user?.isAdmin),
  });
  const releasesQ = useQuery({
    queryKey: ["admin-release-events"],
    queryFn: () => getAdminReleaseEvents({ limit: 100, sort: "newest" }),
    enabled: Boolean(user?.isAdmin),
  });

  useEffect(() => {
    const value = query.trim();
    if (selected && value === selected.title) {
      setSuggestions([]);
      return;
    }
    if (value.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchSuggestions({ data: { query: value, limit: 8 } });
        setSuggestions(result.results);
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, selected]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-release-events"] });
    queryClient.invalidateQueries({ queryKey: ["admin-release-stats"] });
    queryClient.invalidateQueries({ queryKey: ["release-events"] });
    queryClient.invalidateQueries({ queryKey: ["release-events-coming-soon"] });
    queryClient.invalidateQueries({ queryKey: ["release-events-title"] });
    queryClient.invalidateQueries({ queryKey: ["home-release-events"] });
  };
  const createM = useMutation({ mutationFn: createReleaseEvent, onSuccess: invalidate });
  const updateM = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ReleaseInput> }) =>
      updateReleaseEvent(id, input),
    onSuccess: invalidate,
  });
  const deleteM = useMutation({ mutationFn: deleteReleaseEvent, onSuccess: invalidate });
  const bulkCreateM = useMutation({ mutationFn: bulkCreateReleaseEvents, onSuccess: invalidate });
  const bulkUpdateM = useMutation({
    mutationFn: ({ ids, input }: { ids: string[]; input: Partial<ReleaseInput> }) =>
      bulkUpdateReleaseEvents(ids, input),
    onSuccess: invalidate,
  });
  const bulkDeleteM = useMutation({ mutationFn: bulkDeleteReleaseEvents, onSuccess: invalidate });

  const releases = releasesQ.data?.items ?? [];
  const selectedCount = selectedIds.length;
  const canCreate = selected && draft.provider && draft.region;
  const createError =
    createM.error instanceof Error
      ? createM.error.message
      : createM.error
        ? String(createM.error)
        : "";

  const statCards = useMemo(
    () => [
      ["Diesen Monat", statsQ.data?.releasesThisMonth ?? 0],
      ["Upcoming", statsQ.data?.upcomingReleases ?? 0],
      ["Drafts", statsQ.data?.drafts ?? 0],
      ["Unconfirmed", statsQ.data?.unconfirmed ?? 0],
    ],
    [statsQ.data],
  );

  if (loading) return <div className="py-24 text-center text-muted-foreground">Lade Admin…</div>;
  if (!user?.isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <Lock className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="text-2xl font-extrabold">Admin-Zugriff erforderlich</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Du brauchst eine Admin- oder Editor-Rolle, um Streaming-Releases zu verwalten.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-5 font-semibold text-primary-foreground"
        >
          Zur Startseite
        </Link>
      </div>
    );
  }

  const addSelectedToBulk = () => {
    if (!selected) return;
    setBulkRows((rows) => [...rows, { media: selected, draft: { ...draft } }]);
    setSelected(null);
    setQuery("");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-lg border border-border bg-surface p-4">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Admin</div>
          <h1 className="mt-2 text-2xl font-extrabold">BingeCalendar</h1>
          <nav className="mt-6 space-y-2 text-sm">
            <a href="#overview" className="block rounded-md bg-background px-3 py-2 font-semibold">
              Overview
            </a>
            <a
              href="#create"
              className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-background"
            >
              Create
            </a>
            <a
              href="#bulk"
              className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-background"
            >
              Bulk
            </a>
            <a
              href="#manage"
              className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-background"
            >
              Manage
            </a>
          </nav>
        </aside>

        <main className="space-y-8">
          <section id="overview" className="grid gap-3 sm:grid-cols-4">
            {statCards.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-surface p-4">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {label}
                </div>
                <div className="mt-2 text-3xl font-extrabold">{value}</div>
              </div>
            ))}
          </section>

          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-lg font-extrabold">Zuletzt bearbeitet</h2>
            <div className="mt-3 divide-y divide-border">
              {(statsQ.data?.recentlyEdited ?? []).length === 0 && (
                <p className="py-4 text-sm text-muted-foreground">Noch keine Änderungen.</p>
              )}
              {(statsQ.data?.recentlyEdited ?? []).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{item.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.provider} · {item.region} · {dateLabel(item)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-background px-2 py-1 text-[10px] font-bold text-muted-foreground">
                    {item.publication_status}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section id="create" className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <CalendarPlus className="size-5 text-primary" />
              <h2 className="text-xl font-extrabold">Release erstellen</h2>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div>
                <label className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Titel suchen
                </label>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSelected(null);
                    }}
                    className="h-11 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm"
                    placeholder="Film oder Serie suchen…"
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-border bg-background shadow-xl">
                      {suggestions.map((item) => (
                        <button
                          key={`${item.media_type}-${item.id}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setSelected(item);
                            setQuery(item.title);
                            setSuggestions([]);
                            setDraft((current) => ({
                              ...current,
                              releaseType:
                                item.media_type === "tv" ? "TV_SERIES_PREMIERE" : "MOVIE_CATALOG",
                            }));
                          }}
                          className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left hover:bg-surface"
                        >
                          <div className="h-14 w-10 overflow-hidden rounded bg-surface">
                            {posterUrl(item.poster_path, "w92") ? (
                              <img
                                src={posterUrl(item.poster_path, "w92")!}
                                alt={item.title}
                                className="size-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div>
                            <div className="text-sm font-bold">{item.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.release_date ? new Date(item.release_date).getFullYear() : "—"}{" "}
                              · {item.media_type === "tv" ? "Serie" : "Film"}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selected && (
                  <div className="mt-3 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
                    Ausgewählt: <span className="font-bold">{selected.title}</span>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={draft.provider}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      provider: event.target.value,
                      releaseType:
                        event.target.value === "Kino" && selected?.media_type !== "tv"
                          ? "CINEMA_RELEASE"
                          : draft.releaseType,
                    })
                  }
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  {PROVIDERS.map((provider) => (
                    <option key={provider}>{provider}</option>
                  ))}
                </select>
                <select
                  value={draft.region}
                  onChange={(event) => setDraft({ ...draft, region: event.target.value })}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  {REGIONS.map((region) => (
                    <option key={region}>{region}</option>
                  ))}
                </select>
                <select
                  value={draft.releaseType}
                  onChange={(event) =>
                    setDraft({ ...draft, releaseType: event.target.value as ReleaseType })
                  }
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  {RELEASE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {releaseTypeLabel[type]}
                    </option>
                  ))}
                </select>
                <select
                  value={draft.confirmationStatus}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      confirmationStatus: event.target.value as ConfirmationStatus,
                    })
                  }
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  {CONFIRMATION_STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
                <select
                  value={draft.datePrecision}
                  onChange={(event) =>
                    setDraft({ ...draft, datePrecision: event.target.value as DatePrecision })
                  }
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  {DATE_PRECISIONS.map((precision) => (
                    <option key={precision}>{precision}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={draft.releaseDate}
                  onChange={(event) => setDraft({ ...draft, releaseDate: event.target.value })}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                />
                <input
                  type="number"
                  placeholder="Staffel"
                  value={draft.seasonNumber ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      seasonNumber: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                />
                <input
                  type="number"
                  placeholder="Episode"
                  value={draft.episodeNumber ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      episodeNumber: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                />
                <input
                  placeholder="Quelle URL"
                  value={draft.sourceUrl}
                  onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm sm:col-span-2"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                disabled={!canCreate || createM.isPending}
                onClick={() =>
                  selected &&
                  createM.mutate(toInput(selected, draft, "PUBLISHED"), {
                    onSuccess: () => {
                      setSelected(null);
                      setQuery("");
                      setSuggestions([]);
                    },
                  })
                }
                className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Plus className="size-4" />
                Zum Kalender hinzufügen
              </button>
              <button
                disabled={!canCreate || createM.isPending}
                onClick={() =>
                  selected &&
                  createM.mutate(toInput(selected, draft, "DRAFT"), {
                    onSuccess: () => {
                      setSelected(null);
                      setQuery("");
                      setSuggestions([]);
                    },
                  })
                }
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-semibold disabled:opacity-50"
              >
                Als Draft speichern
              </button>
              <button
                disabled={!selected}
                onClick={addSelectedToBulk}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-semibold disabled:opacity-50"
              >
                <UploadCloud className="size-4" />
                Zu Bulk hinzufügen
              </button>
            </div>
            {createError && (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createError}
              </div>
            )}
          </section>

          <section id="bulk" className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xl font-extrabold">Bulk Management</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                disabled={bulkRows.length === 0}
                onClick={() =>
                  bulkCreateM.mutate(bulkRows.map((row) => toInput(row.media, row.draft)))
                }
                className="h-9 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {bulkRows.length} Drafts importieren
              </button>
              <button
                onClick={() => setBulkRows([])}
                className="h-9 rounded-full bg-background px-4 text-xs font-bold"
              >
                Leeren
              </button>
              {selectedCount > 0 && (
                <>
                  <button
                    onClick={() =>
                      bulkUpdateM.mutate({
                        ids: selectedIds,
                        input: { publicationStatus: "PUBLISHED" },
                      })
                    }
                    className="h-9 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground"
                  >
                    Ausgewählte publizieren
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`${selectedCount} Releases löschen?`))
                        bulkDeleteM.mutate(selectedIds);
                    }}
                    className="h-9 rounded-full bg-destructive px-4 text-xs font-bold text-destructive-foreground"
                  >
                    Ausgewählte löschen
                  </button>
                </>
              )}
            </div>
            {bulkRows.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2">Titel</th>
                      <th className="p-2">Provider</th>
                      <th className="p-2">Region</th>
                      <th className="p-2">Datum</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((row, index) => (
                      <tr
                        key={`${row.media.media_type}-${row.media.id}-${index}`}
                        className="border-t border-border"
                      >
                        <td className="p-2 font-semibold">{row.media.title}</td>
                        <td className="p-2">{row.draft.provider}</td>
                        <td className="p-2">{row.draft.region}</td>
                        <td className="p-2">
                          <input
                            type="date"
                            value={row.draft.releaseDate}
                            onChange={(event) =>
                              setBulkRows((rows) =>
                                rows.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        draft: { ...item.draft, releaseDate: event.target.value },
                                      }
                                    : item,
                                ),
                              )
                            }
                            className="h-9 rounded border border-border bg-background px-2"
                          />
                        </td>
                        <td className="p-2">
                          <button
                            onClick={() =>
                              setBulkRows((rows) => rows.filter((_, i) => i !== index))
                            }
                            className="grid size-8 place-items-center rounded-full hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section id="manage" className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xl font-extrabold">Releases verwalten</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2"></th>
                    <th className="p-2">Titel</th>
                    <th className="p-2">Provider</th>
                    <th className="p-2">Region</th>
                    <th className="p-2">Datum</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Typ</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {releases.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={(event) =>
                            setSelectedIds((ids) =>
                              event.target.checked
                                ? [...ids, item.id]
                                : ids.filter((id) => id !== item.id),
                            )
                          }
                        />
                      </td>
                      <td className="p-2 font-semibold">{item.title}</td>
                      <td className="p-2">{item.provider}</td>
                      <td className="p-2">{item.region}</td>
                      <td className="p-2">{dateLabel(item)}</td>
                      <td className="p-2">
                        <select
                          value={item.publication_status}
                          onChange={(event) =>
                            updateM.mutate({
                              id: item.id,
                              input: { publicationStatus: event.target.value as PublicationStatus },
                            })
                          }
                          className="h-8 rounded border border-border bg-background px-2 text-xs"
                        >
                          {PUBLICATION_STATUSES.map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">{releaseTypeLabel[item.release_type]}</td>
                      <td className="flex gap-1 p-2">
                        <button
                          onClick={() => {
                            setBulkRows((rows) => [
                              ...rows,
                              {
                                media: {
                                  id: item.tmdbId,
                                  media_type: item.media_type,
                                  title: item.title,
                                  poster_path: item.poster_path,
                                  backdrop_path: item.backdrop_path,
                                  overview: "",
                                  release_date: item.release_date,
                                  popularity: item.popularity,
                                  vote_average: item.vote_average,
                                  vote_count: 0,
                                  genre_ids: item.genre_ids,
                                },
                                draft: {
                                  ...emptyDraft(),
                                  provider: item.provider,
                                  region: item.region,
                                  releaseDate:
                                    item.release_date ?? new Date().toISOString().slice(0, 10),
                                  datePrecision: item.date_precision,
                                  releaseType: item.release_type,
                                  confirmationStatus: item.confirmation_status,
                                },
                              },
                            ]);
                          }}
                          className="grid size-8 place-items-center rounded-full hover:bg-background"
                        >
                          <Copy className="size-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`"${item.title}" löschen?`)) deleteM.mutate(item.id);
                          }}
                          className="grid size-8 place-items-center rounded-full hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {releasesQ.isLoading && (
                <div className="p-8 text-center text-muted-foreground">Lade Releases…</div>
              )}
              {!releasesQ.isLoading && releases.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">Noch keine Releases.</div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
