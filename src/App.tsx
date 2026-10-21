import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Navbar } from "./components/Navbar";
import { BrandLogo } from "./components/BrandLogo";
import { RouteBoundary } from "./components/RouteBoundary";
import { useNavigation, Link } from "./lib/navigation";

const AuthPage = lazy(() => import("./routes/auth").then((m) => ({ default: m.AuthPage })));
const AdminPage = lazy(() => import("./routes/admin").then((m) => ({ default: m.AdminPage })));
const BrowsePage = lazy(() => import("./routes/browse").then((m) => ({ default: m.BrowsePage })));
const CalendarPage = lazy(() =>
  import("./routes/calendar").then((m) => ({ default: m.CalendarPage })),
);
const HistoryPage = lazy(() =>
  import("./routes/history").then((m) => ({ default: m.HistoryPage })),
);
const HomePage = lazy(() => import("./routes").then((m) => ({ default: m.HomePage })));
const TasteDnaPage = lazy(() =>
  import("./routes/taste-dna").then((m) => ({ default: m.TasteDnaPage })),
);
const DetailPage = lazy(() =>
  import("./routes/title.$type.$id").then((m) => ({ default: m.DetailPage })),
);
const WatchlistPage = lazy(() =>
  import("./routes/watchlist").then((m) => ({ default: m.WatchlistPage })),
);

export function App() {
  const { pathname } = useNavigation();
  const detailMatch = pathname.match(/^\/title\/(movie|tv)\/(\d+)$/);

  let page = <NotFoundPage />;
  if (pathname === "/") page = <HomePage />;
  else if (pathname === "/browse") page = <BrowsePage />;
  else if (pathname === "/calendar") page = <CalendarPage />;
  else if (pathname === "/admin") page = <AdminPage />;
  else if (pathname === "/auth") page = <AuthPage />;
  else if (pathname === "/watchlist") page = <WatchlistPage />;
  else if (pathname === "/history") page = <HistoryPage />;
  else if (pathname === "/taste-dna") page = <TasteDnaPage />;
  else if (detailMatch)
    page = <DetailPage media={detailMatch[1] as "movie" | "tv"} id={Number(detailMatch[2])} />;

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:font-bold focus:text-primary-foreground"
      >
        Zum Inhalt springen
      </a>
      <Navbar />
      <main id="main-content" className="flex-1">
        <RouteBoundary key={pathname}>
          <Suspense
            fallback={
              <div
                role="status"
                aria-label="Seite wird geladen"
                className="grid min-h-64 place-items-center text-primary"
              >
                <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              </div>
            }
          >
            {page}
          </Suspense>
        </RouteBoundary>
      </main>
      <footer className="mt-12 border-t border-border bg-surface/30">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <Link href="/" aria-label="BINGE Startseite" className="inline-block">
              <BrandLogo className="!w-24" />
            </Link>
            <p className="text-xs text-muted-foreground">
              Dein nächster Lieblingsfilm wartet schon.
            </p>
          </div>
          <nav
            aria-label="Footer-Navigation"
            className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground"
          >
            <Link href="/browse?type=movie" className="hover:text-primary">
              Filme
            </Link>
            <Link href="/browse?type=tv" className="hover:text-primary">
              Serien
            </Link>
            <Link href="/calendar" className="hover:text-primary">
              Kalender
            </Link>
            <span className="text-xs text-muted-foreground/70">Filmdaten von TMDB & OMDb</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Diese Seite gibt es nicht oder sie wurde verschoben.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Zur Startseite
        </Link>
      </div>
    </div>
  );
}
