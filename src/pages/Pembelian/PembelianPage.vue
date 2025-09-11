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
        <q-item v-for="item in pembelianList" :key="item.id" clickable>
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
        v-if="!loading && pagination.total > pagination.perPage"
        v-model="pagination.page"
        :max="Math.ceil(pagination.total / pagination.perPage)"
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
import { ref, reactive, onMounted, computed, watchEffect } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'boot/axios'
import { API_URL } from 'boot/api'
import { v4 as uuidv4 } from 'uuid'
import { useRouter } from 'vue-router'

const router = useRouter()
const $q = useQuasar()
const saving = ref(false)

const LOCAL_KEY = 'pembelian_data' // <-- SATU KEY TETAP
const LAST_EMAIL_KEY = 'last_user_email'

// Baca email aktif (jika ada), simpan agar tersedia saat offline refresh
const authRaw = localStorage.getItem('auth_user')
const auth = authRaw ? JSON.parse(authRaw) : null
let currentEmail = auth?.user?.email || localStorage.getItem(LAST_EMAIL_KEY) || 'local'
localStorage.setItem(LAST_EMAIL_KEY, currentEmail)

function normalizeStr(s) {
  return String(s ?? '').toLowerCase()
}

function matchesSearch(item, q) {
  if (!q) return true
  const key = normalizeStr(q)
  // Bidang apa saja yang mau dicari:
  const hay = [
    item.no_faktur,
    item.keterangan,
    item.ref,
    item.tanggal,
    item.email,
    item.hutang_dagang,
    item.persediaan_barang,
    item.biaya_angkut,
    item.ppn_persen,
    item.ppn_masukan,
    item.discount,
    item.id,
  ]
    .map(normalizeStr)
    .join(' | ')
  return hay.includes(key) || hay.indexOf(key) >= 0 || hay.match(key)
}

function reconcileCacheWithServer(serverData) {
  // ambil id dari server (string)
  const serverIds = new Set(serverData.map((x) => String(x.id)))

  // ambil cache lama
  let cache = getCache()

  // buang item yang:
  // - milik currentEmail
  // - statusnya sudah synced (bukan draft/offline)
  // - dan TIDAK ada lagi di server
  cache = cache.filter((x) => {
    const isMine = x.email ? x.email === currentEmail : true
    if (!isMine) return true
    if (x.synced === false) return true // pertahankan perubahan lokal
    return serverIds.has(String(x.id))
  })

  // merge lagi serverData -> cache, tetap dedupe by id
  const merged = dedupeByIdPreferLocal([...cache, ...serverData])
  const sorted = sortNewestFirst(merged)
  setCache(sorted)
  return sorted
}

// =======================
// Helpers: Cache
// =======================
function normalizeForView(arr) {
  const m = new Map()
  for (const it of arr) {
    // kunci prioritas: local_id kalau ada, else id
    const key = String(it.local_id || it.id)

    if (!m.has(key)) {
      m.set(key, it)
      continue
    }

    const prev = m.get(key)

    // Prioritas tampilan:
    // 1) kalau ada yang pending (synced:false), tampilkan yang pending
    if (it.synced === false && prev.synced !== false) {
      // merge agar field kosong di pending tidak menimpa nilai valid
      m.set(key, { ...prev, ...it })
      continue
    }
    if (prev.synced === false && it.synced !== false) {
      m.set(key, { ...it, ...prev })
      continue
    }

    // 2) kalau sama-sama pending atau sama-sama synced, pilih yang "terbaru"
    const ta = new Date(it.created_at || it.tanggal || 0).getTime()
    const tb = new Date(prev.created_at || prev.tanggal || 0).getTime()
    if (ta > tb) m.set(key, it)
  }

  // urutkan seperti biasa
  return sortNewestFirst(Array.from(m.values()))
}

function getCache() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
  } catch {
    return []
  }
}
function setCache(arr) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(arr))
}
function dedupeByIdPreferLocal(arr) {
  const map = new Map()
  for (const item of arr) {
    const key = String(item.id)
    if (!map.has(key)) {
      map.set(key, item)
      continue
    }
    const prev = map.get(key)

    // Prioritas 1: item pending (synced:false) menang
    if (item.synced === false && prev.synced !== false) {
      map.set(key, item)
      continue
    }
    if (prev.synced === false && item.synced !== false) {
      // keep prev (pending)
      continue
    }

    // Keduanya synced:true -> pilih yang lebih baru berdasarkan updated_at/created_at/tanggal
    const t = (o) => new Date(o.updated_at || o.created_at || o.tanggal || 0).getTime()
    const ti = t(item)
    const tp = t(prev)
    // setelah hitung ti/tp
    if (ti > tp) {
      // jika item terbaru adalah pending tapi tidak ada perubahan field dasar,
      // pilih prev (server) agar tidak menimpa nilai benar
      const baseFields = ['persediaan_barang', 'biaya_angkut', 'ppn_persen', 'discount']
      const baseChanged = baseFields.some((f) => (item?.[f] ?? null) !== (prev?.[f] ?? null))
      if (item.synced === false && prev.synced === true && !baseChanged) {
        // keep prev (server)
      } else {
        map.set(key, item)
      }
    } else if (ti < tp) {
      // keep prev
    } else {
      if (item.__from === 'server' && prev.__from !== 'server') {
        map.set(key, item)
      }
    }
  }
  return Array.from(map.values())
}

function adoptPendingToCurrentEmail() {
  let cache = getCache()
  let changed = false
  cache = cache.map((x) => {
    if (x && x.synced === false) {
      // pindahkan owner pending ke email aktif agar tidak "hilang" dari filter
      if (!x.email || x.email !== currentEmail) {
        changed = true
        return { ...x, email: currentEmail }
      }
    }
    return x
  })
  if (changed) setCache(sortNewestFirst(cache))
  return cache
}
function viewFilter(x) {
  // Record pending selalu ditampilkan meskipun email tidak cocok
  if (x.synced === false) return true
  return x.email ? x.email === currentEmail : true
}
function sortNewestFirst(arr) {
  return [...arr].sort((a, b) => {
    const ta = new Date(a.created_at || a.tanggal || 0).getTime()
    const tb = new Date(b.created_at || b.tanggal || 0).getTime()
    if (ta && tb && ta !== tb) return tb - ta
    const na = Number(a.id),
      nb = Number(b.id)
    if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na
    return String(b.id).localeCompare(String(a.id))
  })
}

// Migrasi otomatis dari key lama `pembelian_data:<email>`
;(function migrateOldKeysIntoSingleKey() {
  try {
    const keys = Object.keys(localStorage)
    const oldKeys = keys.filter((k) => k.startsWith('pembelian_data:'))
    if (!oldKeys.length) return
    const merged = []
    for (const k of oldKeys) {
      const arr = JSON.parse(localStorage.getItem(k) || '[]')
      if (Array.isArray(arr)) merged.push(...arr)
    }
    const existing = getCache()
    const deduped = dedupeByIdPreferLocal([...existing, ...merged])
    setCache(deduped)
  } catch {
    // ignore
  }
})()

// =======================
// UI State
// =======================
const pembelianList = ref([])
const formDialog = ref(false)
const loading = ref(false)

const options = [
  { label: '0%', value: 0 },
  { label: '10%', value: 10 },
  { label: '11%', value: 11 },
  { label: '12%', value: 12 },
]

const pagination = reactive({
  page: 1,
  perPage: 10,
  total: 0,
})
const searchQuery = ref('')
const sort = reactive({
  by: 'id',
  descending: true,
})

// =======================
// Utils
// =======================
function goToPrintPage() {
  router.push('/pembelian/cetak')
}
function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function formatTanggalIndonesia(tanggal) {
  if (!tanggal) return ''
  const date = new Date(tanggal)
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}
function formatRupiah(val) {
  const num = Number(val) || 0
  return new Intl.NumberFormat('id-ID', { style: 'decimal' }).format(num)
}
// Lebih aman daripada sekadar navigator.onLine
function isNetworkError(err) {
  return (
    err?.code === 'ERR_NETWORK' ||
    err?.message?.toLowerCase().includes('network error') ||
    !err?.response // tidak ada response dari server
  )
}

// --- deteksi offline yang lebih akurat (soft-offline) ---
function isOffline() {
  return !navigator.onLine
}

// =======================
// Form State
// =======================
const defaultTanggal = getToday()
const form = reactive({
  id: null,
  local_id: '',
  synced: false,
  no_faktur: '',
  tanggal: defaultTanggal,
  keterangan: '',
  ref: '',
  hutang_dagang: 0,
  persediaan_barang: 0,
  biaya_angkut: 0,
  ppn_persen: 0,
  ppn_masukan: 0,
  discount: 0,
  // tanggal_bayar: null,
})

const rupiahFields = ['hutang_dagang', 'persediaan_barang', 'biaya_angkut']
function handleInput(fieldName, value) {
  if (rupiahFields.includes(fieldName)) {
    const numeric = parseInt(String(value).replace(/\D/g, ''), 10)
    form[fieldName] = Number.isFinite(numeric) ? numeric : 0
  } else {
    form[fieldName] = value ?? ''
  }
}

const ppnMasukanComputed = computed(() => {
  const pembelian = parseFloat(form.persediaan_barang) || 0
  const persen = parseFloat(form.ppn_persen) || 0
  return Math.round((pembelian * persen) / 100)
})

const hutangDagangComputed = computed(() => {
  const pembelian = parseFloat(form.persediaan_barang) || 0
  const biayaAngkut = parseFloat(form.biaya_angkut) || 0
  const discount = parseFloat(form.discount) || 0
  const ppnMasukan = ppnMasukanComputed.value
  const totalSebelumDiskon = pembelian + biayaAngkut + ppnMasukan
  const diskonRupiah = (discount / 100) * totalSebelumDiskon
  return Math.round(totalSebelumDiskon - diskonRupiah)
})

watchEffect(() => {
  form.ppn_masukan = ppnMasukanComputed.value
  //form.hutang_dagang = hutangDagangComputed.value
})

const formattedFields = {
  hutang_dagang: computed(() => formatRupiah(hutangDagangComputed.value)),
  persediaan_barang: computed(() => formatRupiah(form.persediaan_barang)),
  biaya_angkut: computed(() => formatRupiah(form.biaya_angkut)),
}

function resetForm() {
  form.id = null
  form.local_id = ''
  form.synced = false
  form.no_faktur = ''
  form.tanggal = getToday()
  form.keterangan = ''
  form.ref = ''
  form.hutang_dagang = 0
  form.persediaan_barang = 0
  form.biaya_angkut = 0
  form.ppn_persen = 0
  form.ppn_masukan = 0
  form.discount = 0
  // form.tanggal_bayar = null
}
function openForm(item = null) {
  if (item) Object.assign(form, item)
  else {
    resetForm()
    form.local_id = uuidv4()
  }
  formDialog.value = true
}

// =======================
// Sanitizer Payload
// =======================

function buildPayload(src) {
  const safeNum = (v) => {
    if (v == null) return 0
    // hilangkan semua selain digit & minus
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
    email: currentEmail,
    tanggal: src.tanggal || getToday(),
    no_faktur: String(src.no_faktur || ''),
    keterangan: src.keterangan || '',
    ref: src.ref || '',
    biaya_angkut: biayaAngkut,
    ppn_persen: persenPPN,
    ppn_masukan: ppnMasukan,
    persediaan_barang: pembelian,
    // PAKAI HASIL COMPUTE YANG AMAN
    hutang_dagang: hutangHitung,
    discount: discount,
    local_id: src.local_id || uuidv4(),
  }
}

// =======================
// Sinkronisasi Offline
// =======================
async function syncOfflineData() {
  if (isOffline()) return
  let cache = getCache()
  const toSync = cache.filter(
    (x) => x.synced === false && (x.email ? x.email === currentEmail : true),
  )
  if (!toSync.length) return

  for (const record of toSync) {
    try {
      if (record.__op === 'delete') {
        if (!String(record.id).startsWith('local_')) {
          await api.delete(`${API_URL}/pembelian/${record.id}`)
        }
        cache = cache.filter((x) => x.id !== record.id)
        continue
      }
      if (record.__op === 'update') {
        if (!String(record.id).startsWith('local_')) {
          await api.put(`${API_URL}/pembelian/${record.id}`, buildPayload(record))
          const idx = cache.findIndex((x) => x.id === record.id)
          if (idx !== -1) {
            cache[idx].synced = true
            delete cache[idx].__op
          }
        } else {
          const res = await api.post(`${API_URL}/pembelian`, buildPayload(record))
          const serverItem = res.data?.data || res.data
          const idx = cache.findIndex((x) => x.id === record.id)
          if (idx !== -1) {
            cache[idx] = {
              ...cache[idx],
              ...serverItem,
              email: currentEmail,
              id: serverItem.id,
              synced: true,
            }
            delete cache[idx].__op
          }
        }
        continue
      }
      // CREATE
      const res = await api.post(`${API_URL}/pembelian`, buildPayload(record))
      const serverItem = res.data?.data || res.data
      const idx = cache.findIndex((x) => x.id === record.id)
      if (idx !== -1) {
        cache[idx] = {
          ...cache[idx],
          ...serverItem,
          email: currentEmail,
          id: serverItem.id,
          synced: true,
        }
        delete cache[idx].__op
      }
    } catch (e) {
      console.error('Sync error:', e)
      $q.notify({
        type: 'warning',
        message: 'Sebagian data offline gagal tersinkron. Akan dicoba lagi.',
      })
    }
  }

  setCache(sortNewestFirst(cache))
}

function canPruneCache({ page, search, serverCount, serverTotal }) {
  // Hanya prune saat: halaman pertama, tidak ada search, dan respons memuat SEMUA item (tidak terpaginated)
  // Kamu bisa sesuaikan logic ini sesuai struktur respons API-mu.
  const noSearch = !search
  const firstPage = page === 1
  const allItemsReturned = serverTotal != null && serverCount >= serverTotal // API harus kirim total

  // Jika API-mu tidak kirim total, anggap TIDAK BOLEH PRUNE kecuali kamu memanggil endpoint khusus full-sync.
  return noSearch && firstPage && allItemsReturned
}
async function fullSyncAllPages() {
  if (isOffline()) return

  let page = 1
  const perPage = 200 // bikin besar supaya cepat
  const all = []

  while (true) {
    const resp = await api.get(`${API_URL}/pembelian`, {
      params: {
        email: currentEmail,
        page,
        perPage,
        // penting: JANGAN kirim search untuk full sync
      },
      timeout: 8000,
    })
    const dataArr = (resp.data?.data || resp.data || []).map((r) => ({
      ...r,
      email: currentEmail,
      synced: true,
      created_at: r.created_at || new Date().toISOString(),
    }))
    all.push(...dataArr)

    // kalau API kamu mengembalikan total, pakai itu untuk berhenti
    const total = resp.data?.total ?? resp.data?.meta?.total
    if (total != null) {
      if (all.length >= total) break
      page += 1
      continue
    }

    // fallback tanpa total: berhenti kalau jumlah hasil < perPage
    if (dataArr.length < perPage) break
    page += 1
  }

  // sekarang kita punya snapshot FULL -> aman untuk prune
  const afterRecon = reconcileCacheWithServer(all)
  pembelianList.value = normalizeForView(afterRecon.filter(viewFilter))
  pagination.total = pembelianList.value.length
}

// =======================
// Fetch Data (Online/Offline)
// =======================
async function fetchData() {
  loading.value = true
  if (!isOffline()) {
    adoptPendingToCurrentEmail()
  }

  if (isOffline()) {
    // OFFLINE: tampilkan SEMUA yang ada di cache (tanpa filter email),
    // supaya data tidak pernah "hilang" saat refresh offline
    const cached = getCache()
    //pembelianList.value = normalizeForView(cached)
    let display = normalizeForView(cached).filter(viewFilter)
    if (searchQuery.value) {
      display = display.filter((it) => matchesSearch(it, searchQuery.value))
    }
    pembelianList.value = display
    pagination.total = pembelianList.value.length
    loading.value = false
    return
  }

  try {
    const response = await api.get(`${API_URL}/pembelian`, {
      params: {
        email: currentEmail,
        page: pagination.page,
        perPage: pagination.perPage,
        search: searchQuery.value,
        sortBy: sort.by,
        sortDesc: sort.descending,
      },
      timeout: 7000,
    })

    const toNum = (v) => (v == null ? 0 : Number(v))

    const serverData = (response.data?.data || response.data || []).map((r) => ({
      ...r,
      __from: 'server',
      email: currentEmail,
      synced: true,
      created_at: r.created_at || new Date().toISOString(),
      updated_at: r.updated_at || r.created_at || null,

      // amankan angka input sumber perhitungan
      persediaan_barang: toNum(r.persediaan_barang),
      biaya_angkut: toNum(r.biaya_angkut),
      ppn_persen: toNum(r.ppn_persen),
      discount: toNum(r.discount),

      // JANGAN paksa hutang_dagang ke 0 di sini;
      // biarkan pakai apa adanya dari server kalau ada.
    }))

    // kalau API kasih total, ambil
    const serverTotal = response.data?.total ?? response.data?.meta?.total
    const serverCount = serverData.length

    // pakai helper baru untuk putuskan apakah boleh prune
    const okToPrune = canPruneCache({
      page: pagination.page,
      search: searchQuery.value,
      serverCount,
      serverTotal,
    })

    let merged
    if (okToPrune) {
      // snapshot lengkap → boleh bersihkan cache
      merged = reconcileCacheWithServer(serverData)
    } else {
      // jangan hapus cache lama, cukup merge
      // const existing = getCache()
      // merged = dedupeByIdPreferLocal([...existing, ...serverData])
      // setCache(sortNewestFirst(merged))
      const existing = getCache()
      merged = dedupeByIdPreferLocal([...existing, ...serverData])
      // Simpan ke cache hanya jika TIDAK ada search
      if (!searchQuery.value) {
        setCache(sortNewestFirst(merged))
      }
    }

    //pembelianList.value = normalizeForView(merged.filter(viewFilter))
    let display
    if (searchQuery.value) {
      // Saat search aktif, TAMPILKAN hasil server yang sudah terfilter.
      // Jangan campur dengan cache biar hasilnya bersih.
      display = normalizeForView(serverData.filter(viewFilter))
      // (opsional) penguat: masih filter lagi di klien
      display = display.filter((it) => matchesSearch(it, searchQuery.value))
    } else {
      // Tanpa search → boleh tampilkan merge cache+server
      display = normalizeForView(merged.filter(viewFilter))
    }
    pembelianList.value = display
    pagination.total = pembelianList.value.length

    // sync offline
    await syncOfflineData()

    // const afterSync = getCache()
    // pembelianList.value = normalizeForView(afterSync.filter(viewFilter))
    // pagination.total = pembelianList.value.length
    if (!searchQuery.value) {
      const afterSync = getCache()
      pembelianList.value = normalizeForView(afterSync.filter(viewFilter))
      pagination.total = pembelianList.value.length
    }
  } catch (e) {
    console.error(e)
    // fallback ke cache saat gagal online
    const cached = getCache()
    pembelianList.value = normalizeForView(cached.filter(viewFilter))
    pagination.total = pembelianList.value.length
    $q.notify({
      type: cached.length ? 'warning' : 'negative',
      message: cached.length
        ? 'Mode offline: menampilkan data dari cache'
        : 'Gagal mengambil data & cache kosong',
    })
  } finally {
    loading.value = false
  }
}

// =======================
// Save / Delete
// =======================
async function saveData() {
  if (!form.no_faktur) return $q.notify({ type: 'negative', message: 'Nomor Faktur Harus Diisi' })
  if (!form.tanggal) return $q.notify({ type: 'negative', message: 'Tanggal Harus Diisi' })
  if (!form.persediaan_barang)
    return $q.notify({ type: 'negative', message: 'Pembelian Harus Diisi' })

  const isEdit = !!form.id
  const payload = buildPayload(form)
  saving.value = true

  // fungsi kecil untuk menyimpan ke cache (dipakai offline & fallback)
  const saveOfflineLocal = () => {
    let cache = getCache()
    if (isEdit) {
      const index = cache.findIndex((item) => item.id === form.id)
      if (index !== -1) {
        cache[index] = {
          ...payload,
          id: form.id,
          email: currentEmail,
          created_at: cache[index].created_at || new Date().toISOString(),
          synced: false,
          __op: 'update',
        }
      }
      $q.notify({ type: 'warning', message: 'Data diperbarui (offline)' })
    } else {
      const localId = `local_${Date.now()}`
      form.id = localId
      const newData = {
        ...payload,
        id: localId,
        email: currentEmail,
        created_at: new Date().toISOString(),
        synced: false,
        __op: 'create',
      }
      cache = normalizeForView([newData, ...cache])
      $q.notify({ type: 'warning', message: 'Data ditambahkan (offline)' })
    }
    setCache(cache)
    pembelianList.value = normalizeForView(getCache())
    pagination.total = pembelianList.value.length
  }

  try {
    if (isOffline()) {
      // === OFFLINE LANGSUNG ===
      saveOfflineLocal()
    } else {
      // === ONLINE: coba request; kalau gagal network -> fallback offline ===
      if (isEdit) {
        const res = await api.put(`${API_URL}/pembelian/${form.id}`, payload)
        const serverItem = res?.data?.data || res?.data || null
        const cache = getCache()
        const idx = cache.findIndex((x) => String(x.id) === String(form.id))
        if (idx !== -1) {
          cache[idx] = {
            ...cache[idx],
            ...(serverItem || payload),
            id: serverItem?.id ?? form.id,
            email: currentEmail,
            synced: true,
            local_id: cache[idx].local_id || form.local_id || payload.local_id || uuidv4(),
            updated_at: serverItem?.updated_at || new Date().toISOString(),
          }
          setCache(sortNewestFirst(cache))
        }
        $q.notify({ type: 'positive', message: 'Data diperbarui (online)' })
      } else {
        const res = await api.post(`${API_URL}/pembelian`, payload)
        const created = res.data?.data || res.data
        $q.notify({ type: 'positive', message: 'Data ditambahkan (online)' })
        const cache = getCache()
        const withoutDup = cache.filter((x) => String(x.id) !== String(created.id))
        const updated = sortNewestFirst([
          {
            ...created,
            email: currentEmail,
            synced: true,
            created_at: created.created_at || new Date().toISOString(),
          },
          ...withoutDup,
        ])
        setCache(updated)
        pembelianList.value = normalizeForView(updated.filter(viewFilter))
        pagination.total = pembelianList.value.length
        pagination.page = 1
      }
    }

    formDialog.value = false
    resetForm()
    fetchData()
  } catch (error) {
    if (isNetworkError(error)) {
      // === FALLBACK KE OFFLINE ===
      saveOfflineLocal()
      formDialog.value = false
      resetForm()
      // jangan panggil API lagi di sini; cukup refresh dari cache
      pembelianList.value = normalizeForView(getCache())
      pagination.total = pembelianList.value.length
      $q.notify({ type: 'warning', message: 'Koneksi bermasalah. Data disimpan offline.' })
    } else {
      $q.notify({
        type: 'negative',
        message: `Gagal menyimpan: ${error?.response?.data?.message || error.message}`,
      })
    }
  } finally {
    saving.value = false
  }
}

function deleteData(id) {
  const item = pembelianList.value.find((p) => p.id === id)
  const nilaiHutang = item
    ? ` (Hutang Dagang: Rp ${Number(item.hutang_dagang).toLocaleString()})`
    : ''
  $q.dialog({
    title: 'Konfirmasi',
    message: `Yakin ingin menghapus data ini ${nilaiHutang}?`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      if (isOffline()) {
        let cache = getCache()
        const idx = cache.findIndex((x) => x.id === id)
        if (idx !== -1) {
          if (String(cache[idx].id).startsWith('local_')) {
            cache.splice(idx, 1)
          } else {
            cache[idx].__op = 'delete'
            cache[idx].synced = false
          }
        } else {
          cache.push({
            id,
            email: currentEmail,
            created_at: new Date().toISOString(),
            __op: 'delete',
            synced: false,
          })
        }
        setCache(cache)
        pembelianList.value = normalizeForView(getCache()) // tampilkan semua saat offline
        pagination.total = pembelianList.value.length
        $q.notify({ type: 'warning', message: 'Data dihapus (offline)' })
      } else {
        try {
          await api.delete(`${API_URL}/pembelian/${id}`)
          const cache = getCache().filter((x) => String(x.id) !== String(id))
          setCache(cache)
          pembelianList.value = normalizeForView(cache.filter(viewFilter))
          pagination.total = pembelianList.value.length
          $q.notify({ type: 'positive', message: 'Data dihapus (online)' })
        } catch (e) {
          if (isNetworkError(e)) {
            let cache = getCache()
            const idx = cache.findIndex((x) => x.id === id)
            if (idx !== -1) {
              if (String(cache[idx].id).startsWith('local_')) cache.splice(idx, 1)
              else {
                cache[idx].__op = 'delete'
                cache[idx].synced = false
              }
            } else {
              cache.push({
                id,
                email: currentEmail,
                created_at: new Date().toISOString(),
                __op: 'delete',
                synced: false,
              })
            }
            setCache(cache)
            pembelianList.value = normalizeForView(getCache())
            pagination.total = pembelianList.value.length
            $q.notify({ type: 'warning', message: 'Koneksi bermasalah. Hapus disimpan offline.' })
          } else {
            $q.notify({ type: 'negative', message: 'Gagal menghapus data' })
          }
        }
      }

      fetchData()
    } catch {
      $q.notify({ type: 'negative', message: 'Gagal menghapus data' })
    }
  })
}

// =======================
// Online events & Lifecycle
// =======================
window.addEventListener('online', async () => {
  adoptPendingToCurrentEmail()
  await syncOfflineData()
  await fullSyncAllPages()
  await fetchData()
})

onMounted(fetchData)

// (opsional) expose utk template
defineExpose({
  formatTanggalIndonesia,
  formatRupiah,
  goToPrintPage,
  openForm,
  saveData,
  deleteData,
  fetchData,
  handleInput,
  formattedFields,
  options,
  pembelianList,
  formDialog,
  form,
  pagination,
  searchQuery,
})
</script>
