import { test, expect, expectNoHorizontalOverflow } from "./fixtures";
import { adminAccount } from "./environment";

test("infinite Browse loading appends all pages without duplicate cards", async ({ page }) => {
  await page.goto("/browse");
  const cards = page.locator("main a.card-hover");
  await expect(cards.first()).toBeVisible();
  for (let index = 0; index < 5; index++) {
    const previous = await cards.count();
    if (previous === 56) break;
    await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
    await expect.poll(() => cards.count()).toBeGreaterThan(previous);
  }
  await expect(page.getByText("Alle passenden Titel geladen.", { exact: true })).toBeVisible();
  const hrefs = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  expect(hrefs.length).toBe(56);
  expect(new Set(hrefs).size).toBe(hrefs.length);
  await expectNoHorizontalOverflow(page);
});

test("language, Austrian streaming and genre filters survive refresh and browser back", async ({
  page,
}) => {
  await page.goto("/browse");
  await page.getByRole("combobox", { name: "Originalsprache" }).selectOption("de");
  await page.getByRole("combobox", { name: "Streamingdienst in Österreich" }).selectOption("8");
  await expect(page).toHaveURL(/language=de.*provider=8/);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Originalsprache" })).toHaveValue("de");
  await expect(page.getByRole("combobox", { name: "Streamingdienst in Österreich" })).toHaveValue(
    "8",
  );
  await page.getByRole("button", { name: "Serien", exact: true }).click();
  await expect(
    page
      .getByRole("combobox", { name: "Genre" })
      .getByRole("option", { name: "Romantik", exact: true }),
  ).toHaveCount(1);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Filme", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectNoHorizontalOverflow(page);
});

test("calendar lists every day of the month, filters Austrian providers and hides drafts", async ({
  page,
}) => {
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Region", exact: true })).toHaveValue("AT");
  await expect(
    page.getByRole("combobox", { name: "Region", exact: true }).getByRole("option"),
  ).toHaveCount(1);
  await expect(page.getByText("1. Oktober", { exact: true })).toBeVisible();
  await expect(page.getByText("31. Oktober", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Dune: Part Two", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Unveroeffentlichter Entwurf", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Netflix", exact: true }).click();
  await expect(page.getByRole("link", { name: "Dune: Part Two", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Netflix", exact: true }).click();
  await page.getByRole("button", { name: "Paramount+", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Dune: Part Two", exact: true }).first(),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("admin selects a movie on the first click and publishes its cinema release to the public calendar", async ({
  page,
}) => {
  await page.goto("/auth");
  await page.getByLabel("E-Mail", { exact: true }).fill(adminAccount.email);
  await page.getByLabel("Passwort", { exact: true }).fill(adminAccount.password);
  await page.getByRole("button", { name: "Einloggen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();
  await page.goto("/admin");
  await page.getByRole("textbox", { name: "Release-Titel suchen" }).fill("matrix");
  await page.getByRole("button", { name: /Matrix.*2020/ }).click();
  await expectNoHorizontalOverflow(page);
  await expect(page.getByText("Ausgewählt:", { exact: false })).toContainText("Matrix");
  await page.getByRole("combobox", { name: "Release-Anbieter" }).selectOption("Kino");
  await expect(page.getByRole("combobox", { name: "Release-Art" })).toHaveValue("CINEMA_RELEASE");
  await page.getByRole("button", { name: "Zum Kalender hinzufügen", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Release-Titel suchen" })).toHaveValue("");
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await page.getByRole("button", { name: "Kino", exact: true }).click();
  await expect(page.getByRole("link", { name: "Matrix", exact: true }).first()).toBeVisible();
});

test("TasteDNA renders the seeded profile and can be recomputed", async ({ demoPage: page }) => {
  await page.goto("/taste-dna");
  await expect(
    page.getByRole("heading", { name: "Dein Filmgeschmack", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lieblingsgenres", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Neu berechnen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Neu berechnen", exact: true })).toBeEnabled();
  await expectNoHorizontalOverflow(page);
});
