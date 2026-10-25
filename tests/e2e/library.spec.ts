import { test, expect, graphql, userId } from "./fixtures";

type Progress = {
  watchProgress: {
    status: string;
    watchedEpisodes: number;
    nextEpisode: { seasonNumber: number; episodeNumber: number } | null;
  };
};
const progressQuery =
  "query($id:String!,$title:Int!){watchProgress(userId:$id,tmdbId:$title,mediaType:tv){status watchedEpisodes nextEpisode{seasonNumber episodeNumber}}}";

test("a half-star movie rating persists, completes the title and removes it from the watchlist", async ({
  demoPage: page,
}) => {
  await page.goto("/title/movie/603");
  await page.getByRole("button", { name: "Zur Watchlist", exact: true }).click();
  await expect(page.getByRole("button", { name: /In Watchlist|Auf Watchlist/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Deine Bewertung: 7.5 von 10 Sternen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Deine Bewertung: 7.5 von 10 Sternen", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Watch Status", exact: true })).toHaveValue(
    "COMPLETED",
  );
  await expect(page.getByRole("button", { name: "Zur Watchlist", exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Deine Bewertung: 7.5 von 10 Sternen", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/history");
  await expect(
    page.getByRole("button", { name: "Bewertung für Matrix löschen", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Bewertung für Matrix löschen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Bewertung für Matrix löschen", exact: true }),
  ).toHaveCount(0);
});

test("movies can be completed without submitting any rating", async ({ demoPage: page }) => {
  await page.goto("/title/movie/603");
  await page.getByRole("combobox", { name: "Watch Status", exact: true }).selectOption("COMPLETED");
  await expect(page.getByRole("combobox", { name: "Watch Status", exact: true })).toHaveValue(
    "COMPLETED",
  );
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Watch Status", exact: true })).toHaveValue(
    "COMPLETED",
  );
  const data = await graphql<{ ratings: Array<{ tmdbId: number }> }>(
    page.request,
    "query($id:String!){ratings(userId:$id){tmdbId}}",
    { id: await userId(page) },
  );
  expect(data.ratings.some((rating) => rating.tmdbId === 603)).toBe(false);
});

test("watchlist additions are unique and removals persist", async ({ demoPage: page }) => {
  const id = await userId(page);
  const add = "mutation($input:SavedItemInput!){addWatchlist(input:$input){tmdbId}}";
  for (let index = 0; index < 2; index++) {
    await graphql(page.request, add, {
      input: { userId: id, tmdbId: 603, mediaType: "movie", title: "Matrix" },
    });
  }
  await page.goto("/watchlist");
  await expect(page.getByRole("button", { name: "Matrix aus Watchlist entfernen" })).toHaveCount(1);
  await page.getByRole("button", { name: "Matrix aus Watchlist entfernen" }).click();
  await expect(page.getByRole("button", { name: "Matrix aus Watchlist entfernen" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Matrix aus Watchlist entfernen" })).toHaveCount(0);
});

test("two season ratings persist independently and the history shows one series average", async ({
  demoPage: page,
}) => {
  await page.goto("/title/tv/288673");
  const first = page.getByRole("button", { name: "Staffel 1: 7.5 von 10 Sternen", exact: true });
  const second = page.getByRole("button", { name: "Staffel 2: 9.5 von 10 Sternen", exact: true });
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  // The star is optimistic; wait for persisted progress before testing a hard reload.
  await expect(page.getByRole("combobox", { name: "Watch Status", exact: true })).toHaveValue(
    "COMPLETED",
  );
  await page.reload();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Watch Status", exact: true })).toHaveValue(
    "COMPLETED",
  );
  await page.goto("/history");
  await expect(
    page.getByRole("button", { name: "Bewertung für The Gentlemen löschen" }),
  ).toHaveCount(1);
  const history = page
    .getByRole("button", { name: "Bewertung für The Gentlemen löschen" })
    .locator("..");
  await expect(history).toContainText("8.5/10");
  await page.getByRole("button", { name: "Bewertung für The Gentlemen löschen" }).click();
  await expect(
    page.getByRole("button", { name: "Bewertung für The Gentlemen löschen" }),
  ).toHaveCount(0);
  const progress = await graphql<Progress>(page.request, progressQuery, {
    id: await userId(page),
    title: 288673,
  });
  expect(progress.watchProgress.watchedEpisodes).toBe(4);
});

test("individual and bulk episode tracking survive reloads and update Continue Watching", async ({
  demoPage: page,
}) => {
  await page.goto("/title/tv/288673");
  const first = page.getByRole("button", { name: "S1E1 als gesehen markieren", exact: true });
  await first.click();
  await expect(page.getByRole("button", { name: "S1E1 als ungesehen markieren" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "S1E1 als ungesehen markieren" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Staffel gesehen", exact: true }).click();
  await expect(page.getByText("2/2 verfügbare Episoden gesehen")).toBeVisible();
  await page.goto("/");
  const continuing = page
    .getByRole("heading", { name: "Weiter schauen", exact: true })
    .locator("..")
    .locator("..");
  await expect(continuing.getByRole("link", { name: /The Gentlemen.*S2E1/ })).toBeVisible();
  await page.goto("/title/tv/288673");
  await page.getByRole("button", { name: "Staffel 2", exact: true }).click();
  await expect(page.getByText("Zukunfts-Spoiler", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "S2E3 als gesehen markieren" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Staffel 0", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Staffel gesehen", exact: true }).click();
  await expect(page.getByText("2/2 verfügbare Episoden gesehen")).toBeVisible();
  await page.getByRole("button", { name: "zurücksetzen", exact: true }).click();
  await expect(page.getByText("0/2 verfügbare Episoden gesehen")).toBeVisible();
  const progress = await graphql<Progress>(page.request, progressQuery, {
    id: await userId(page),
    title: 288673,
  });
  expect(progress.watchProgress.watchedEpisodes).toBe(2);
  expect(progress.watchProgress.nextEpisode).toEqual({ seasonNumber: 2, episodeNumber: 1 });
});

test("failed rating requests show an error and roll back the optimistic selection", async ({
  demoPage: page,
}) => {
  await page.goto("/title/movie/603");
  await expect(
    page.getByRole("button", { name: "Deine Bewertung: 7.5 von 10 Sternen", exact: true }),
  ).toBeVisible();
  await page.route("**/graphql", async (route) => {
    if (route.request().postData()?.includes("rateMovie"))
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ errors: [{ message: "Bewertung nicht gespeichert." }] }),
      });
    return route.fallback();
  });
  await page
    .getByRole("button", { name: "Deine Bewertung: 7.5 von 10 Sternen", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Die Bewertung konnte nicht gespeichert werden.",
  );
  await expect(
    page.getByRole("button", { name: "Deine Bewertung: 7.5 von 10 Sternen", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});
