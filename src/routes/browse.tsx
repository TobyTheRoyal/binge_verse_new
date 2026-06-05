import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { MediaCard } from "@/components/MediaCard";
import { getGenres, searchMulti, MediaItem, discover } from "@/lib/tmdb.functions";

const searchSchema = z.object({
  q: z.string().optional(),
  type: z.enum(["movie", "tv"]).optional(),
  genre: z.string().optional(),
  year: z.string().optional(),
  sort: z.string().optional(),
});

export const Route = createFileRoute("/browse")({
  head: () => ({
    meta: [
      { title: "Browse · Bingeverse" },
      { name: "description", content: "Suche und filtere Filme & Serien nach Genre, Jahr und mehr." },
    ],
  }),
  validateSearch: searchSchema,
  component: Browse,
});

const YEARS = Array.from({ length: 50 }, (_, i) => String(new Date().getFullYear() - i));
const SORTS = [
  { v: "popularity.desc", l: "Beliebtheit" },
  { v: "vote_average.desc", l: "Beste Bewertung" },
  { v: "primary_release_date.desc", l: "Neueste" },
  { v: "primary_release_date.asc", l: "Älteste" },
];

function Browse() {
  const navigate = useNavigate({ from: "/browse" });
  const search = Route.useSearch();
  const [text, setText] = useState(search.q ?? "");

  useEffect(() => setText(search.q ?? ""), [search.q]);

  const mediaType: "movie" | "tv" = (search.type as any) ?? "movie";

  const genresQ = useQuery({
    queryKey: ["genres", mediaType],
    queryFn: () => getGenres({ data: { media: mediaType } }),
    staleTime: 1000 * 60 * 60,
  });

  const isSearch = !!search.q?.trim();

  const resultsQ = useQuery({
    queryKey: ["browse", search],
    queryFn: async () => {
      if (isSearch) {
        const r = await searchMulti({ data: { query: search.q! } });
        return { results: r.results as MediaItem[] };
      }
      const r = await discover({
        data: {
          media: mediaType,
          genre: search.genre,
          year: search.year,
          sort_by: search.sort,
        },
      });
      return { results: r.results as MediaItem[] };
    },
  });

  const update = (patch: Record<string, string | undefined>) => {
    navigate({
      search: (prev) => {
        const next: any = { ...prev, ...patch };
        Object.keys(next).forEach((k) => (next[k] === "" || next[k] === undefined) && delete next[k]);
        return next;
      },
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update({ q: text.trim() || undefined });
  };

  const heading = useMemo(() => {
    if (isSearch) return `Ergebnisse für "${search.q}"`;
    return mediaType === "tv" ? "Serien durchstöbern" : "Filme durchstöbern";
  }, [isSearch, mediaType, search.q]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{heading}</h1>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Suche…"
              className="flex-1 min-w-[200px] h-11 px-4 rounded-full bg-surface border border-border focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
            <button type="submit" className="h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition">
              Suchen
            </button>
            {isSearch && (
              <button type="button" onClick={() => { setText(""); update({ q: undefined }); }} className="h-11 px-4 rounded-full bg-surface border border-border text-sm font-medium hover:bg-surface-2">
                Filter zeigen
              </button>
            )}
          </div>

          {!isSearch && (
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex p-1 rounded-full bg-surface border border-border">
                <button type="button" onClick={() => update({ type: "movie", genre: undefined })} className={`px-4 h-9 rounded-full text-sm font-semibold transition ${mediaType === "movie" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  Filme
                </button>
                <button type="button" onClick={() => update({ type: "tv", genre: undefined })} className={`px-4 h-9 rounded-full text-sm font-semibold transition ${mediaType === "tv" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  Serien
                </button>
              </div>

              <select value={search.genre ?? ""} onChange={(e) => update({ genre: e.target.value || undefined })} className="h-11 px-4 rounded-full bg-surface border border-border text-sm cursor-pointer">
                <option value="">Alle Genres</option>
                {genresQ.data?.map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
              </select>

              <select value={search.year ?? ""} onChange={(e) => update({ year: e.target.value || undefined })} className="h-11 px-4 rounded-full bg-surface border border-border text-sm cursor-pointer">
                <option value="">Alle Jahre</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>

              <select value={search.sort ?? "popularity.desc"} onChange={(e) => update({ sort: e.target.value })} className="h-11 px-4 rounded-full bg-surface border border-border text-sm cursor-pointer">
                {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </div>
          )}
        </form>
      </div>

      {resultsQ.isLoading ? (
        <div className="py-20 grid place-items-center text-muted-foreground"><Loader2 className="animate-spin" /></div>
      ) : resultsQ.data && resultsQ.data.results.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
          {resultsQ.data.results.map((it) => <MediaCard key={`${it.media_type}-${it.id}`} item={it} />)}
        </div>
      ) : (
        <div className="py-20 text-center text-muted-foreground">Keine Ergebnisse.</div>
      )}
    </div>
  );
}
