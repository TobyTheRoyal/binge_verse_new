import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "USER" | "EDITOR" | "ADMIN";
  isAdmin: boolean;
}

type UserResponse = {
  id: string;
  name: string;
  email: string;
  role?: User["role"];
  isAdmin?: boolean;
};

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signUp: (name: string, email: string, password: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

function normalizeUser(raw: UserResponse | null | undefined): User | null {
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    role: raw.role ?? "USER",
    isAdmin: Boolean(raw.isAdmin || raw.role === "ADMIN" || raw.role === "EDITOR"),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await fetch("/api/me", { credentials: "include" });

        if (!response.ok && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          continue;
        }

        const data = await response.json();
        setUser(normalizeUser(data.user));
        return;
      } catch {
        if (attempt === 3) {
          setUser(null);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  };

  useEffect(() => {
    void loadUser().finally(() => setLoading(false));
  }, []);

  const signUp: AuthCtx["signUp"] = async (name, email, password) => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail || password.length < 6) {
      return { error: "Bitte alle Felder ausfüllen (Passwort min. 6 Zeichen)." };
    }

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, email: trimmedEmail, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        return { error: data.error ?? "Registrierung fehlgeschlagen." };
      }

      setUser(normalizeUser(data.user));
      return {};
    } catch {
      return { error: "Registrierung fehlgeschlagen." };
    }
  };

  const signIn: AuthCtx["signIn"] = async (email, password) => {
    const trimmedEmail = email.trim().toLowerCase();

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        return { error: data.error ?? "Login fehlgeschlagen." };
      }

      setUser(normalizeUser(data.user));
      return {};
    } catch {
      return { error: "Login fehlgeschlagen." };
    }
  };

  const signOut = async () => {
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore and still clear local UI state
    }
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signUp, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
