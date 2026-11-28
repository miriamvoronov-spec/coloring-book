import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`                 → installable PWA in dist/ (GitHub Pages / Netlify)
// `vite build --mode artifact` → one self-contained HTML file in dist-artifact/,
//                                published as a private claude.ai Artifact.
export default defineConfig(({ mode }) => {
  if (mode === 'artifact') {
    return {
      base: './',
      plugins: [viteSingleFile()],
      build: { outDir: 'dist-artifact', emptyOutDir: true, rollupOptions: { input: 'artifact.html' } },
    };
  }
  return {
    base: './',
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/*.svg', 'music/**/*'],
        manifest: {
          name: "Miriam's Coloring Books",
          short_name: "Miriam's Coloring",
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
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3,ogg,json}'],
          maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        },
      }),
    ],
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  };
});
