import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Link, useNavigate, useNavigation } from "@/lib/navigation";
import { searchSuggestions, type MediaItem } from "@/lib/tmdb.functions";
import { posterUrl } from "@/components/MediaCard";
import { Search, LogOut, User as UserIcon, Film } from "lucide-react";

export function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useNavigation();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<MediaItem[]>([]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchSuggestions({ data: { query, limit: 6 } });
        if (!cancelled) setSuggestions(result.results);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/browse?q=${encodeURIComponent(q.trim())}`);
  };

  const navClass = (href: string) =>
    `px-3 py-2 rounded-md transition-colors ${
      pathname === href ? "text-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <header className="sticky top-0 z-40 glass border-b border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center shadow-lg shadow-primary/30">
            <Film className="size-4 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-display font-extrabold text-lg tracking-tight">Bingeverse</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm font-medium ml-2">
          <Link href="/" className={navClass("/")}>
            Discover
          </Link>
          <Link href="/browse" className={navClass("/browse")}>
            Browse
          </Link>
          <Link href="/calendar" className={navClass("/calendar")}>
            Calendar
          </Link>
          {user && (
            <>
              <Link href="/watchlist" className={navClass("/watchlist")}>
                Watchlist
              </Link>
              <Link href="/history" className={navClass("/history")}>
                History
              </Link>
              <Link href="/taste-dna" className={navClass("/taste-dna")}>
                TasteDNA
              </Link>
              {user.isAdmin && (
                <Link href="/admin" className={navClass("/admin")}>
                  Admin
                </Link>
              )}
            </>
          )}
        </nav>

        <form onSubmit={submit} className="flex-1 max-w-md ml-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suche Filme, Serien…"
              className="w-full h-10 pl-9 pr-3 rounded-full bg-surface border border-border focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring text-sm placeholder:text-muted-foreground"
            />
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-sm z-30">
                {suggestions.map((item) => {
                  const year = item.release_date ? new Date(item.release_date).getFullYear() : "—";
                  const poster = posterUrl(item.poster_path, "w92");

                  return (
                    <button
                      key={`${item.media_type}-${item.id}`}
                      type="button"
                      onClick={() => {
                        setQ(item.title);
                        setSuggestions([]);
                        navigate(`/title/${item.media_type}/${item.id}`);
                      }}
                      className="flex w-full items-center gap-3 px-2 py-2 text-left text-sm hover:bg-surface border-b border-border last:border-b-0"
                    >
                      <div className="h-14 w-10 overflow-hidden rounded-md border border-border bg-surface/60 shrink-0">
                        {poster ? (
                          <img
                            src={poster}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-[9px] text-muted-foreground">
                            IMG
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-foreground">{item.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{year}</span>
                          <span className="rounded-full bg-surface px-1.5 py-0.5 uppercase tracking-[0.16em] text-[9px] text-muted-foreground">
                            {item.media_type === "tv" ? "Serie" : "Film"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </form>

        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border text-sm">
                <div className="size-6 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-[10px] font-bold text-primary-foreground">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">{user.name}</span>
              </div>
              <button
                onClick={async () => {
                  await signOut();
                  navigate("/auth", { replace: true });
                }}
                title="Logout"
                className="size-9 grid place-items-center rounded-full hover:bg-surface transition-colors"
              >
                <LogOut className="size-4" />
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <UserIcon className="size-4" />
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
