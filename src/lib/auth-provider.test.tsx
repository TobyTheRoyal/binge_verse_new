import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./auth-provider";
import { useAuth } from "./auth-context";

const account = { id: "user-1", name: "Viewer", email: "viewer@binge.test" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function Probe() {
  const auth = useAuth();
  const [message, setMessage] = useState("");
  return (
    <>
      <output aria-label="Anmeldung">
        {auth.loading
          ? "loading"
          : auth.user
            ? `${auth.user.name}:${auth.user.role}:${auth.user.isAdmin}:${auth.user.isDemo}`
            : "guest"}
      </output>
      <output aria-label="Funktionen">
        {String(auth.demoAvailable)}:{String(auth.registrationEnabled)}
      </output>
      <output aria-label="Ergebnis">{message}</output>
      <button
        onClick={async () =>
          setMessage((await auth.signIn(" VIEWER@BINGE.TEST ", "test-password")).error ?? "ok")
        }
      >
        Login
      </button>
      <button
        onClick={async () =>
          setMessage(
            (await auth.signUp(" Viewer ", " VIEWER@BINGE.TEST ", "test-only-valid-password"))
              .error ?? "ok",
          )
        }
      >
        Registrieren
      </button>
      <button
        onClick={async () => setMessage((await auth.signUp(" ", "invalid", "short")).error ?? "ok")}
      >
        Ungueltig
      </button>
      <button onClick={async () => setMessage((await auth.signInDemo()).error ?? "ok")}>
        Demo
      </button>
      <button
        onClick={async () => {
          try {
            await auth.signOut();
            setMessage("ok");
          } catch {
            setMessage("logout-error");
          }
        }}
      >
        Logout
      </button>
    </>
  );
}
async function mount(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["private-before-login"], "private");
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText("Anmeldung")).not.toHaveTextContent("loading"), {
    timeout: 4000,
  });
  return client;
}
const guestResponse = () => json({ user: null, demoEnabled: true, registrationEnabled: true });

describe("authentication state and private query caches", () => {
  it("loads server-controlled feature flags and user roles", async () => {
    await mount(
      vi.fn().mockResolvedValue(
        json({
          user: { ...account, role: "EDITOR" },
          demoEnabled: true,
          registrationEnabled: false,
        }),
      ),
    );
    expect(screen.getByLabelText("Anmeldung")).toHaveTextContent("Viewer:EDITOR:true:false");
    expect(screen.getByLabelText("Funktionen")).toHaveTextContent("true:false");
  });
  it("retries a temporary session lookup failure", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(guestResponse());
    await mount(fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Anmeldung")).toHaveTextContent("guest");
  });
  it("settles as anonymous after repeated network failures", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    await mount(fetch);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(screen.getByLabelText("Anmeldung")).toHaveTextContent("guest");
  });
  it.each(["Login", "Registrieren", "Demo"])(
    "clears previous private data after %s",
    async (action) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(guestResponse())
        .mockImplementation(async () => json({ user: { ...account, isDemo: action === "Demo" } }));
      const client = await mount(fetch);
      await userEvent.click(screen.getByRole("button", { name: action }));
      await waitFor(() => expect(screen.getByLabelText("Ergebnis")).toHaveTextContent("ok"));
      expect(client.getQueryData(["private-before-login"])).toBeUndefined();
      expect(screen.getByLabelText("Anmeldung")).toHaveTextContent("Viewer:USER:false");
      const [url, init] = fetch.mock.calls[1];
      expect(init.credentials).toBe("include");
      if (action !== "Demo") expect(JSON.parse(init.body).email).toBe("viewer@binge.test");
      expect(String(url)).toMatch(/^\/api\//);
    },
  );
  it.each(["Login", "Registrieren", "Demo"])(
    "displays the server rejection for %s without changing identity",
    async (action) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(guestResponse())
        .mockImplementation(async () => json({ error: "Nicht erlaubt." }, 403));
      const client = await mount(fetch);
      await userEvent.click(screen.getByRole("button", { name: action }));
      expect(await screen.findByText("Nicht erlaubt.")).toBeInTheDocument();
      expect(client.getQueryData(["private-before-login"])).toBe("private");
      expect(screen.getByLabelText("Anmeldung")).toHaveTextContent("guest");
    },
  );
  it.each(["Login", "Registrieren", "Demo"])(
    "handles a network error during %s",
    async (action) => {
      await mount(
        vi.fn().mockResolvedValueOnce(guestResponse()).mockRejectedValue(new Error("offline")),
      );
      await userEvent.click(screen.getByRole("button", { name: action }));
      await waitFor(() => expect(screen.getByLabelText("Ergebnis")).not.toBeEmptyDOMElement());
      expect(screen.getByLabelText("Anmeldung")).toHaveTextContent("guest");
    },
  );
  it("rejects invalid registration locally without sending a request", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(guestResponse());
    await mount(fetch);
    await userEvent.click(screen.getByRole("button", { name: "Ungueltig" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Ergebnis")).toHaveTextContent("gültige Kontodaten"),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("clears cached private data on logout", async () => {
    const client = await mount(
      vi
        .fn()
        .mockResolvedValueOnce(json({ user: account }))
        .mockResolvedValueOnce(json({ ok: true })),
    );
    await userEvent.click(screen.getByRole("button", { name: "Logout" }));
    await waitFor(() => expect(screen.getByLabelText("Anmeldung")).toHaveTextContent("guest"));
    expect(client.getQueryData(["private-before-login"])).toBeUndefined();
  });
  it("keeps the current identity if logout fails", async () => {
    await mount(
      vi
        .fn()
        .mockResolvedValueOnce(json({ user: account }))
        .mockResolvedValueOnce(json({}, 503)),
    );
    await userEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(await screen.findByText("logout-error")).toBeInTheDocument();
    expect(screen.getByLabelText("Anmeldung")).toHaveTextContent("Viewer");
  });
});
