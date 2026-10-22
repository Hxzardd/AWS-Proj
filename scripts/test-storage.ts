import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/storage.integration.test.ts"], {
  stdio: "inherit", env: { ...process.env, RUN_STORAGE_TESTS: "1" },
});
process.exitCode = result.status ?? 1;
