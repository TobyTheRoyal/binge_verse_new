import {
  parse,
  visit,
  valueFromASTUntyped,
  Kind,
  type DocumentNode,
  type SelectionSetNode,
} from "graphql";
import { costLimitPlugin } from "@escape.tech/graphql-armor-cost-limit";
import { maxDepthPlugin } from "@escape.tech/graphql-armor-max-depth";
import { maxAliasesPlugin } from "@escape.tech/graphql-armor-max-aliases";
import { maxTokensPlugin } from "@escape.tech/graphql-armor-max-tokens";
import { config } from "../config.js";
import { PublicError } from "../errors.js";

export const graphqlProtectionPlugins = () => [
  maxTokensPlugin({ n: config.GRAPHQL_MAX_TOKENS }),
  maxDepthPlugin({ n: config.GRAPHQL_MAX_DEPTH }),
  maxAliasesPlugin({ n: config.GRAPHQL_MAX_ALIASES }),
  costLimitPlugin({ maxCost: config.GRAPHQL_MAX_COST }),
];

function validateValue(value: unknown, key = "", depth = 0): void {
  if (depth > config.GRAPHQL_MAX_DEPTH)
    throw new PublicError("Eingaben sind zu tief verschachtelt.");
  if (Array.isArray(value)) {
    if (value.length > config.GRAPHQL_MAX_ARRAY_ITEMS)
      throw new PublicError("Zu viele Einträge in einer Anfrage.");
    value.forEach((entry) => validateValue(entry, key, depth + 1));
  } else if (value && typeof value === "object") {
    for (const [name, entry] of Object.entries(value)) validateValue(entry, name, depth + 1);
  } else if (typeof value === "string") {
    if (value.length > 10000 || (key === "query" && value.length > 120))
      throw new PublicError("Eingabetext ist zu lang.");
  } else if (typeof value === "number") {
    const min = ["seasonNumber", "offset", "totalEpisodes", "watchedAt"].includes(key) ? 0 : 1;
    if (
      [
        "id",
        "tmdbId",
        "tvId",
        "seasonNumber",
        "episodeNumber",
        "totalEpisodes",
        "page",
        "limit",
        "offset",
      ].includes(key) &&
      (!Number.isInteger(value) || value < min)
    )
      throw new PublicError("Ungültige ID, Seitenzahl oder Anzahl.");
    if (key === "page" && value > 500) throw new PublicError("Seitenzahl ist zu hoch.");
    if (key === "limit" && value > config.GRAPHQL_MAX_ARRAY_ITEMS)
      throw new PublicError("Limit ist zu hoch.");
    if (key === "offset" && value > 5000) throw new PublicError("Offset ist zu hoch.");
  }
}

function rootFields(
  document: DocumentNode,
  selection: SelectionSetNode,
  seen = new Set<string>(),
): Array<string> {
  const fields: string[] = [];
  for (const node of selection.selections) {
    if (node.kind === Kind.FIELD) fields.push(node.name.value);
    else if (node.kind === Kind.INLINE_FRAGMENT)
      fields.push(...rootFields(document, node.selectionSet, seen));
    else if (!seen.has(node.name.value)) {
      seen.add(node.name.value);
      const fragment = document.definitions.find(
        (item) => item.kind === Kind.FRAGMENT_DEFINITION && item.name.value === node.name.value,
      );
      if (fragment?.kind === Kind.FRAGMENT_DEFINITION)
        fields.push(...rootFields(document, fragment.selectionSet, seen));
    }
  }
  return fields;
}

export function inspectGraphqlRequest(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new PublicError("Eine einzelne GraphQL-Anfrage wird erwartet.");
  const { query, variables } = body as { query?: unknown; variables?: unknown };
  if (typeof query !== "string" || query.length > config.GRAPHQL_MAX_QUERY_LENGTH)
    throw new PublicError("Ungültige oder zu lange GraphQL-Anfrage.");
  if (variables != null && (typeof variables !== "object" || Array.isArray(variables)))
    throw new PublicError("Ungültige GraphQL-Variablen.");
  validateValue(variables);
  let document: DocumentNode;
  try {
    document = parse(query, { maxTokens: config.GRAPHQL_MAX_TOKENS });
  } catch {
    throw new PublicError("Ungültige oder zu umfangreiche GraphQL-Anfrage.");
  }
  const operations = document.definitions.filter((node) => node.kind === Kind.OPERATION_DEFINITION);
  if (operations.length !== 1)
    throw new PublicError("Genau eine Operation pro Anfrage ist erlaubt.");
  const operation = operations[0];
  const effectiveVariables: Record<string, unknown> = {
    ...(variables as Record<string, unknown> | undefined),
  };
  // Defaults are inputs too; omitting variables must not bypass resource limits.
  for (const definition of operation.variableDefinitions ?? []) {
    const name = definition.variable.name.value;
    if (!Object.hasOwn(effectiveVariables, name) && definition.defaultValue)
      effectiveVariables[name] = valueFromASTUntyped(definition.defaultValue);
  }
  validateValue(effectiveVariables);
  const fields = rootFields(document, operation.selectionSet);
  const limit = operation.operation === "mutation" ? 1 : config.GRAPHQL_MAX_ROOT_FIELDS;
  if (operation.operation === "subscription" || fields.length > limit)
    throw new PublicError("Zu viele Operationen in einer Anfrage.");
  if (config.isProduction && fields.some((field) => ["__schema", "__type"].includes(field)))
    throw new PublicError("Schema-Introspektion ist deaktiviert.");
  let authEmail = "";
  visit(document, {
    Field(node) {
      for (const arg of node.arguments ?? []) {
        const value: unknown = valueFromASTUntyped(arg.value, effectiveVariables);
        validateValue(value, arg.name.value);
        if (
          ["login", "register"].includes(node.name.value) &&
          value &&
          typeof value === "object" &&
          "email" in value &&
          typeof value.email === "string"
        )
          authEmail = value.email;
      }
    },
  });
  return {
    authentication: fields.some((field) => ["login", "register"].includes(field)),
    authEmail,
  };
}
