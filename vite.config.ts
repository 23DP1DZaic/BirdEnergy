import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The Firebase SDK dominates the bundle, so give it its own chunk:
        // app code stays small and a change to it no longer invalidates the
        // cached Firebase chunk.
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /[\\/]node_modules[\\/]@?firebase[\\/]/ },
            { name: 'vendor', test: /[\\/]node_modules[\\/]/ },
          ],
        },
      },
    },
  },
})
