import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

// Z1: which build is this? The commit and the build time are baked in (`__BUILD__`) and also
// written to `version.json`, which the page fetches past every cache at start: if the server
// has a newer build than the page running, it reloads once (GitHub Pages caches index.html for
// 10 minutes — the owner once checked a fix on the build before it).
const sha = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();
const build = { sha, time: new Date().toISOString() };
const version = (): Plugin => ({
  name: 'version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(build) });
  },
});

// `base: './'` keeps every asset path relative, so the built site works on
// GitHub Pages, Netlify, Vercel or any sub-folder without extra setup.
export default defineConfig({
  base: './',
  plugins: [react(), version()],
  define: { __BUILD__: JSON.stringify(build) },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        qr: resolve(import.meta.dirname, 'qr.html'),
      },
    },
  },
});
