import { test, expect } from "./fixtures";

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`demo entry visual baseline: ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/demo");
    await expect(page.getByRole("button", { name: "Demo starten", exact: true })).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`demo-${viewport.name}.png`);
  });
}
