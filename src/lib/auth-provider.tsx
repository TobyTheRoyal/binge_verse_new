import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ctx, type AuthCtx, type User } from "./auth-context";

type UserResponse = {
  id: string;
  name: string;
  email: string;
  role?: User["role"];
  isAdmin?: boolean;
  isDemo?: boolean;
};

function normalizeUser(raw: UserResponse | null | undefined): User | null {
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    role: raw.role ?? "USER",
    isAdmin: Boolean(raw.isAdmin || raw.role === "ADMIN" || raw.role === "EDITOR"),
    isDemo: Boolean(raw.isDemo),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

  const loadUser = async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await fetch("/api/me", { credentials: "include" });

        if (!response.ok && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          continue;
        }

        const data = await response.json();
        setDemoAvailable(Boolean(data.demoEnabled));
        setRegistrationEnabled(Boolean(data.registrationEnabled));
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

    try {
      const { registrationSchema, PASSWORD_MIN_LENGTH } = await import("../../shared/auth");
      if (
        !registrationSchema.safeParse({ name: trimmedName, email: trimmedEmail, password }).success
      )
        return {
          error: `Bitte gültige Kontodaten und ein Passwort mit mindestens ${PASSWORD_MIN_LENGTH} Zeichen (maximal 72 UTF-8-Bytes) eingeben.`,
        };
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

      await queryClient.cancelQueries();
      queryClient.clear();
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

      await queryClient.cancelQueries();
      queryClient.clear();
      setUser(normalizeUser(data.user));
      return {};
    } catch {
      return { error: "Login fehlgeschlagen." };
    }
  };

  const signInDemo: AuthCtx["signInDemo"] = async () => {
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok) return { error: data.error ?? "Die Demo konnte nicht gestartet werden." };
      await queryClient.cancelQueries();
      queryClient.clear();
      setUser(normalizeUser(data.user));
      return {};
    } catch {
      return { error: "Die Demo ist gerade nicht erreichbar. Bitte versuche es erneut." };
    }
  };

  const signOut = async () => {
    const response = await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw new Error("Abmelden fehlgeschlagen. Bitte versuche es erneut.");
    await queryClient.cancelQueries();
    queryClient.clear();
    setUser(null);
  };

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        demoAvailable,
        registrationEnabled,
        signUp,
        signIn,
        signInDemo,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
