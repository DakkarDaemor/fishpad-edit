import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Su GitHub Pages (sito di progetto) l'app vive in /<nome-repo>/: la Action passa BASE_PATH.
const base = process.env.BASE_PATH ?? '/'

// Versione MAJOR.MINOR da package.json (unica fonte): MAJOR = nuove funzionalità, MINOR = correzioni.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }
const appVersion = pkg.version.split('.').slice(0, 2).join('.')

const TEXT_EXTENSIONS = [
  '.txt', '.log', '.md', '.markdown', '.json', '.jsonc', '.js', '.mjs', '.cjs', '.jsx',
  '.ts', '.mts', '.cts', '.tsx', '.css', '.scss', '.sass', '.less', '.html', '.htm',
  '.xml', '.svg', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.env', '.csv',
  '.sql', '.py', '.php', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp',
  '.hpp', '.cs', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.lua', '.vue', '.dockerfile',
]

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  // il chunk più grande è il plugin TypeScript di Prettier (~900 kB), caricato solo alla prima formattazione
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'Fishpad Edit',
        short_name: 'Fishpad',
        lang: 'it',
        description: 'Editor di testo con syntax highlight, folding e accesso diretto ai file locali.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#0d3a4d',
        theme_color: '#0d3a4d',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        // "Apri con…" dal sistema operativo (PWA installata, Chromium desktop)
        file_handlers: [{ action: base, accept: { 'text/plain': TEXT_EXTENSIONS } }],
        // Se l'app è già aperta, i file arrivano nella finestra esistente come nuove tab
        launch_handler: { client_mode: ['focus-existing', 'auto'] },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
