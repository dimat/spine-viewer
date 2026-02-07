import path from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: path.join(__dirname, 'electron/main.ts')
      }
    }
  },
  preload: {
    build: {
      lib: {
        entry: path.join(__dirname, 'electron/preload.ts')
      }
    }
  },
  renderer: {
    root: 'src',
    build: {
      rollupOptions: {
        input: path.join(__dirname, 'src/index.html')
      }
    },
    plugins: [react()]
  }
})
