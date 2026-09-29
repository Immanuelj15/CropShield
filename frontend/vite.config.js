import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const BACKEND = process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom service worker (src/sw.js): precache + runtime caching + push/notificationclick handlers
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      },
      includeAssets: ['icons/favicon.png', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'AgriGuard AI',
        short_name: 'AgriGuard',
        description: 'Explainable AI Pest & Crop Disease Early Warning System for Indian Farmers',
        start_url: '/farmer/today',
        display: 'standalone',
        background_color: '#0d5c2f',
        theme_color: '#0d5c2f',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
      // Uploaded receipts / lab reports are served by the backend at /uploads
      '/uploads': {
        target: BACKEND,
        changeOrigin: true,
      },
    }
  }
})
