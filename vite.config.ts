import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The API is a separate app (../reel-trend-poc). In dev and preview, /api is forwarded to it,
// so the browser only talks to this server. Point API_PROXY_TARGET elsewhere if it isn't on :8000.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const proxy = { '/api': env.API_PROXY_TARGET || 'http://127.0.0.1:8000' };
  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
  };
});
