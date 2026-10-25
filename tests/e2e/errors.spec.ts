import { test, expect } from "./fixtures";

test("title loading is announced until its real API response arrives", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/graphql", async (route) => {
    if (route.request().postData()?.includes("details(")) await gate;
    return route.continue();
  });
  try {
    await page.goto("/title/movie/603");
    await expect(page.getByRole("status", { name: "Titel wird geladen" })).toBeVisible();
    release();
    await expect(page.getByRole("heading", { level: 1, name: "Matrix" })).toBeVisible();
  } finally {
    release();
  }
});

test("missing title metadata results in an accessible error state", async ({ page }) => {
  await page.goto("/title/movie/999999999");
  await expect(page.getByRole("alert")).toHaveText("Dieser Titel konnte nicht geladen werden.");
});

test("Browse distinguishes API outages from an empty result and supports retry", async ({
  page,
}) => {
  let failures = 2;
  await page.route("**/graphql", async (route) => {
    if (route.request().postData()?.includes("discoverPage") && failures-- > 0) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ errors: [{ message: "Temporary test outage" }] }),
      });
    }
    return route.continue();
  });
  await page.goto("/browse");
  await expect(page.getByRole("alert")).toContainText("Die Titel konnten nicht geladen werden.");
  await expect(page.getByText("Keine Ergebnisse.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
  await expect(page.locator("main a.card-hover").first()).toBeVisible();
});
