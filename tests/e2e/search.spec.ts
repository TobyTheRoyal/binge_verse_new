import { test, expect, expectNoHorizontalOverflow } from "./fixtures";

test("search suggestions open a movie on the first pointer click", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Filme und Serien suchen" }).fill("inception");
  await page.getByRole("button", { name: /Inception.*2010|Inception.*2020/ }).click();
  await expect(page).toHaveURL(/\/title\/movie\/27205$/);
  await expect(page.getByRole("heading", { level: 1, name: "Inception" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Filme und Serien suchen" })).toHaveValue("");
  await expectNoHorizontalOverflow(page);
});

test("partial title suggestions support keyboard selection and series navigation", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Filme und Serien suchen" });
  await input.fill("gent");
  const suggestion = page.getByRole("button", { name: /The Gentlemen/ });
  await expect(suggestion).toBeVisible();
  await input.press("ArrowDown");
  await expect(suggestion).toBeFocused();
  await suggestion.press("Enter");
  await expect(page).toHaveURL(/\/title\/tv\/288673$/);
  await expect(page.getByRole("heading", { level: 1, name: "The Gentlemen" })).toBeVisible();
});

test("Escape closes suggestions and submitting searches navigates to Browse", async ({ page }) => {
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Filme und Serien suchen" });
  await input.fill("matrix");
  await expect(page.getByRole("button", { name: /Matrix.*2020/ })).toBeVisible();
  await input.press("Escape");
  await expect(page.locator("#header-search-results")).toHaveCount(0);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/browse\?q=matrix$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText('Ergebnisse für "matrix"');
});

test("empty searches and unknown routes have useful states", async ({ page }) => {
  await page.goto("/browse?q=doesnotexistxyz");
  await expect(
    page.getByText(/Keine Treffer|Keine Ergebnisse|Keine passenden/).first(),
  ).toBeVisible();
  await page.goto("/not-a-page");
  await expect(page.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
  await page.getByRole("link", { name: "Zur Startseite", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("Browse suggestions also navigate directly to the selected title", async ({ page }) => {
  await page.goto("/browse");
  await page.getByRole("textbox", { name: "Titel suchen", exact: true }).fill("matrix");
  await page.getByRole("button", { name: /Matrix.*2020/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Matrix" })).toBeVisible();
});
