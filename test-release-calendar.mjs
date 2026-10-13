import assert from "node:assert/strict";

const baseUrl = "http://localhost:4000";
const email = `release-calendar-${Date.now()}@example.com`;
let cookie = "";

async function post(path, body, { allowGraphQLErrors = false } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];

  const data = await response.json();
  if (!response.ok || (data.errors && !allowGraphQLErrors)) {
    throw new Error(JSON.stringify(data.errors ?? data));
  }
  return data;
}

async function graphql(query, variables = {}, options) {
  return post("/graphql", { query, variables }, options);
}

const publicCalendar = await graphql(`
  query PublicCalendar {
    releaseEvents(filter: { region: "AT", limit: 5 }) {
      total
      items {
        id
        title
        publicationStatus
      }
    }
  }
`);

assert.equal(typeof publicCalendar.data.releaseEvents.total, "number");
assert.ok(Array.isArray(publicCalendar.data.releaseEvents.items));
for (const item of publicCalendar.data.releaseEvents.items) {
  assert.equal(item.publicationStatus, "PUBLISHED");
}

const auth = await post("/api/register", {
  name: "Release Calendar Test",
  email,
  password: "release-calendar-test",
});

assert.ok(auth.user.id);
assert.equal(auth.user.isAdmin, false);

const watchlistCalendar = await graphql(
  `
    query WatchlistCalendar($userId: String!) {
      watchlistReleaseEvents(userId: $userId, region: "AT") {
        id
        title
      }
    }
  `,
  { userId: auth.user.id },
);

assert.ok(Array.isArray(watchlistCalendar.data.watchlistReleaseEvents));

const deniedAdminMutation = await graphql(
  `
    mutation CreateReleaseEvent($input: ReleaseEventInput!) {
      createReleaseEvent(input: $input) {
        id
      }
    }
  `,
  {
    input: {
      tmdbId: 999999,
      mediaType: "movie",
      title: "Unauthorized Release",
      provider: "Kino",
      region: "AT",
      releaseDate: "2027-01-01",
      datePrecision: "EXACT",
      releaseType: "CINEMA_RELEASE",
      publicationStatus: "DRAFT",
      confirmationStatus: "UNCONFIRMED",
    },
  },
  { allowGraphQLErrors: true },
);

assert.ok(deniedAdminMutation.errors?.length);
assert.equal(deniedAdminMutation.data?.createReleaseEvent ?? null, null);

console.log("Release calendar authorization test passed");
