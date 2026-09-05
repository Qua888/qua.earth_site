import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('.', import.meta.url));
const siteRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: sourceRoot,
  base: '/',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: siteRoot,
    assetsDir: 'assets',
    emptyOutDir: false,
  },
});
