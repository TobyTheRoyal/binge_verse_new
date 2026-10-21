import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Link, useNavigate, useNavigation } from "@/lib/navigation";
import { searchSuggestions, type MediaItem } from "@/lib/tmdb.functions";
import { posterUrl } from "@/components/MediaCard";
import { BrandLogo } from "@/components/BrandLogo";
import {
  Search,
  LogOut,
  User as UserIcon,
  Menu,
  X,
  Compass,
  Clapperboard,
  CalendarDays,
  Bookmark,
  Star,
  Dna,
  Settings,
} from "lucide-react";

export function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useNavigation();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<MediaItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

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
    setSearchOpen(false);
    if (q.trim()) navigate(`/browse?q=${encodeURIComponent(q.trim())}`);
  };

  const navItems = [
    { href: "/", label: "Entdecken", icon: Compass },
    { href: "/browse", label: "Browse", icon: Clapperboard },
    { href: "/calendar", label: "Kalender", icon: CalendarDays },
    ...(user
      ? [
          { href: "/watchlist", label: "Watchlist", icon: Bookmark },
          { href: "/history", label: "Bewertungen", icon: Star },
          { href: "/taste-dna", label: "TasteDNA", icon: Dna },
          ...(user.isAdmin ? [{ href: "/admin", label: "Admin", icon: Settings }] : []),
        ]
      : []),
  ];

  const activePage = (href: string) => (pathname === href ? "page" : undefined);

  return (
    <header
      className="sticky top-0 z-40 glass border-b border-border"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setSearchOpen(false);
          if (menuOpen) {
            setMenuOpen(false);
            menuButtonRef.current?.focus();
          }
        }
      }}
    >
      <div className="mx-auto flex min-h-[72px] max-w-[1440px] flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-5 sm:px-6 lg:px-8">
        <Link href="/" aria-label="BINGE Startseite" className="shrink-0 py-1">
          <BrandLogo />
        </Link>

        <nav aria-label="Hauptnavigation" className="hidden shrink-0 items-center xl:flex">
          {navItems.map(({ href, label }) => (
            <Link key={href} href={href} className="nav-link" aria-current={activePage(href)}>
              {label}
            </Link>
          ))}
        </nav>

        <form
          role="search"
          onSubmit={submit}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
          }}
          className="order-last w-full min-w-0 sm:order-none sm:ml-auto sm:w-auto sm:max-w-sm sm:flex-1"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              aria-label="Filme und Serien suchen"
              aria-expanded={searchOpen && suggestions.length > 0}
              aria-controls="header-search-results"
              placeholder="Suche Filme, Serien…"
              className="h-10 w-full rounded-md border border-input bg-surface/70 pl-10 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {searchOpen && suggestions.length > 0 && (
              <div
                id="header-search-results"
                className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-input bg-popover shadow-2xl"
              >
                {suggestions.map((item) => {
                  const year = item.release_date ? new Date(item.release_date).getFullYear() : "—";
                  const poster = posterUrl(item.poster_path, "w92");

                  return (
                    <button
                      key={`${item.media_type}-${item.id}`}
                      type="button"
                      onClick={() => {
                        setQ("");
                        setSearchOpen(false);
                        setSuggestions([]);
                        navigate(`/title/${item.media_type}/${item.id}`);
                      }}
                      className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-offset-[-2px]"
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
                          <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
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

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
          {user ? (
            <>
              <div className="flex items-center gap-2 text-sm" title={user.name}>
                <div className="grid size-9 place-items-center rounded-full border border-primary/25 bg-primary/10 text-xs font-bold text-primary">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="hidden max-w-24 truncate font-medium 2xl:inline">{user.name}</span>
              </div>
              <button
                onClick={async () => {
                  await signOut();
                  navigate("/auth", { replace: true });
                }}
                title="Abmelden"
                aria-label="Abmelden"
                className="icon-button"
              >
                <LogOut className="size-4" />
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-extrabold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <UserIcon className="size-4" />
              Login
            </Link>
          )}
          <button
            ref={menuButtonRef}
            type="button"
            aria-label={menuOpen ? "Menü schließen" : "Menü öffnen"}
            title={menuOpen ? "Menü schließen" : "Menü öffnen"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
            className="icon-button xl:hidden"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile Navigation"
          className="absolute inset-x-0 top-full grid grid-cols-2 gap-1 border-b border-border bg-background p-4 shadow-xl sm:grid-cols-3 xl:hidden"
        >
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={activePage(href)}
              onClick={() => setMenuOpen(false)}
              className="nav-link aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
