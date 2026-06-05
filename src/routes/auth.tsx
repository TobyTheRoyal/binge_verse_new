import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Film, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Login · Bingeverse" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    navigate({ to: "/" });
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = mode === "login" ? await signIn(email, password) : await signUp(name, email, password);
    setLoading(false);
    if (res.error) setErr(res.error);
    else navigate({ to: "/" });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="size-14 mx-auto rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-xl shadow-primary/30 mb-4">
            <Film className="size-6 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {mode === "login" ? "Willkommen zurück" : "Konto erstellen"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {mode === "login" ? "Logge dich ein, um Watchlist & Bewertungen zu nutzen." : "Erstelle dein kostenloses Bingeverse-Konto."}
          </p>
        </div>

        <form onSubmit={submit} className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full h-11 px-4 rounded-lg bg-background border border-border focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">E-Mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full h-11 px-4 rounded-lg bg-background border border-border focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Passwort</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full h-11 px-4 rounded-lg bg-background border border-border focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          {err && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{err}</div>}

          <button disabled={loading} type="submit" className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {loading && <Loader2 className="size-4 animate-spin" />}
            {mode === "login" ? "Einloggen" : "Konto erstellen"}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? "Noch kein Konto? " : "Schon registriert? "}
            <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(null); }} className="text-primary font-semibold hover:underline">
              {mode === "login" ? "Registrieren" : "Einloggen"}
            </button>
          </p>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          <Link to="/" className="hover:text-foreground">← zurück zur Startseite</Link>
        </p>
      </div>
    </div>
  );
}
