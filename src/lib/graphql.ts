import { GraphQLClient } from "graphql-request";

const graphqlUrl = typeof window === "undefined" ? "/graphql" : `${window.location.origin}/graphql`;

export const graphqlClient = new GraphQLClient(graphqlUrl, {
  fetch: (url, options) =>
    fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        ...options?.headers,
        "Content-Type": "application/json",
      },
    }),
});
