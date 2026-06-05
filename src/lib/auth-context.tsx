import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface User {
  id: string;
  name: string;
  email: string;
}

interface StoredUser extends User {
  passwordHash: string;
}

const USERS_KEY = "bv:users";
const SESSION_KEY = "bv:session";

async function hash(s: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) return s;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); } catch { return []; }
}
function writeUsers(u: StoredUser[]) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signUp: (name: string, email: string, password: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setLoading(false);
  }, []);

  const signUp: AuthCtx["signUp"] = async (name, email, password) => {
    email = email.trim().toLowerCase();
    if (!name.trim() || !email || password.length < 6) return { error: "Bitte alle Felder ausfüllen (Passwort min. 6 Zeichen)." };
    const users = readUsers();
    if (users.find((u) => u.email === email)) return { error: "E-Mail bereits registriert." };
    const passwordHash = await hash(password);
    const newUser: StoredUser = { id: crypto.randomUUID(), name: name.trim(), email, passwordHash };
    writeUsers([...users, newUser]);
    const session: User = { id: newUser.id, name: newUser.name, email: newUser.email };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
    return {};
  };

  const signIn: AuthCtx["signIn"] = async (email, password) => {
    email = email.trim().toLowerCase();
    const users = readUsers();
    const u = users.find((x) => x.email === email);
    if (!u) return { error: "Konto nicht gefunden." };
    const h = await hash(password);
    if (u.passwordHash !== h) return { error: "Falsches Passwort." };
    const session: User = { id: u.id, name: u.name, email: u.email };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
    return {};
  };

  const signOut = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signUp, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}