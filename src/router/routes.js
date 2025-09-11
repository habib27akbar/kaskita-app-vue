const routes = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('pages/LoginPage.vue') },
      {
        path: 'home',
        component: () => import('pages/HomePage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'pembelian',
        component: () => import('pages/Pembelian/PembelianPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'penjualan',
        component: () => import('pages/Penjualan/PenjualanPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'jurnal-penerimaan',
        component: () => import('pages/Jurnal/PenerimaanPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'jurnal-umum',
        component: () => import('pages/Jurnal/JurnalUmumPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'jurnal-pengeluaran',
        component: () => import('pages/Jurnal/PengeluaranPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'neraca-awal',
        component: () => import('pages/Neraca/NeracaAwalPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'neraca-saldo',
        component: () => import('pages/Neraca/NeracaSaldoPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'neraca',
        component: () => import('pages/Laporan/NeracaPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'laba-rugi',
        component: () => import('pages/Laporan/LabaRugiPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'arus-kas',
        component: () => import('pages/Laporan/ArusKasPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'berita',
        component: () => import('pages/Berita/BeritaPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'event',
        component: () => import('pages/Event/EventPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'sync',
        component: () => import('pages/Sync/SyncPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'sync-offline',
        component: () => import('pages/SyncOffline/SyncOfflinePage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'profil',
        component: () => import('pages/Profil/ProfilPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'pendaftaran',
        component: () => import('pages/Pendaftaran/PendaftaranPage.vue'),
        meta: { requiresAuth: false },
      },
      {
        path: '/pembelian/cetak',
        component: () => import('src/pages/Pembelian/LaporanPembelian.vue'),
      },
      {
        path: '/penjualan/cetak',
        component: () => import('src/pages/Penjualan/LaporanPenjualan.vue'),
      },
      {
        path: '/penerimaan/cetak',
        component: () => import('src/pages/Jurnal/LaporanPenerimaan.vue'),
      },
      {
        path: '/jurnal-umum/cetak',
        component: () => import('src/pages/Jurnal/LaporanJurnalUmumPage.vue'),
      },
      {
        path: '/pengeluaran/cetak',
        component: () => import('src/pages/Jurnal/LaporanPengeluaran.vue'),
      },
      {
        path: '/forgot-password',
        component: () => import('pages/Profil/ForgotPassword.vue'),
        meta: { requiresAuth: false },
      },
      {
        path: '/ai-analyze',
        component: () => import('pages/AI/AiAnalyzePage.vue'),
        meta: { requiresAuth: true },
      },
    ],
  },

  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
