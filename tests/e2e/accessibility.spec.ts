import AxeBuilder from "@axe-core/playwright";
import { test, expect, expectNoHorizontalOverflow } from "./fixtures";

test("demo entry has no automated WCAG A/AA violations", async ({ page }, testInfo) => {
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "Demo starten", exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await testInfo.attach("accessibility", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results.violations).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

for (const [path, heading] of [
  ["/history", "Bewertungs-Historie"],
  ["/watchlist", "Deine Watchlist"],
  ["/browse", "Filme durchstöbern"],
  ["/calendar", "BingeCalendar"],
  ["/title/tv/288673", "The Gentlemen"],
  ["/taste-dna", "Dein Filmgeschmack"],
]) {
  test(`authenticated ${path} has no automated WCAG A/AA violations`, async ({
    demoPage: page,
  }, testInfo) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    if (path === "/history")
      await expect(
        page.getByRole("button", { name: "Bewertung für Inception löschen" }),
      ).toHaveCount(1);
    if (path === "/watchlist")
      await expect(
        page.getByRole("button", { name: "Oppenheimer aus Watchlist entfernen" }),
      ).toHaveCount(1);
    if (path === "/title/tv/288673")
      await expect(page.getByRole("button", { name: "S1E1 als gesehen markieren" })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await testInfo.attach("accessibility", {
      body: JSON.stringify(results, null, 2),
      contentType: "application/json",
    });
    expect(results.violations).toEqual([]);
    await expectNoHorizontalOverflow(page);
  });
}
