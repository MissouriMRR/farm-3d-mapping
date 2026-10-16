import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import cesium from 'vite-plugin-cesium'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so the built site works under any URL prefix (e.g. a private link).
  base: './',
  // Versions the service worker's tile cache per build.
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  plugins: [react(), cesium()],
})
