import mongoose from "mongoose";
import { config } from "../server/config.js";
import { Rating } from "../server/db/models.js";
import { migrateRatingIndexes } from "../server/db/rating-indexes.js";

if (!config.MONGODB_URI) throw new Error("MONGODB_URI is required.");
try {
  await mongoose.connect(config.MONGODB_URI, { dbName: config.MONGODB_DB, autoIndex: false });
  const removed = await migrateRatingIndexes(Rating.collection);
  console.log(
    `Season-aware uniqueness verified; obsolete rating indexes removed: ${removed.length}`,
  );
} finally {
  await mongoose.disconnect();
}
