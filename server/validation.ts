import { z } from "zod";
import { MEDIA_TYPES } from "../shared/catalog.js";
import { PublicError } from "./errors.js";

const assetPath = z
  .string()
  .max(512)
  .regex(/^\/[a-zA-Z0-9_.-]+$/)
  .nullable()
  .optional()
  .default(null);
const savedMediaSchema = z.object({
  userId: z.string().min(1).max(100),
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(MEDIA_TYPES),
  title: z.string().trim().min(1).max(300),
  posterPath: assetPath,
  releaseDate: z.string().date().nullable().optional().default(null),
  voteAverage: z.number().finite().min(0).max(10).optional().default(0),
});

export function validateSavedMedia(input: unknown) {
  const result = savedMediaSchema.safeParse(input);
  if (!result.success) throw new PublicError("Ungültige Titeldaten.");
  return result.data;
}
