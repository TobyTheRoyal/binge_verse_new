import { createContext, useContext } from "react";
export type NavigateOptions = {
  replace?: boolean;
};

export type NavigationContextValue = {
  pathname: string;
  searchParams: URLSearchParams;
  navigate: (href: string, options?: NavigateOptions) => void;
};

export const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error("useNavigation must be used within NavigationProvider");
  return value;
}

export function useNavigate() {
  return useNavigation().navigate;
}

export function useSearchParams() {
  return useNavigation().searchParams;
}
