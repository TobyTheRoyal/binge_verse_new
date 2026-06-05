import { Navbar } from "./components/Navbar";
import { useNavigation, Link } from "./lib/navigation";
import { AuthPage } from "./routes/auth";
import { BrowsePage } from "./routes/browse";
import { HistoryPage } from "./routes/history";
import { HomePage } from "./routes";
import { DetailPage } from "./routes/title.$type.$id";
import { WatchlistPage } from "./routes/watchlist";

export function App() {
  const { pathname } = useNavigation();
  const detailMatch = pathname.match(/^\/title\/(movie|tv)\/(\d+)$/);

  let page = <NotFoundPage />;
  if (pathname === "/") page = <HomePage />;
  else if (pathname === "/browse") page = <BrowsePage />;
  else if (pathname === "/auth") page = <AuthPage />;
  else if (pathname === "/watchlist") page = <WatchlistPage />;
  else if (pathname === "/history") page = <HistoryPage />;
  else if (detailMatch) page = <DetailPage media={detailMatch[1] as "movie" | "tv"} id={Number(detailMatch[2])} />;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">{page}</main>
      <footer className="border-t border-border mt-16 py-8 text-center text-xs text-muted-foreground">
        Powered by TMDB, OMDb, Node.js, GraphQL and MongoDB.
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
        <p className="mt-2 text-sm text-muted-foreground">Diese Seite gibt es nicht oder sie wurde verschoben.</p>
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
