export const RATING_UNIQUE_KEY = {
  userId: 1,
  tmdbId: 1,
  mediaType: 1,
  seasonNumber: 1,
} as const;

const LEGACY_RATING_KEY = { userId: 1, tmdbId: 1, mediaType: 1 } as const;

type RatingIndex = {
  name?: string;
  key: Record<string, unknown>;
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: unknown;
};

export interface RatingIndexCollection {
  createIndex(key: typeof RATING_UNIQUE_KEY, options: { unique: true }): Promise<string>;
  indexes(): Promise<RatingIndex[]>;
  dropIndex(name: string): Promise<unknown>;
}

function hasKey(index: RatingIndex, key: Record<string, number>) {
  return (
    Object.keys(index.key).length === Object.keys(key).length &&
    Object.entries(key).every(([field, direction]) => index.key[field] === direction)
  );
}

export async function migrateRatingIndexes(collection: RatingIndexCollection) {
  // Keep uniqueness enforced throughout the migration; never alter rating documents.
  await collection.createIndex(RATING_UNIQUE_KEY, { unique: true });
  const indexes = await collection.indexes();
  if (
    !indexes.some(
      (index) =>
        hasKey(index, RATING_UNIQUE_KEY) &&
        index.unique &&
        !index.sparse &&
        !index.partialFilterExpression,
    )
  )
    throw new Error("Season rating uniqueness could not be verified; legacy indexes were kept.");

  const removed: string[] = [];
  for (const index of indexes) {
    if (
      index.name &&
      index.unique &&
      hasKey(index, LEGACY_RATING_KEY) &&
      !index.sparse &&
      !index.partialFilterExpression
    ) {
      await collection.dropIndex(index.name);
      removed.push(index.name);
    }
  }
  return removed;
}
