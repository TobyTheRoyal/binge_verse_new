import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Link, NavigationProvider } from "./navigation";
import { useNavigate, useNavigation, useSearchParams } from "./navigation-context";

function Location() {
  const navigation = useNavigation();
  const params = useSearchParams();
  const navigate = useNavigate();
  return (
    <>
      <output>
        {navigation.pathname}:{params.get("q")}
      </output>
      <button onClick={() => navigate("/history", { replace: true })}>Ersetzen</button>
    </>
  );
}

describe("client-side navigation", () => {
  it("follows internal links and retains encoded query values", async () => {
    render(
      <NavigationProvider>
        <Link href="/browse?q=The%20Gentlemen">Suchen</Link>
        <Location />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Suchen" }));
    expect(screen.getByRole("status")).toHaveTextContent("/browse:The Gentlemen");
    expect(window.scrollTo).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Ersetzen" }));
    expect(window.location.pathname).toBe("/history");
  });
  it("synchronizes browser back and forward navigation", () => {
    render(
      <NavigationProvider>
        <Location />
      </NavigationProvider>,
    );
    act(() => {
      window.history.replaceState(null, "", "/browse?q=matrix");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("/browse:matrix");
  });
  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }])(
    "preserves native modified clicks: %j",
    (modifier) => {
      render(
        <NavigationProvider>
          <Link href="/browse">Browse</Link>
        </NavigationProvider>,
      );
      document.addEventListener(
        "click",
        (event) => {
          expect(event.defaultPrevented).toBe(false);
          event.preventDefault();
        },
        { once: true },
      );
      fireEvent.click(screen.getByRole("link"), modifier);
      expect(window.location.pathname).toBe("/");
    },
  );
  it("respects prevented clicks and links opening another tab", () => {
    render(
      <NavigationProvider>
        <Link href="/browse" onClick={(event) => event.preventDefault()}>
          Verhindert
        </Link>
        <Link href="/history" target="_blank">
          Neuer Tab
        </Link>
      </NavigationProvider>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Verhindert" }));
    fireEvent.click(screen.getByRole("link", { name: "Neuer Tab" }));
    expect(window.location.pathname).toBe("/");
  });
  it("fails clearly when hooks are used outside their provider", () => {
    expect(() => render(<Location />)).toThrow("NavigationProvider");
  });
});
