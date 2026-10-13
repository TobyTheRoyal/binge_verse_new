const endpoint = process.env.BINGEVERSE_GRAPHQL_URL ?? "http://localhost:4000/graphql";

async function graphql(query, variables = {}, cookie = "") {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

async function login() {
  const email = process.env.BINGEVERSE_TEST_EMAIL;
  const password = process.env.BINGEVERSE_TEST_PASSWORD;
  if (!email || !password) return null;

  const response = await fetch("http://localhost:4000/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

const privateQuery = `
  query TasteProbe {
    tasteProfile {
      ratingCount
      confidence
      genrePreferences { name score observations }
    }
    bingeStats {
      moviesRated
      seriesRated
      episodesWatched
    }
    matchScores(items: [{
      tmdbId: 603,
      mediaType: movie,
      title: "The Matrix",
      voteAverage: 8.2,
      popularity: 80,
      genreIds: [28, 878]
    }]) {
      score
      label
      color
      insufficientData
      reasons
    }
  }
`;

const unauthenticated = await graphql(privateQuery);
if (!unauthenticated.errors?.length) {
  throw new Error("TasteDNA private queries must reject unauthenticated requests.");
}

const cookie = await login();
if (cookie) {
  const authenticated = await graphql(privateQuery, {}, cookie);
  if (authenticated.errors?.length) {
    throw new Error(`Authenticated TasteDNA query failed: ${authenticated.errors[0].message}`);
  }
  const match = authenticated.data.matchScores[0];
  if (match.score != null && (match.score < 0 || match.score > 100)) {
    throw new Error(`Match score out of bounds: ${match.score}`);
  }
  console.log("BingeMatch authenticated probe passed.");
} else {
  console.log(
    "BingeMatch auth isolation passed. Set BINGEVERSE_TEST_EMAIL/PASSWORD for full probe.",
  );
}
