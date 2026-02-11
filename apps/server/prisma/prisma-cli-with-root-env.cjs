const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

// Ensure Prisma CLI sees the same env vars as the server.
// Prefer apps/server/.env; fall back to repo root .env if you provide one explicitly.
const serverEnvPath = path.resolve(__dirname, "..", ".env");
const rootEnvPath = path.resolve(__dirname, "..", "..", "..", ".env");

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = require("dotenv");
  if (fs.existsSync(serverEnvPath)) {
    dotenv.config({ path: serverEnvPath });
  } else if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
  } else {
    // Prisma will fail later if DATABASE_URL is missing; this message makes it clearer.
    // Do not exit here to allow env vars to come from the shell/CI.
    console.warn(
      `[prisma] No .env found at ${serverEnvPath} or ${rootEnvPath}; using process env only.`
    );
  }
} catch {
  // If dotenv isn't available for some reason, continue with process env.
}

const args = process.argv.slice(2);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const prismaBin = path.resolve(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma"
);

const spawnOpts = {
  stdio: "inherit",
  env: process.env,
  cwd: path.resolve(__dirname, ".."), // apps/server
  shell: false,
};

let result;
if (fs.existsSync(prismaBin)) {
  result = spawnSync(prismaBin, args, spawnOpts);
} else {
  // Fallback if node_modules is not hoisted as expected.
  result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", ...args], {
    ...spawnOpts,
    shell: true,
  });
}

process.exit(result.status ?? 1);
