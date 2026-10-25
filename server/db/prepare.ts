import * as models from "./models.js";
import { migrateRatingIndexes } from "./rating-indexes.js";

export async function prepareDatabase() {
  for (const [name, model] of Object.entries(models)) {
    await model.createIndexes();
    console.log(`Indexes ensured: ${name}`);
  }
  const removed = await migrateRatingIndexes(models.Rating.collection);
  console.log(`Obsolete title-only rating indexes removed: ${removed.length}`);
}
