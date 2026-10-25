import { createContext, useContext } from "react";
import type { UserRole } from "../../shared/catalog";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isAdmin: boolean;
  isDemo?: boolean;
}

export interface AuthCtx {
  user: User | null;
  loading: boolean;
  demoAvailable: boolean;
  registrationEnabled: boolean;
  signInDemo: () => Promise<{ error?: string }>;
  signUp: (name: string, email: string, password: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

export const Ctx = createContext<AuthCtx | null>(null);

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
