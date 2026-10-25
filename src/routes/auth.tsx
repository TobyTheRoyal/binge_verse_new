import { useEffect, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { PASSWORD_MIN_LENGTH } from "../../shared/auth-policy";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@/lib/navigation";
import { useNavigate, useNavigation } from "@/lib/navigation-context";
export function AuthPage() {
  const { signIn, signUp, signInDemo, user, demoAvailable, registrationEnabled } = useAuth();
  const navigate = useNavigate();
  const demoEntry = useNavigation().pathname === "/demo";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setErr(null);
  };
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [navigate, user]);
  useEffect(() => {
    if (!user) {
      resetForm();
      const form = document.getElementById("auth-form") as HTMLFormElement | null;
      if (form) {
        form.reset();
        requestAnimationFrame(() => form.reset());
      }
    }
  }, [user]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErr(null);
    setLoading(true);
    const result =
      mode === "login" ? await signIn(email, password) : await signUp(name, email, password);
    setLoading(false);
    if (result.error) setErr(result.error);
    else {
      resetForm();
      navigate("/");
    }
  };
  return (
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" aria-label="BINGE Startseite" className="mb-8 inline-block">
            <BrandLogo className="!w-36" />
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {demoEntry
              ? "BINGE ausprobieren"
              : mode === "login"
                ? "Willkommen zurück"
                : "Konto erstellen"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {demoEntry
              ? "Dein eigener temporärer Zugang."
              : mode === "login"
                ? "Deine Watchlist. Deine Bewertungen. Dein Filmabend."
                : "Erstelle dein kostenloses BINGE-Konto."}
          </p>
        </div>

        {demoAvailable && (
          <section className="mb-6 border-b border-border pb-6">
            <button
              type="button"
              disabled={loading || demoLoading}
              onClick={async () => {
                setErr(null);
                setDemoLoading(true);
                const result = await signInDemo();
                setDemoLoading(false);
                if (result.error) setErr(result.error);
                else navigate("/");
              }}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:opacity-50"
            >
              {demoLoading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="size-4" aria-hidden="true" />
              )}
              {demoLoading ? "Demo wird vorbereitet" : "Demo starten"}
            </button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Ohne Registrierung. Änderungen bleiben in deinem temporären Demo-Bereich.
            </p>
          </section>
        )}

        {err && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {err}
          </p>
        )}

        <form
          id="auth-form"
          key={user ? "authed" : "guest"}
          onSubmit={submit}
          className="bg-surface border border-border rounded-2xl p-6 space-y-4"
        >
          {mode === "signup" && (
            <div className="space-y-1.5">
              <label
                htmlFor="auth-name"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Name
              </label>
              <input
                id="auth-name"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="w-full h-11 px-4 rounded-lg bg-background border border-border focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <label
              htmlFor="auth-email"
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              E-Mail
            </label>
            <input
              id="auth-email"
              name="username"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full h-11 px-4 rounded-lg bg-background border border-border focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="auth-password"
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              Passwort
            </label>
            <input
              id="auth-password"
              name={mode === "login" ? "current-password" : "new-password"}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={mode === "signup" ? PASSWORD_MIN_LENGTH : 1}
              className="w-full h-11 px-4 rounded-lg bg-background border border-border focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {mode === "signup" && (
              <p className="text-xs text-muted-foreground">
                Mindestens {PASSWORD_MIN_LENGTH} Zeichen, maximal 72 UTF-8-Bytes.
              </p>
            )}
          </div>

          <button
            disabled={loading || demoLoading}
            type="submit"
            className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {mode === "login" ? "Einloggen" : "Konto erstellen"}
          </button>

          {registrationEnabled && (
            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? "Noch kein Konto? " : "Schon registriert? "}
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setMode(mode === "login" ? "signup" : "login");
                }}
                className="text-primary font-semibold hover:underline"
              >
                {mode === "login" ? "Registrieren" : "Einloggen"}
              </button>
            </p>
          )}
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          <Link href="/" className="hover:text-foreground">
            Zurück zur Startseite
          </Link>
        </p>
      </div>
    </div>
  );
}
