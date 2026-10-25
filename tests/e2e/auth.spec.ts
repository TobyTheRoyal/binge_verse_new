import { randomUUID } from "node:crypto";
import { test, expect, startDemo, userId, graphql } from "./fixtures";
import { e2eOrigin } from "./environment";

test("demo access persists after refresh, cannot enter admin and logout revokes the cookie", async ({
  demoPage: page,
}) => {
  const before = await userId(page);
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === "binge_e2e_session")?.httpOnly).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weiter schauen", exact: true })).toBeVisible();
  expect(await userId(page)).toBe(before);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Admin-Zugriff erforderlich", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/auth$/);
  const oldCookie = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const response = await page.request.get(`${e2eOrigin}/api/me`, {
    headers: { Cookie: oldCookie },
  });
  expect((await response.json()).user).toBeNull();
});

test("a second browser visitor has independent data and cannot read another user", async ({
  demoPage: page,
  browser,
}) => {
  const firstId = await userId(page);
  const second = await browser.newContext({ baseURL: e2eOrigin });
  try {
    const start = await second.request.post("/api/demo", { data: {} });
    const secondId = (await start.json()).user.id;
    expect(secondId).not.toBe(firstId);
    const response = await second.request.post("/graphql", {
      data: {
        query: "query($id:String!){ratings(userId:$id){rating}}",
        variables: { id: firstId },
      },
    });
    expect((await response.json()).errors).toBeTruthy();
    const own = await graphql<{ ratings: unknown[] }>(
      second.request,
      "query($id:String!){ratings(userId:$id){rating}}",
      { id: secondId },
    );
    expect(own.ratings).toHaveLength(8);
  } finally {
    await second.close();
  }
});

test("normal registration, logout, invalid login and valid login work", async ({ page }) => {
  const email = `e2e-${randomUUID()}@binge.test`;
  const password = "test-only-viewer-password";
  await page.goto("/auth");
  await page.getByRole("button", { name: "Registrieren", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Test Viewer");
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Konto erstellen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();
  await page.getByRole("button", { name: "Abmelden" }).click();
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Einloggen", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Einloggen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();
});

test("a failed demo start displays an error and can be retried", async ({ page }) => {
  await page.route(
    "**/api/demo",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Demo gerade nicht erreichbar." }),
      }),
    { times: 1 },
  );
  await page.goto("/demo");
  await page.getByRole("button", { name: "Demo starten", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Demo gerade nicht erreichbar.");
  await page.getByRole("button", { name: "Demo starten", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();
});

test("anonymous visitors cannot access private histories or write viewing data", async ({
  page,
}) => {
  for (const path of ["/history", "/watchlist"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Login erforderlich" })).toBeVisible();
  }
  const result = await page.request.post("/graphql", {
    data: { query: '{watchProgressList(userId:"someone"){status}}' },
  });
  expect((await result.json()).errors).toBeTruthy();
});
