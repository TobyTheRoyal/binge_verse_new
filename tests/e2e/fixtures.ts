import { readFile } from "node:fs/promises";
import { test as base, expect, type Page, type APIRequestContext } from "@playwright/test";
import { e2eOrigin, e2ePort, testDate } from "./environment";

const poster = await readFile(new URL("../fixtures/poster.svg", import.meta.url));
const font = await readFile(
  new URL(
    "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
    import.meta.url,
  ),
);

export const test = base.extend<{ demoPage: Page; cleanBrowser: void }>({
  cleanBrowser: [
    async ({ context, page }, runFixture) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await context.route(
        new RegExp(`^https?://(?!127\\.0\\.0\\.1:${e2ePort}/)`),
        async (route) => {
          const url = new URL(route.request().url());
          if (url.hostname === "image.tmdb.org")
            return route.fulfill({ contentType: "image/svg+xml", body: poster });
          if (url.hostname === "fonts.googleapis.com")
            return route.fulfill({
              contentType: "text/css",
              body: "@font-face{font-family:Inter;font-style:normal;font-weight:100 900;src:url(https://fonts.gstatic.com/binge-test.woff2) format('woff2')}",
            });
          if (url.hostname === "fonts.gstatic.com")
            return route.fulfill({ contentType: "font/woff2", body: font });
          return route.abort("blockedbyclient");
        },
      );
      await page.clock.setFixedTime(new Date(testDate));
      await runFixture();
      expect(pageErrors, "No uncaught browser errors").toEqual([]);
    },
    { auto: true },
  ],
  demoPage: async ({ page }, runFixture) => {
    await startDemo(page);
    await runFixture(page);
  },
});

export { expect };

export async function startDemo(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Demo starten", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abmelden", exact: true })).toBeVisible();
  await expect(page).toHaveURL(`${e2eOrigin}/`);
  await expect(page.getByRole("heading", { name: "Weiter schauen", exact: true })).toBeVisible();
}

export async function graphql<T>(
  request: APIRequestContext,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await request.post(`${e2eOrigin}/graphql`, { data: { query, variables } });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
  return body.data as T;
}

export async function userId(page: Page): Promise<string> {
  return (await (await page.request.get(`${e2eOrigin}/api/me`)).json()).user.id;
}

export async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}
