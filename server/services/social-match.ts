import { LRUCache } from "lru-cache";
import { Rating } from "../db/models.js";
import { config } from "../config.js";
import type { MediaType } from "../../shared/catalog.js";

export const SOCIAL_MATCH_POLICY = Object.freeze({
  minimumOverlap: 5,
  fullOverlap: 10,
  minimumSimilarity: 0.5,
  maximumNeighbors: 25,
  maximumOwnRatings: 500,
  cacheTtlMs: 60000,
});
type Neighbor = { _id: string; similarity: number; overlap: number };
type Item = { id?: number; tmdbId?: number; mediaType?: MediaType; media_type?: MediaType };
type AggregateRating = {
  _id: { tmdbId: number; mediaType: MediaType };
  total: number;
  weight: number;
  count: number;
};
export type MatchSocialSignal = {
  communityScore: number | null;
  communityRatingCount: number;
  similarUserScore: number | null;
  similarUserCount: number;
};
const keyFor = (mediaType: string, id: number) => `${mediaType}:${id}`;

export function socialScore(total: number, weight: number, count: number, fullWeightAt: number) {
  const average = total / Math.max(weight, 0.01);
  const confidence = Math.max(0.25, Math.min(count / fullWeightAt, 1));
  return Math.round(Math.max(0, Math.min(100, 50 + (average * 10 - 50) * confidence)));
}

async function findNeighbors(userId: string): Promise<Neighbor[]> {
  const ratings = await Rating.find({ userId, seasonNumber: null })
    .sort({ updatedAt: -1 })
    .limit(SOCIAL_MATCH_POLICY.maximumOwnRatings)
    .select("tmdbId mediaType rating")
    .lean();
  if (ratings.length < SOCIAL_MATCH_POLICY.minimumOverlap) return [];
  const pairs = ratings.map((rating) => ({ tmdbId: rating.tmdbId, mediaType: rating.mediaType }));
  const branches = ratings.map((rating) => ({
    case: {
      $and: [{ $eq: ["$tmdbId", rating.tmdbId] }, { $eq: ["$mediaType", rating.mediaType] }],
    },
    then: Number(rating.rating),
  }));
  return Rating.aggregate<Neighbor>([
    { $match: { userId: { $ne: userId }, seasonNumber: null, $or: pairs } },
    {
      $group: {
        _id: "$userId",
        overlap: { $sum: 1 },
        difference: {
          $sum: { $abs: { $subtract: ["$rating", { $switch: { branches, default: 0 } }] } },
        },
      },
    },
    { $match: { overlap: { $gte: SOCIAL_MATCH_POLICY.minimumOverlap } } },
    {
      $set: {
        similarity: {
          $multiply: [
            {
              $max: [
                0,
                { $subtract: [1, { $divide: ["$difference", { $multiply: ["$overlap", 10] }] }] },
              ],
            },
            { $min: [1, { $divide: ["$overlap", SOCIAL_MATCH_POLICY.fullOverlap] }] },
          ],
        },
      },
    },
    { $match: { similarity: { $gte: SOCIAL_MATCH_POLICY.minimumSimilarity } } },
    { $sort: { similarity: -1, overlap: -1, _id: 1 } },
    { $limit: SOCIAL_MATCH_POLICY.maximumNeighbors },
  ]).option({ maxTimeMS: config.DATABASE_MAX_TIME_MS });
}

const neighbors = new LRUCache<string, Neighbor[]>({
  max: config.METADATA_CACHE_MAX,
  ttl: SOCIAL_MATCH_POLICY.cacheTtlMs,
  fetchMethod: (userId) => findNeighbors(userId),
});
export function invalidateSocialMatches(userId: string) {
  neighbors.delete(userId);
}

export async function buildMatchSocialContext(userId: string, items: Item[]) {
  const unique = new Map<string, { mediaType: MediaType; tmdbId: number }>();
  for (const item of items) {
    const mediaType = item.mediaType ?? item.media_type;
    const tmdbId = Number(item.tmdbId ?? item.id);
    if (mediaType && Number.isSafeInteger(tmdbId) && tmdbId > 0)
      unique.set(keyFor(mediaType, tmdbId), { mediaType, tmdbId });
  }
  if (!unique.size) return { signals: new Map<string, MatchSocialSignal>(), similarUserCount: 0 };
  const similarUsers = (await neighbors.fetch(userId)) ?? [];
  const branches = similarUsers.map((user) => ({
    case: { $eq: ["$userId", user._id] },
    then: user.similarity,
  }));
  const [result] = await Rating.aggregate<{
    community: AggregateRating[];
    similar: AggregateRating[];
  }>([
    { $match: { userId: { $ne: userId }, seasonNumber: null, $or: [...unique.values()] } },
    {
      $facet: {
        community: [
          {
            $group: {
              _id: { tmdbId: "$tmdbId", mediaType: "$mediaType" },
              total: { $sum: "$rating" },
              count: { $sum: 1 },
              weight: { $sum: 1 },
            },
          },
        ],
        similar: [
          { $match: { userId: { $in: similarUsers.map((user) => user._id) } } },
          { $set: { weight: branches.length ? { $switch: { branches, default: 0 } } : 0 } },
          {
            $group: {
              _id: { tmdbId: "$tmdbId", mediaType: "$mediaType" },
              total: { $sum: { $multiply: ["$rating", "$weight"] } },
              weight: { $sum: "$weight" },
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]).option({ maxTimeMS: config.DATABASE_MAX_TIME_MS });
  const community = new Map(
    (result?.community ?? []).map((rating) => [
      keyFor(rating._id.mediaType, rating._id.tmdbId),
      rating,
    ]),
  );
  const similar = new Map(
    (result?.similar ?? []).map((rating) => [
      keyFor(rating._id.mediaType, rating._id.tmdbId),
      rating,
    ]),
  );
  const signals = new Map<string, MatchSocialSignal>();
  for (const key of unique.keys()) {
    const average = community.get(key);
    const personal = similar.get(key);
    signals.set(key, {
      communityScore: average ? socialScore(average.total, average.weight, average.count, 8) : null,
      communityRatingCount: average?.count ?? 0,
      similarUserScore: personal
        ? socialScore(personal.total, personal.weight, personal.count, 5)
        : null,
      similarUserCount: personal?.count ?? 0,
    });
  }
  return { signals, similarUserCount: similarUsers.length };
}
