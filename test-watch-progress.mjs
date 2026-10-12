import assert from "node:assert/strict";

const baseUrl = "http://localhost:4000";
const email = `progress-${Date.now()}@example.com`;
let cookie = "";

async function post(path, body) {
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
  if (!response.ok || data.errors) {
    throw new Error(JSON.stringify(data.errors ?? data));
  }
  return data;
}

async function graphql(query, variables = {}) {
  return post("/graphql", { query, variables });
}

const auth = await post("/api/register", {
  name: "Progress Test",
  email,
  password: "progress-test",
});

const userId = auth.user.id;
assert.ok(userId);

const movieInput = {
  userId,
  tmdbId: 550,
  mediaType: "movie",
  title: "Fight Club",
  posterPath: null,
  releaseDate: "1999-10-15",
  voteAverage: 8.4,
  status: "COMPLETED",
};

const movieStatus = await graphql(
  `
    mutation SetWatchStatus($input: WatchProgressInput!) {
      setWatchStatus(input: $input) {
        tmdbId
        mediaType
        status
        watchedAt
        watchedEpisodes
      }
    }
  `,
  { input: movieInput },
);

assert.equal(movieStatus.data.setWatchStatus.status, "COMPLETED");
assert.equal(movieStatus.data.setWatchStatus.watchedEpisodes, 1);
assert.ok(movieStatus.data.setWatchStatus.watchedAt);

const tvInput = {
  userId,
  tmdbId: 1396,
  title: "Breaking Bad",
  posterPath: null,
  releaseDate: "2008-01-20",
  voteAverage: 9,
  totalEpisodes: 62,
  seasonNumber: 1,
  episodeNumber: 1,
  episodeTitle: "Pilot",
  airDate: "2008-01-20",
  runtime: 58,
  stillPath: null,
  watched: true,
};

const episodeStatus = await graphql(
  `
    mutation SetEpisodeWatched($input: EpisodeProgressInput!) {
      setEpisodeWatched(input: $input) {
        tmdbId
        mediaType
        status
        totalEpisodes
        watchedEpisodes
      }
    }
  `,
  { input: tvInput },
);

assert.equal(episodeStatus.data.setEpisodeWatched.status, "WATCHING");
assert.equal(episodeStatus.data.setEpisodeWatched.watchedEpisodes, 1);

const list = await graphql(
  `
    query WatchProgressList($userId: String!) {
      watchProgressList(userId: $userId) {
        tmdbId
        mediaType
        status
        watchedEpisodes
      }
    }
  `,
  { userId },
);

assert.equal(list.data.watchProgressList.length, 2);

await graphql(
  `
    mutation RemoveMovie($userId: String!) {
      removeWatchProgress(userId: $userId, tmdbId: 550, mediaType: movie)
    }
  `,
  { userId },
);

await graphql(
  `
    mutation RemoveTv($userId: String!) {
      removeWatchProgress(userId: $userId, tmdbId: 1396, mediaType: tv)
    }
  `,
  { userId },
);

console.log("Watch progress integration test passed");
