import { MongoMemoryServer } from "mongodb-memory-server-core";
import { runTests } from "./test-runner.js";

const database = process.env.TEST_MONGODB_URI ? null : await MongoMemoryServer.create();
try {
  process.exitCode = await runTests(process.env.TEST_MONGODB_URI ?? database!.getUri());
} finally {
  await database?.stop();
}
