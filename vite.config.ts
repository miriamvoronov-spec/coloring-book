import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' keeps the build working on GitHub Pages sub-paths and Netlify alike.
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg', 'music/**/*'],
      manifest: {
        name: 'Miriam Coloring Books',
        short_name: 'Coloring Books',
        description: 'חוברות צביעה לפי מספרים',
        lang: 'he',
        dir: 'rtl',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#2b1a10',
        theme_color: '#2b1a10',
        start_url: './',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3,ogg,json}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024
      }
    })
  ]
});
