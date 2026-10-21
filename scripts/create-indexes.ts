import mongoose from "mongoose";
import { config } from "../server/config.js";
import * as models from "../server/db/models.js";

if (!config.MONGODB_URI) throw new Error("MONGODB_URI is required.");
try {
  await mongoose.connect(config.MONGODB_URI, { dbName: config.MONGODB_DB, autoIndex: false });
  for (const [name, model] of Object.entries(models)) {
    await model.createIndexes();
    console.log(`Indexes ensured: ${name}`);
  }
} finally {
  await mongoose.disconnect();
}
