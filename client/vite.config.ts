import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), sentryVitePlugin({
    org: "jeanbeanie",
    project: "better-yt-tv"
  })],

  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5179",
        changeOrigin: true
      }
    }
  },

  build: {
    sourcemap: true
  }
});
