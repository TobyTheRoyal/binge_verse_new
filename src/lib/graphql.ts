import { GraphQLClient } from "graphql-request";

// Use absolute URL for graphql-request v7 compatibility in browser
const graphqlUrl = typeof window !== "undefined" 
  ? `${window.location.protocol}//${window.location.host}/graphql`
  : "/graphql";

export const graphqlClient = new GraphQLClient(graphqlUrl);
