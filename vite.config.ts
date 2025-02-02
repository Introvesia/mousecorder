import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import react from '@vitejs/plugin-react'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist/main',
            emptyOutDir: true,
            rollupOptions: {
              external: ['electron', 'path', 'fs', 'url', 'electron-is-dev']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist/preload',
            emptyOutDir: true,
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
    },
  },
}) 