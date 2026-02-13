import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Keep client env separate: load from apps/web/.env*
  const envDir = path.resolve(__dirname);
  const env = loadEnv(mode, envDir, '');

  return {
    plugins: [react()],
    envDir,
    define: {
      __VITE_API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL ?? ''),
    },
    server: {
      port: 5173,
      watch:
        process.platform === 'win32'
          ? {
              usePolling: true,
              interval: 100,
            }
          : undefined,
    },
  };
});
