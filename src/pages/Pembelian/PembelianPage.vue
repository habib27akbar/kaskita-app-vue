<template>
  <q-page class="q-pa-md bg-grey-2">
    <q-card class="q-pa-md">
      <div class="row items-center justify-between q-mb-md">
        <div class="text-h6">Data Pembelian</div>
        <div class="row items-center">
          <q-btn
            label="Cetak Laporan"
            color="secondary"
            icon="print"
            class="q-mr-sm"
            @click="goToPrintPage"
          />
          <q-btn label="Tambah" color="primary" @click="openForm()" icon="add" />
        </div>
      </div>

      <q-input
        outlined
        dense
        debounce="300"
        v-model="searchQuery"
        placeholder="Cari pembelian..."
        @update:model-value="fetchData"
        class="q-mb-md"
      />

      <q-list bordered separator v-if="!loading && pembelianList.length > 0">
        <q-item v-for="item in pagedItems" :key="String(item.id || item.local_id)" clickable>
          <q-item-section>
            <q-item-label
              ><strong>{{ item.no_faktur }}</strong></q-item-label
            >
            <q-item-label>Tanggal: {{ formatTanggalIndonesia(item.tanggal) }}</q-item-label>
            <q-item-label>Ket: {{ item.keterangan }}</q-item-label>
            <q-item-label>Hutang Dagang: Rp {{ formatRupiah(item.hutang_dagang) }}</q-item-label>
            <q-item-label v-if="item.synced === false" class="text-warning">
              (Belum sinkron)
            </q-item-label>
          </q-item-section>
          <q-item-section side top>
            <q-btn icon="edit" color="primary" dense round @click="openForm(item)" />
            <q-btn
              icon="delete"
              color="negative"
              dense
              round
              class="q-ml-sm"
              @click="deleteData(item.id)"
            />
          </q-item-section>
        </q-item>
      </q-list>
      <div v-else class="text-center text-grey">Belum ada data pembelian.</div>

      <!-- OVERLAY LOADING -->
      <q-inner-loading :showing="loading">
        <div class="column items-center">
          <q-spinner-dots size="48px" />
          <div class="q-mt-sm">Memuat data…</div>
        </div>
      </q-inner-loading>

      <q-pagination
        v-if="!loading && maxPages > 1"
        v-model="pagination.page"
        :max="maxPages"
        :max-pages="10"
        @update:model-value="fetchData"
        color="primary"
        class="q-mt-md"
        input
      />
    </q-card>

    <!-- Form Tambah/Ubah -->
    <q-dialog v-model="formDialog">
      <q-card class="q-pa-md" style="width: 100%; max-width: 600px">
        <q-card-section>
          <div class="text-h6">{{ form.id ? 'Ubah' : 'Tambah' }} Pembelian</div>
        </q-card-section>

        <q-card-section>
          <q-input v-model="form.no_faktur" label="No Faktur" dense outlined />
          <q-input
            v-model="form.tanggal"
            label="Tanggal"
            type="date"
            dense
            outlined
            class="q-mt-sm"
          />
          <q-input v-model="form.keterangan" label="Keterangan" dense outlined class="q-mt-sm" />
          <q-input v-model="form.ref" label="Pos Ref" dense outlined class="q-mt-sm" />

          <q-input
            label="Pembelian"
            outlined
            dense
            class="q-mt-sm"
            :model-value="formattedFields.persediaan_barang"
            @update:model-value="(val) => handleInput('persediaan_barang', val)"
          />

          <q-input
            label="Biaya Angkut"
            outlined
            dense
            class="q-mt-sm"
            :model-value="formattedFields.biaya_angkut"
            @update:model-value="(val) => handleInput('biaya_angkut', val)"
          />

          <q-select
            v-model="form.ppn_persen"
            :options="options"
            label="PPN Masukan (%)"
            outlined
            class="q-mt-sm"
            dense
            option-label="label"
            option-value="value"
            emit-value
            map-options
          />

          <q-input
            v-model="form.ppn_masukan"
            label="PPN Masukan"
            dense
            outlined
            class="q-mt-sm"
            readonly
          />

          <q-input
            type="number"
            v-model="form.discount"
            label="Discount"
            dense
            outlined
            class="q-mt-sm"
          />

          <q-input
            label="Hutang Dagang"
            outlined
            dense
            class="q-mt-sm"
            :model-value="formattedFields.hutang_dagang"
            @update:model-value="(val) => handleInput('hutang_dagang', val)"
            readonly
          />
        </q-card-section>

        <!-- overlay loading di atas isi form -->
        <q-inner-loading :showing="saving">
          <q-spinner-gears size="50px" />
        </q-inner-loading>

        <q-card-actions align="right">
          <q-btn flat label="Batal" color="primary" v-close-popup :disable="saving" />
          <q-btn
            flat
            label="Simpan"
            color="positive"
            @click="saveData"
            :loading="saving"
            :disable="saving"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>
<script setup>
import { computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { v4 as uuidv4 } from 'uuid'
import { useOfflineCrud } from '@/composables/useOfflineCrud'
import { API_URL } from 'boot/api' // sesuaikan dengan proyekmu

/* =========================
   Auth/email (opsional)
========================= */
const LAST_EMAIL_KEY = 'last_user_email'
const authRaw = localStorage.getItem('auth_user')
const auth = authRaw ? JSON.parse(authRaw) : null
const currentEmail = auth?.user?.email || localStorage.getItem(LAST_EMAIL_KEY) || ''

/* =========================
   Router
========================= */
const router = useRouter()
function goToPrintPage() {
  router.push('/pembelian/cetak')
}

/* =========================
   Util & Konstanta
========================= */
const getToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const options = [
  { label: '0%', value: 0 },
  { label: '10%', value: 10 },
  { label: '11%', value: 11 },
  { label: '12%', value: 12 },
]

const numericFields = [
  'persediaan_barang',
  'biaya_angkut',
  'ppn_persen',
  'discount',
  'hutang_dagang',
]

/* =========================
   Derivasi Form (UX live)
========================= */
const deriveForForm = (form) => {
  const pembelian = Number(form.persediaan_barang) || 0
  const biayaAngkut = Number(form.biaya_angkut) || 0
  const persen = Number(form.ppn_persen) || 0
  const discount = Number(form.discount) || 0

  form.ppn_masukan = Math.round((pembelian * persen) / 100)

  const totalSebelumDiskon = pembelian + biayaAngkut + form.ppn_masukan
  const diskonRupiah = (discount / 100) * totalSebelumDiskon
  form.hutang_dagang = Math.round(totalSebelumDiskon - diskonRupiah)
}

const defaultForm = () => ({
  id: null,
  local_id: uuidv4(),
  synced: false,
  no_faktur: '',
  tanggal: getToday(),
  keterangan: '',
  ref: '',
  hutang_dagang: 0,
  persediaan_barang: 0,
  biaya_angkut: 0,
  ppn_persen: 0,
  ppn_masukan: 0,
  discount: 0,
})

const buildPayload = (src) => {
  const safeNum = (v) => {
    if (v == null) return 0
    const s = String(v).replace(/[^\d-]/g, '')
    const n = parseInt(s, 10)
    return Number.isFinite(n) ? n : 0
  }
  const pembelian = safeNum(src.persediaan_barang)
  const biayaAngkut = safeNum(src.biaya_angkut)
  const persenPPN = safeNum(src.ppn_persen)
  const discount = safeNum(src.discount)

  const ppnMasukan = Math.round((pembelian * persenPPN) / 100)
  const totalSebelumDiskon = pembelian + biayaAngkut + ppnMasukan
  const diskonRupiah = (discount / 100) * totalSebelumDiskon
  const hutangHitung = Math.round(totalSebelumDiskon - diskonRupiah)

  return {
    tanggal: src.tanggal || getToday(),
    no_faktur: String(src.no_faktur || ''),
    keterangan: src.keterangan || '',
    ref: src.ref || '',
    biaya_angkut: biayaAngkut,
    ppn_persen: persenPPN,
    ppn_masukan: ppnMasukan,
    persediaan_barang: pembelian,
    hutang_dagang: hutangHitung,
    discount: discount,
    local_id: src.local_id || uuidv4(),
  }
}

/* =========================
   Composable CRUD
========================= */
const {
  loading,
  saving,
  items: pembelianList,
  pagedItems,
  formDialog,
  form,
  pagination,
  searchQuery,
  sort,
  formatTanggalIndonesia,
  formatRupiah,
  formattedFields,
  fetchData,
  saveData,
  deleteData,
  openForm,
  handleInput,
  isOffline,
} = useOfflineCrud({
  resource: 'pembelian',
  searchFields: [
    'no_faktur',
    'keterangan',
    'ref',
    'tanggal',
    'email',
    'hutang_dagang',
    'persediaan_barang',
    'biaya_angkut',
    'ppn_persen',
    'ppn_masukan',
    'discount',
    'id',
  ],
  numericFields,
  defaultForm,
  buildPayload,
  mergeBaseFields: ['persediaan_barang', 'biaya_angkut', 'ppn_persen', 'discount'],
  deriveForForm,
})

/* =========================
   Pagination helpers
========================= */
const coercePaginationNumbers = () => {
  pagination.page = Math.max(1, Number(pagination.page ?? 1))
  pagination.perPage = Math.max(1, Number(pagination.perPage ?? 10))
  pagination.total = Number(pagination.total ?? 0)
  if (!pagination.total) pagination.total = localTotal.value
}

// total dari list lokal (setelah filter), fallback aman
const localTotal = computed(() => {
  const arr = Array.isArray(pembelianList.value) ? pembelianList.value : []
  return arr.length
})

const effectivePerPage = computed(() => Math.max(1, Number(pagination.perPage || 10)))

// Apakah “masih ada next page”? Heuristik: kalau 1 halaman penuh, asumsikan ada lanjutannya.
// (berlaku saat total meta gagal terbaca di APK / offline)
const hasLikelyNext = computed(() => {
  const per = effectivePerPage.value
  const len = localTotal.value
  return len >= per
})

const effectiveTotal = computed(() => {
  const t = Number(pagination.total || 0)
  // Jika server kasih total (>0), pakai itu
  if (t > 0) return t
  // Kalau tidak ada total, fallback ke len halaman saat ini
  return localTotal.value
})

const maxPages = computed(() => {
  const per = effectivePerPage.value
  let base = Math.max(1, Math.ceil(effectiveTotal.value / per))
  // Jika base masih 1 (karena cuma tahu 1 halaman),
  // tapi halaman sekarang penuh, naikkan ke page+1 supaya pagination tampil.
  if (base <= 1 && hasLikelyNext.value) {
    base = Math.max(base, Number(pagination.value?.page || 1) + 1)
  }
  return base
})

/* =========================
   META fetch (baca total dari body paginate Laravel)
========================= */
function buildListUrl() {
  const base = `${API_URL}/pembelian` // sesuaikan path API
  const params = new URLSearchParams({
    page: String(pagination.page || 1),
    perPage: String(pagination.perPage || 10),
    search: String(searchQuery.value || ''),
    email: currentEmail || '',
  })
  // optional sorting
  if (sort?.by) {
    params.set('sortBy', String(sort.by))
    params.set('sortDesc', String(!!sort.descending))
  }
  return `${base}?${params.toString()}`
}

async function fetchMetaWithFetch() {
  try {
    const res = await fetch(buildListUrl(), { headers: { Accept: 'application/json' } })
    if (!res.ok) return { total: 0, perPage: 0, page: 0, lastPage: 0 }
    const j = await res.json()
    // bentuk default paginate Laravel
    return {
      total: Number(j?.total || j?.meta?.total || 0),
      perPage: Number(j?.per_page || j?.perPage || 0),
      page: Number(j?.current_page || j?.page || 0),
      lastPage: Number(j?.last_page || j?.lastPage || 0),
    }
  } catch {
    return { total: 0, perPage: 0, page: 0, lastPage: 0 }
  }
}

/* =========================
   Load flow
========================= */
const load = async () => {
  await fetchData()

  // coba meta server, tapi tak wajib
  const meta = await fetchMetaWithFetch().catch(() => ({ total: 0, perPage: 0, page: 0 }))

  coercePaginationNumbers()

  if (meta.perPage) pagination.perPage = meta.perPage
  if (meta.page) pagination.page = meta.page
  if (meta.total) pagination.total = meta.total

  // fallback tegas (TANPA .value)
  if (!Number(pagination.total)) {
    pagination.total = localTotal.value
  }
}

/* =========================
   Hooks & Watchers
========================= */
onMounted(async () => {
  coercePaginationNumbers()
  await load()
})

watch(
  () => searchQuery.value,
  async () => {
    if (pagination?.page !== 1) pagination.page = 1
    await load()
  },
)

watch(
  () => pagination?.page,
  async (n, o) => {
    if (n === o) return
    coercePaginationNumbers()
    await load()
  },
)

/* =========================
   HutangDagang tampil (UX)
========================= */
const hutangDagangComputed = computed(() => {
  const pembelian = Number(form.persediaan_barang) || 0
  const biayaAngkut = Number(form.biaya_angkut) || 0
  const discount = Number(form.discount) || 0
  const ppnMasukan = Number(form.ppn_masukan) || 0
  const totalSebelumDiskon = pembelian + biayaAngkut + ppnMasukan
  const diskonRupiah = (discount / 100) * totalSebelumDiskon
  return Math.round(totalSebelumDiskon - diskonRupiah)
})
const formattedHutangDagang = computed(() => formatRupiah(hutangDagangComputed.value))

/* =========================
   Expose (opsional)
========================= */
defineExpose({
  formatTanggalIndonesia,
  formatRupiah,
  openForm,
  saveData,
  deleteData,
  fetchData,
  handleInput,
  formattedFields,
  formattedHutangDagang,
  pembelianList,
  pagedItems,
  formDialog,
  form,
  pagination,
  searchQuery,
  loading,
  saving,
  sort,
  goToPrintPage,
  isOffline,
  maxPages,
})
</script>
