import { NavigationContext, type NavigationContextValue, useNavigate } from "./navigation-context";
import { useEffect, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
function currentLocation() {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
  };
}
export function NavigationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(currentLocation);
  useEffect(() => {
    const onPopState = () => setLocation(currentLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const value = useMemo<NavigationContextValue>(
    () => ({
      pathname: location.pathname,
      searchParams: new URLSearchParams(location.search),
      navigate: (href, options) => {
        if (options?.replace) window.history.replaceState(null, "", href);
        else window.history.pushState(null, "", href);
        setLocation(currentLocation());
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    }),
    [location.pathname, location.search],
  );
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
export function Link({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
}) {
  const navigate = useNavigate();
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target === "_blank"
        ) {
          return;
        }
        event.preventDefault();
        navigate(href);
      }}
    />
  );
}
