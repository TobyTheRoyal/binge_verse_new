import mongoose from "mongoose";
import { config } from "../server/config.js";
import { prepareDatabase } from "../server/db/prepare.js";

if (!config.MONGODB_URI) throw new Error("MONGODB_URI is required.");
try {
  await mongoose.connect(config.MONGODB_URI, { dbName: config.MONGODB_DB, autoIndex: false });
  await prepareDatabase();
} finally {
  await mongoose.disconnect();
}
