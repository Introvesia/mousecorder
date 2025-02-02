import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import react from '@vitejs/plugin-react'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

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
        entry: resolve(__dirname, 'electron/main.ts'),
        vite: {
          build: {
            outDir: 'dist/main',
            emptyOutDir: true,
            rollupOptions: {
              external: ['electron', 'ffmpeg-static', 'fluent-ffmpeg']
            }
          }
        }
      },
      {
        entry: resolve(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            outDir: 'dist/preload',
            emptyOutDir: true,
          }
        },
        onstart(options) {
          options.reload()
        },
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
}) 