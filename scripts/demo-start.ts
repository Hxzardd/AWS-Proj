import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

function run(executable: string, args: string[]) {
  const result = spawnSync(executable, args, { stdio: "inherit", env: { ...process.env, USE_REAL_AWS: "false" } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} ${args[0]} failed. Check the message above.`);
}
if (!existsSync(".env")) {
  const template = readFileSync(".env.example", "utf8")
    .replace('ADMIN_PASSWORD="change-me"', `ADMIN_PASSWORD="${randomBytes(12).toString("base64url")}"`)
    .replace('SESSION_SECRET="generate-a-long-random-string-at-least-32-characters"', `SESSION_SECRET="${randomBytes(32).toString("hex")}"`);
  writeFileSync(".env", template, { flag: "wx" });
  console.log("Created .env with local demo defaults and random secrets. The Settings password is ADMIN_PASSWORD in that file.");
}
process.loadEnvFile(".env");
process.env.USE_REAL_AWS = "false";
run("docker", ["compose", "up", "-d", "--wait", "mysql", "redis"]);
run("docker", ["compose", "stop", "app"]);
run(process.execPath, ["node_modules/prisma/build/index.js", "generate"]);
run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
run(process.execPath, ["--import", "tsx", "prisma/seed.ts"]);
console.log("Demo ready: http://localhost:3000/dashboard/lab — real AWS is disabled.");
run(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3000"]);
