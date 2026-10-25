import { runTests } from "./test-runner.js";

process.exitCode = await runTests();
