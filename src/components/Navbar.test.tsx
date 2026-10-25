import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Navbar } from "./Navbar";
import { NavigationProvider } from "@/lib/navigation";
import { useAuth, type AuthCtx } from "@/lib/auth-context";

vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/use-media-suggestions", () => ({
  useMediaSuggestions: (query: string) =>
    query.trim().length >= 2
      ? [
          {
            id: 27205,
            media_type: "movie",
            title: "Inception",
            release_date: "2010-07-15",
            poster_path: "/inception.jpg",
          },
          {
            id: 288673,
            media_type: "tv",
            title: "The Gentlemen",
            release_date: null,
            poster_path: null,
          },
        ]
      : [],
}));

const auth: AuthCtx = {
  user: null,
  loading: false,
  demoAvailable: true,
  registrationEnabled: true,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInDemo: vi.fn(),
  signOut: vi.fn(),
};
beforeEach(() => vi.mocked(useAuth).mockReturnValue({ ...auth, user: null }));
function mount() {
  return render(
    <NavigationProvider>
      <Navbar />
      <button>Ausserhalb</button>
    </NavigationProvider>,
  );
}
async function openSuggestions() {
  const user = userEvent.setup();
  mount();
  await user.type(screen.getByRole("textbox", { name: "Filme und Serien suchen" }), "in");
  return user;
}

describe("header search", () => {
  it("navigates on the first click even when a browser would blur without a relatedTarget", async () => {
    await openSuggestions();
    const input = screen.getByRole("textbox", { name: "Filme und Serien suchen" });
    const suggestion = screen.getByRole("button", { name: /Inception/ });
    // Safari can blur the input on mouse-down without focusing the clicked button.
    if (fireEvent.mouseDown(suggestion, { button: 0 }))
      fireEvent.blur(input, { relatedTarget: null });
    fireEvent.click(suggestion);
    expect(window.location.pathname).toBe("/title/movie/27205");
    expect(input).toHaveValue("");
  });
  it("opens a series from its suggestion", async () => {
    const user = await openSuggestions();
    await user.click(screen.getByRole("button", { name: /The Gentlemen/ }));
    expect(window.location.pathname).toBe("/title/tv/288673");
  });
  it("keeps suggestions available while tabbing and activates with Enter", async () => {
    const user = await openSuggestions();
    await user.tab();
    expect(screen.getByRole("button", { name: /Inception/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(window.location.pathname).toBe("/title/movie/27205");
  });
  it("supports arrow navigation in both directions and restores input focus with Escape", async () => {
    const user = await openSuggestions();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /Inception/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /The Gentlemen/ })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: /Inception/ })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("textbox", { name: "Filme und Serien suchen" })).toHaveFocus();
    expect(screen.queryByRole("region", { name: "Suchvorschläge" })).not.toBeInTheDocument();
  });
  it("closes with Escape and opens again when the input receives focus", async () => {
    const user = await openSuggestions();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: /Inception/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ausserhalb" }));
    await user.click(screen.getByRole("textbox", { name: "Filme und Serien suchen" }));
    expect(screen.getByRole("button", { name: /Inception/ })).toBeVisible();
  });
  it("closes when focus moves outside the search", async () => {
    const user = await openSuggestions();
    await user.click(screen.getByRole("button", { name: "Ausserhalb" }));
    expect(screen.queryByRole("button", { name: /Inception/ })).not.toBeInTheDocument();
  });
  it("submits a trimmed and encoded search without selecting a suggestion", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(
      screen.getByRole("textbox", { name: "Filme und Serien suchen" }),
      "  The Gentlemen  ",
    );
    await user.keyboard("{Enter}");
    expect(window.location.pathname + window.location.search).toBe("/browse?q=The%20Gentlemen");
  });
  it("does not navigate for an empty search", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByRole("textbox", { name: "Filme und Serien suchen" }), " ");
    await user.keyboard("{Enter}");
    expect(window.location.search).toBe("");
  });
});

describe("account and mobile navigation", () => {
  it("shows no privileged controls to a demo visitor", () => {
    vi.mocked(useAuth).mockReturnValue({
      ...auth,
      user: {
        id: "demo",
        name: "Demo",
        email: "demo@binge.invalid",
        role: "USER",
        isAdmin: false,
        isDemo: true,
      },
    });
    mount();
    expect(screen.getAllByText("Demo", { selector: "span" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });
  it("closes the mobile menu with Escape and restores focus", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Menü öffnen" }));
    expect(screen.getByRole("navigation", { name: "Mobile Navigation" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", { name: "Mobile Navigation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menü öffnen" })).toHaveFocus();
  });
  it("displays a logout error rather than silently losing the current session", async () => {
    const signOut = vi.fn().mockRejectedValue(new Error("offline"));
    vi.mocked(useAuth).mockReturnValue({
      ...auth,
      signOut,
      user: { id: "u", name: "User", email: "u@binge.test", role: "USER", isAdmin: false },
    });
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Abmelden" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Abmelden fehlgeschlagen");
  });
});
