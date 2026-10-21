import mongoose from "mongoose";
import { parseArgs } from "node:util";
import { z } from "zod";
import { config } from "../server/config.js";
import { User } from "../server/db/models.js";
import { USER_ROLES } from "../shared/catalog.js";

const { values } = parseArgs({ options: { email: { type: "string" }, role: { type: "string" } } });
const { email, role } = z
  .object({
    email: z
      .string()
      .email()
      .transform((value) => value.toLowerCase()),
    role: z.enum(USER_ROLES),
  })
  .parse(values);
if (!config.MONGODB_URI) throw new Error("MONGODB_URI is required.");
try {
  await mongoose.connect(config.MONGODB_URI, { dbName: config.MONGODB_DB, autoIndex: false });
  const result = await User.updateOne({ email }, { $set: { role } }, { runValidators: true });
  if (!result.matchedCount) throw new Error("Account not found; create a regular account first.");
  console.log("User role updated.");
} finally {
  await mongoose.disconnect();
}
