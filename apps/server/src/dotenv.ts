import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export function loadDotenv(): void {
  // Prefer the per-app env file: apps/server/.env
  // (process.cwd() is apps/server when running dev scripts from that workspace.)
  const localEnvPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
    return;
  }

  // Fallback to repo root .env (useful for older setups / docker compose workflows)
  // Repo root is three levels up from apps/server/src or apps/server/dist
  const rootEnvPath = path.resolve(__dirname, '../../..', '.env');
  if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
  }
}
