import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/restaurant/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        lang: 'fr-BE',
        name: 'Restaurant',
        short_name: 'Restaurant',
        description: 'Application de prise de commandes',
        start_url: '/restaurant/',
        scope: '/restaurant/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#171717',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ]
})
