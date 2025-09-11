import { defineConfig } from '#q-app/wrappers'
import path from 'path'
export default defineConfig((/* ctx */) => {
  return {
    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: ['axios'],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#css
    css: ['app.scss'],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v7',
      // 'fontawesome-v6',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!
      'roboto-font',
      'material-icons',
    ],

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
      target: {
        browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
        node: 'node20',
      },

      vueRouterMode: 'hash', // 'hash' recommended for PWA simplicity; 'history' juga bisa
      // vueRouterBase,
      // vueDevtools,
      // vueOptionsAPI: false,

      // rebuildCache: true,

      // publicPath: '/',
      // analyze: true,
      // env: {},
      // rawDefine: {},
      // ignorePublicFolder: true,
      // minify: false,
      // polyfillModulePreload: true,
      // distDir

      // extendViteConf (viteConf) {},
      // viteVuePluginOptions: {},

      vitePlugins: [
        [
          'vite-plugin-checker',
          {
            eslint: {
              lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{js,mjs,cjs,vue}"',
              useFlatConfig: true,
            },
          },
          { server: false },
        ],
      ],
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      // https: true,
      open: true,
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#framework
    framework: {
      config: {},
      // iconSet: 'material-icons',
      // lang: 'en-US',
      // components: [],
      // directives: [],
      plugins: ['Notify', 'Dialog', 'Loading'],
    },

    // animations: 'all',
    animations: [],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#sourcefiles
    sourceFiles: {
      // Jika file2 di bawah belum ada, buatkan:
      //  - src-pwa/register-service-worker.js
      //  (service worker dibangkitkan otomatis oleh Workbox karena GenerateSW)
      pwaRegisterServiceWorker: 'src-pwa/register-service-worker',
      // pwaServiceWorker: 'src-pwa/custom-service-worker', // (khusus InjectManifest)
      // pwaManifestFile: 'src-pwa/manifest.json',          // (opsional; kita definisikan manifest di config)
    },

    // SSR dimatikan (bukan SSR-PWA)
    ssr: {
      prodPort: 3000,
      middlewares: ['render'],
      pwa: false,
    },

    // ============================
    // P W A   C O N F I G
    // ============================
    // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
    pwa: {
      // GenerateSW: Workbox akan membuat service-worker otomatis dengan precache asset build
      workboxMode: 'GenerateSW',

      // inject meta tags PWA ke index.html
      injectPwaMetaTags: true,

      // Web App Manifest
      manifest: {
        name: 'Kaskita',
        short_name: 'Kaskita',
        description: 'Aplikasi Pembelian dengan dukungan Offline',
        display: 'standalone',
        start_url: '/',
        background_color: '#ffffff',
        theme_color: '#1976d2',
        icons: [
          { src: 'icons/pwa-128x128.png', sizes: '128x128', type: 'image/png' },
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-256x256.png', sizes: '256x256', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },

      // Opsi Workbox (runtime caching agar refresh offline tetap jalan)
      workboxOptions: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          {
            // App shell / navigasi (HTML) → agar refresh offline tetap memuat app
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 3,
            },
          },
          {
            // Cache GET API (opsional): sesuaikan prefix endpoint-mu
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              // kalau API_URL kamu absolut (mis. https://api.example.com), ganti kondisi origin di bawah
              (url.origin === self.location.origin
                ? url.pathname.startsWith('/api/')
                : url.href.startsWith(/* API_URL */ '')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
          {
            // Statis aset (fallback) – kebanyakan sudah ter-precache oleh GenerateSW
            urlPattern: ({ request }) =>
              ['style', 'script', 'worker'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-resources',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
          {
            // Gambar
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
        ],
      },
    },

    // Cordova
    cordova: {},

    // Capacitor
    capacitor: {
      hideSplashscreen: true,
    },

    // Electron
    electron: {
      preloadScripts: ['electron-preload'],
      inspectPort: 5858,
      bundler: 'packager',
      packager: {},
      builder: { appId: 'kaskita-app' },
    },

    // Browser Extension
    bex: {
      extraScripts: [],
    },
  }
})
