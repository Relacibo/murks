import { defineConfig, type Plugin } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

function fixPiperWorkerPaths(): Plugin {
  return {
    name: 'fix-piper-worker-paths',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('piper-tts-web')) return
      return code.replace(
        '"/worker/OnnxWebWorker.js"',
        'import.meta.env.BASE_URL + "piper/worker/OnnxWebWorker.js"',
      )
    },
  }
}

export default defineConfig({
  base: process.env.BASE_URL ?? '/',
  plugins: [
    fixPiperWorkerPaths(),
    solid(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MURKS',
        short_name: 'MURKS',
        description: 'Minimal unterwürfige Rezept- und Küchensoftware',
        lang: 'de',
        theme_color: '#18181b',
        background_color: '#18181b',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        globIgnores: ['assets/*.wasm'],
      },
    }),
  ],
})
