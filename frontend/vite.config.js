import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.png', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'AgriGuard',
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
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/api/v1/predict-today') || url.pathname.includes('/api/v1/predict-location'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'agriguard-today-warnings',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/api/v1/pests-diseases') || url.pathname.includes('/api/v1/advisories'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'agriguard-advisory-library',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'style' || request.destination === 'script' || request.destination === 'worker' || request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'agriguard-app-shell',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
