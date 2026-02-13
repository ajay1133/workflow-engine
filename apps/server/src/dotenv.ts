import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

function findUp(startDir: string, relativePath: string, maxDepth = 6): string | null {
  let dir = startDir;
  for (let i = 0; i <= maxDepth; i++) {
    const candidate = path.resolve(dir, relativePath);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadDotenv(): void {
  const override = process.env.NODE_ENV !== 'production';

  const debug = process.env.WF_DOTENV_DEBUG === '1';

  const tryLoad = (envPath: string): boolean => {
    try {
      const res = dotenv.config({ path: envPath, override });
      if (res.error) return false;
      if (debug) {
        // eslint-disable-next-line no-console
        console.log(`[dotenv] loaded ${envPath} (PORT=${process.env.PORT ?? ''})`);
      }
      return true;
    } catch {
      return false;
    }
  };

  // Extra-robust fallback: read and parse manually.
  // This avoids rare cases where dotenv.config fails silently due to watcher/cwd issues.
  const tryLoadManual = (envPath: string): boolean => {
    try {
      if (!fs.existsSync(envPath)) return false;
      const raw = fs.readFileSync(envPath);
      const parsed = dotenv.parse(raw);
      for (const [key, value] of Object.entries(parsed)) {
        if (override || process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      if (debug) {
        // eslint-disable-next-line no-console
        console.log(`[dotenv] manually loaded ${envPath} (PORT=${process.env.PORT ?? ''})`);
      }
      return true;
    } catch {
      return false;
    }
  };

  // Prefer the per-app env file: apps/server/.env
  // Note: do NOT use __dirname here. Some dev runners (e.g. ts-node-dev) execute
  // transpiled JS from a temp folder, which makes __dirname unstable.
  const serverEnvPath = findUp(process.cwd(), 'apps/server/.env') ?? findUp(process.cwd(), '.env');
  if (serverEnvPath && (tryLoad(serverEnvPath) || tryLoadManual(serverEnvPath))) {
    return;
  }

  // Next try the current working directory (useful if server is started from apps/server)
  const cwdEnvPath = path.resolve(process.cwd(), '.env');
  if (tryLoad(cwdEnvPath) || tryLoadManual(cwdEnvPath)) {
    return;
  }

  // Fallback to repo root .env (useful for older setups / docker compose workflows)
  const rootEnvPath = findUp(process.cwd(), '.env');
  if (rootEnvPath) {
    tryLoad(rootEnvPath) || tryLoadManual(rootEnvPath);
  }
}
