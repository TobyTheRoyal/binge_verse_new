import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Link, useNavigate, useNavigation } from "@/lib/navigation";
import { Search, LogOut, User as UserIcon, Film } from "lucide-react";

export function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useNavigation();
  const [q, setQ] = useState("");

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
          {user && (
            <>
              <Link href="/watchlist" className={navClass("/watchlist")}>
                Watchlist
              </Link>
              <Link href="/history" className={navClass("/history")}>
                History
              </Link>
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
              <button onClick={() => signOut()} title="Logout" className="size-9 grid place-items-center rounded-full hover:bg-surface transition-colors">
                <LogOut className="size-4" />
              </button>
            </>
          ) : (
            <Link href="/auth" className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
              <UserIcon className="size-4" />
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
