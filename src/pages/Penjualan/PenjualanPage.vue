<template>
  <q-page class="q-pa-md bg-grey-2">
    <q-card class="q-pa-md">
      <div class="row items-center justify-between q-mb-md">
        <div class="text-h6">Data Penjualan</div>
        <q-btn
          label="Cetak Laporan"
          color="secondary"
          icon="print"
          class="q-mr-sm"
          @click="goToPrintPage"
        />
        <q-btn label="Tambah" color="primary" @click="openForm()" icon="add" />
      </div>
      <q-input
        outlined
        dense
        debounce="300"
        v-model="searchQuery"
        placeholder="Cari penjualan..."
        @update:model-value="fetchData"
        class="q-mb-md"
      />
      <q-list bordered separator v-if="penjualanList.length > 0">
        <q-item v-for="item in penjualanList" :key="item.id" clickable>
          <q-item-section>
            <q-item-label
              ><strong>{{ item.no_faktur }}</strong></q-item-label
            >
            <q-item-label>Tanggal: {{ formatTanggalIndonesia(item.tanggal) }}</q-item-label>
            <q-item-label>Ket: {{ item.keterangan }}</q-item-label>
            <q-item-label>Piutang Dagang: Rp {{ formatRupiah(item.piutang_dagang) }}</q-item-label>
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
      <div v-else class="text-center text-grey">Belum ada data penjualan.</div>
      <q-pagination
        v-if="pagination.total > pagination.perPage"
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
          <div class="text-h6">{{ form.id ? 'Ubah' : 'Tambah' }} penjualan</div>
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
            label="penjualan"
            outlined
            dense
            class="q-mt-sm"
            :model-value="formattedFields.penjualan"
            @update:model-value="(val) => handleInput('penjualan', val)"
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
            label="PPN Keluaran (%)"
            outlined
            class="q-mt-sm"
            dense
            option-label="label"
            option-value="value"
            emit-value
            map-options
          />

          <q-input
            v-model="form.ppn_keluaran"
            label="PPN Keluaran"
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
            label="Piutang Dagang"
            outlined
            dense
            class="q-mt-sm"
            :model-value="formattedFields.piutang_dagang"
            @update:model-value="(val) => handleInput('piutang_dagang', val)"
            readonly
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Batal" color="primary" v-close-popup />
          <q-btn flat label="Simpan" color="positive" @click="saveData" />
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
const LOCAL_KEY = 'penjualan_data'
const saving = ref(false)
const LAST_EMAIL_KEY = 'last_user_email'
const authRaw = localStorage.getItem('auth_user')
const auth = authRaw ? JSON.parse(authRaw) : null
let currentEmail = auth?.user?.email || localStorage.getItem(LAST_EMAIL_KEY) || 'local'
localStorage.setItem(LAST_EMAIL_KEY, currentEmail)
const penjualanList = ref([])
const formDialog = ref(false)
const options = [
  { label: '0%', value: 0 },
  { label: '10%', value: 10 },
  { label: '11%', value: 11 },
  { label: '12%', value: 12 },
]

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

function goToPrintPage() {
  router.push('/penjualan/cetak')
}
//const selectedOption = ref(0) // ❌ ini number, tidak cocok dengan '12'
// Fungsi untuk dapatkan tanggal hari ini dalam format YYYY-MM-DD
function getToday() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0') // Bulan dimulai dari 0
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
// Pastikan nilai default dibuat sebelum reactive
const defaultTanggal = getToday()
const form = reactive({
  id: null,
  local_id: '', // ← Tambahkan ini
  synced: false, // ← Dan ini
  no_faktur: '',
  tanggal: defaultTanggal,
  keterangan: '',
  ref: '',
  piutang_dagang: '',
  penjualan: '',
  biaya_angkut: 0,
  ppn_persen: 0,
  ppn_keluaran: 0,
})

// Format tanggal Indonesia
function formatTanggalIndonesia(tanggal) {
  if (!tanggal) return ''
  const date = new Date(tanggal)
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
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

function dedupeByIdPreferLocal(arr) {
  const m = new Map()
  for (const it of arr) {
    const key = String(it.id ?? it.local_id) // selaras dg normalize
    if (!m.has(key)) {
      m.set(key, it)
      continue
    }

    const prev = m.get(key)

    if (it.synced === false && prev.synced !== false) {
      m.set(key, { ...prev, ...it })
      continue
    }
    if (prev.synced === false && it.synced !== false) {
      m.set(key, { ...it, ...prev })
      continue
    }

    const t = (o) => new Date(o.updated_at || o.created_at || o.tanggal || 0).getTime()
    m.set(key, t(it) > t(prev) ? it : prev)
  }
  return [...m.values()]
}

// tampilkan pending untuk semua email; selain itu filter by currentEmail
function viewFilter(x) {
  if (x.synced === false) return true
  return x.email ? x.email === currentEmail : true
}

// opsional: pindahkan semua pending ke currentEmail agar tidak “hilang” oleh filter
function adoptPendingToCurrentEmail() {
  let cache = getCache(),
    changed = false
  cache = cache.map((x) => {
    if (x?.synced === false && x.email !== currentEmail) {
      changed = true
      return { ...x, email: currentEmail }
    }
    return x
  })
  if (changed) setCache(sortNewestFirst(cache))
  return cache
}

function toInt(v) {
  // const n = parseInt(v, 10)
  // return Number.isFinite(n) ? n : 0
  if (v == null) return 0
  const s = String(v).replace(/[^\d-]/g, '') // buang pemisah ribuan/dll
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : 0
}
function buildPayload(src) {
  return {
    email: currentEmail,
    tanggal: src.tanggal || getToday(),
    no_faktur: String(src.no_faktur || ''),
    keterangan: src.keterangan || '',
    ref: src.ref || '',
    biaya_angkut: toInt(src.biaya_angkut),
    ppn_persen: toInt(src.ppn_persen),
    ppn_keluaran: toInt(src.ppn_keluaran),
    penjualan: toInt(src.penjualan),
    piutang_dagang: toInt(piutangDagangComputed.value),
    local_id: src.local_id || uuidv4(),
  }
}

// ADD
async function syncOfflineData() {
  if (isOffline()) return
  let cache = getCache()
  const toSync = cache.filter(
    (x) => x.synced === false && (x.email ? x.email === currentEmail : true),
  )
  if (!toSync.length) return

  for (const rec of toSync) {
    try {
      if (rec.__op === 'delete') {
        if (!String(rec.id).startsWith('local_')) {
          await api.delete(`${API_URL}/penjualan/${rec.id}`)
        }
        cache = cache.filter((x) => x.id !== rec.id)
        continue
      }

      if (rec.__op === 'update') {
        if (!String(rec.id).startsWith('local_')) {
          await api.put(`${API_URL}/penjualan/${rec.id}`, buildPayload(rec))
          const i = cache.findIndex((x) => x.id === rec.id)
          if (i !== -1) {
            cache[i].synced = true
            delete cache[i].__op
          }
        } else {
          const res = await api.post(`${API_URL}/penjualan`, buildPayload(rec))
          const serverItem = res.data?.data || res.data
          const i = cache.findIndex((x) => x.id === rec.id)
          if (i !== -1) {
            cache[i] = {
              ...cache[i],
              ...serverItem,
              email: currentEmail,
              id: serverItem.id,
              synced: true,
              local_id: undefined,
            }
            delete cache[i].__op
          }
        }
        continue
      }

      // CREATE
      const res = await api.post(`${API_URL}/penjualan`, buildPayload(rec))
      const serverItem = res.data?.data || res.data
      const i = cache.findIndex((x) => x.id === rec.id)
      if (i !== -1) {
        cache[i] = {
          ...cache[i],
          ...serverItem,
          email: currentEmail,
          id: serverItem.id,
          synced: true,
        }
        delete cache[i].__op
      }
    } catch (e) {
      console.error('Sync error penjualan:', e)
      $q.notify({ type: 'warning', message: 'Sebagian data offline gagal tersinkron (penjualan).' })
    }
  }
  setCache(sortNewestFirst(cache))
}

function canPruneCache({ page, search, serverCount, serverTotal }) {
  const noSearch = !search
  const firstPage = page === 1
  const allItemsReturned = serverTotal != null && serverCount >= serverTotal
  return noSearch && firstPage && allItemsReturned
}

async function fullSyncAllPages() {
  if (isOffline()) return
  let page = 1
  const perPage = 200
  const all = []
  while (true) {
    const resp = await api.get(`${API_URL}/penjualan`, {
      params: { email: currentEmail, page, perPage },
      timeout: 8000,
    })
    const arr = (resp.data?.data || resp.data || []).map((r) => ({
      ...r,
      email: currentEmail,
      synced: true,
      created_at: r.created_at || new Date().toISOString(),
    }))
    all.push(...arr)
    const total = resp.data?.total ?? resp.data?.meta?.total
    if (total != null) {
      if (all.length >= total) break
      page += 1
      continue
    }
    if (arr.length < perPage) break
    page += 1
  }
  const after = reconcileCacheWithServer(all)
  penjualanList.value = sortNewestFirst(after.filter(viewFilter))
  pagination.total = penjualanList.value.length
}

function normalizeForView(arr) {
  const m = new Map()
  for (const it of arr) {
    // utamakan id, fallback ke local_id bila id belum ada
    const key = it?.id != null ? String(it.id) : String(it.local_id)

    if (!m.has(key)) {
      m.set(key, it)
      continue
    }
    const prev = m.get(key)

    // pending menang tapi di-merge
    if (it.synced === false && prev.synced !== false) {
      m.set(key, { ...prev, ...it })
      continue
    }
    if (prev.synced === false && it.synced !== false) {
      m.set(key, { ...it, ...prev })
      continue
    }

    // sama-sama pending/synced → pilih terbaru
    const ta = new Date(it.updated_at || it.created_at || it.tanggal || 0).getTime()
    const tb = new Date(prev.updated_at || prev.created_at || prev.tanggal || 0).getTime()
    if (ta > tb) m.set(key, it)
  }
  return sortNewestFirst(Array.from(m.values()))
}

// ADD
function reconcileCacheWithServer(serverData) {
  const serverIds = new Set(serverData.map((x) => String(x.id)))
  let cache = getCache()

  // buang record milik currentEmail yang sudah synced & hilang di server
  cache = cache.filter((x) => {
    const isMine = x.email ? x.email === currentEmail : true
    if (!isMine) return true
    if (x.synced === false) return true
    return serverIds.has(String(x.id))
  })

  const merged = dedupeByIdPreferLocal([...cache, ...serverData])
  const sorted = sortNewestFirst(merged)
  setCache(sorted)
  return sorted
}

const rupiahFields = ['piutang_dagang', 'penjualan', 'biaya_angkut']

function handleInput(fieldName, value) {
  if (rupiahFields.includes(fieldName)) {
    const numeric = parseInt(value.toString().replace(/\D/g, '')) || 0
    form[fieldName] = numeric
  } else {
    form[fieldName] = value
  }
}

const formattedFields = {
  piutang_dagang: computed(() => formatRupiah(piutangDagangComputed.value)),
  penjualan: computed(() => formatRupiah(form.penjualan)),
  biaya_angkut: computed(() => formatRupiah(form.biaya_angkut)),
}

const ppnMasukanComputed = computed(() => {
  const penjualan = parseFloat(form.penjualan) || 0
  const persen = parseFloat(form.ppn_persen) || 0
  return Math.round((penjualan * persen) / 100)
})

const piutangDagangComputed = computed(() => {
  const penjualan = parseFloat(form.penjualan) || 0
  const biayaAngkut = parseFloat(form.biaya_angkut) || 0
  const discount = parseFloat(form.discount) || 0
  const ppnMasukan = ppnMasukanComputed.value

  const totalSebelumDiskon = penjualan + biayaAngkut + ppnMasukan
  const diskonRupiah = (discount / 100) * totalSebelumDiskon

  return Math.round(totalSebelumDiskon - diskonRupiah)
})

watchEffect(() => {
  form.ppn_keluaran = ppnMasukanComputed.value
  //form.piutang_dagang = piutangDagangComputed.value
})

// Format Rupiah
function formatRupiah(val) {
  return new Intl.NumberFormat('id-ID', { style: 'decimal' }).format(val)
}

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

const loading = ref(false)

function resetForm() {
  form.id = null
  form.no_faktur = ''
  form.tanggal = getToday()
  form.keterangan = ''
  form.ref = ''
  form.piutang_dagang = ''
  form.penjualan = ''
  form.biaya_angkut = 0
  form.ppn_persen = 0
  form.ppn_keluaran = 0
}

function openForm(item = null) {
  if (item) {
    Object.assign(form, item)
  } else {
    resetForm()
    form.local_id = uuidv4() // untuk new form
  }
  formDialog.value = true
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

// REPLACE
async function fetchData() {
  loading.value = true
  if (!isOffline()) adoptPendingToCurrentEmail()

  if (isOffline()) {
    const cached = getCache()
    //penjualanList.value = sortNewestFirst(cached)
    let display = normalizeForView(cached).filter(viewFilter)
    if (searchQuery.value) {
      display = display.filter((it) => matchesSearch(it, searchQuery.value))
    }
    penjualanList.value = display
    pagination.total = penjualanList.value.length
    loading.value = false
    return
  }

  try {
    const response = await api.get(`${API_URL}/penjualan`, {
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

    const serverData = (response.data?.data || response.data || []).map((r) => ({
      ...r,
      email: currentEmail,
      synced: true,
      created_at: r.created_at || new Date().toISOString(),
      penjualan: toInt(r.penjualan),
      biaya_angkut: toInt(r.biaya_angkut),
      ppn_persen: toInt(r.ppn_persen),
      discount: toInt(r.discount),
    }))

    const serverTotal = response.data?.total ?? response.data?.meta?.total
    const serverCount = serverData.length

    let merged
    if (
      canPruneCache({ page: pagination.page, search: searchQuery.value, serverCount, serverTotal })
    ) {
      merged = reconcileCacheWithServer(serverData)
    } else {
      const existing = getCache()
      merged = dedupeByIdPreferLocal([...existing, ...serverData])
      setCache(sortNewestFirst(merged))
    }

    penjualanList.value = normalizeForView(merged.filter(viewFilter))
    pagination.total = penjualanList.value.length

    await syncOfflineData()

    const afterSync = getCache()
    penjualanList.value = normalizeForView(afterSync.filter(viewFilter))
    pagination.total = penjualanList.value.length
  } catch (e) {
    console.error(e)
    const cached = getCache()
    penjualanList.value = sortNewestFirst(cached.filter(viewFilter))
    pagination.total = penjualanList.value.length
    $q.notify({
      type: cached.length ? 'warning' : 'negative',
      message: cached.length
        ? 'Mode offline: menampilkan data dari cache (penjualan)'
        : 'Gagal mengambil data & cache kosong',
    })
  } finally {
    loading.value = false
  }
}

// REPLACE
async function saveData() {
  if (!form.no_faktur) return $q.notify({ type: 'negative', message: 'Nomor Faktur Harus Diisi' })
  if (!form.tanggal) return $q.notify({ type: 'negative', message: 'Tanggal Harus Diisi' })
  if (!form.penjualan) return $q.notify({ type: 'negative', message: 'Penjualan Harus Diisi' })

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
    penjualanList.value = normalizeForView(getCache())
    pagination.total = penjualanList.value.length
  }

  try {
    if (isOffline()) {
      saveOfflineLocal()
    } else {
      if (isEdit) {
        await api.put(`${API_URL}/penjualan/${form.id}`, payload)
        // optimistic cache update
        const cache = getCache()
        const idx = cache.findIndex((x) => String(x.id) === String(form.id))
        if (idx !== -1) {
          cache[idx] = {
            ...cache[idx],
            ...payload,
            email: currentEmail,
            synced: true,
            updated_at: new Date().toISOString(),
          }
          setCache(sortNewestFirst(cache))
        }
        $q.notify({ type: 'positive', message: 'Data diperbarui (online)' })
      } else {
        const res = await api.post(`${API_URL}/penjualan`, payload)
        const created = res.data?.data || res.data
        const cache = getCache()
        const withoutDup = cache.filter((x) => String(x.id) !== String(created.id))
        const updated = sortNewestFirst([
          {
            ...created,
            email: currentEmail,
            synced: true,
            created_at: created.created_at || new Date().toISOString(),
            local_id: undefined,
          },
          ...withoutDup,
        ])
        setCache(updated)
        penjualanList.value = sortNewestFirst(updated.filter(viewFilter))
        pagination.total = penjualanList.value.length
        pagination.page = 1
        $q.notify({ type: 'positive', message: 'Data ditambahkan (online)' })
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
      penjualanList.value = normalizeForView(getCache())
      pagination.total = penjualanList.value.length
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
  const item = penjualanList.value.find((p) => p.id === id)
  //console.log('ITEM YANG AKAN DIHAPUS:', item)
  const nilaiHutang = item
    ? ` (Piutang Dagang: Rp ${Number(item.piutang_dagang).toLocaleString()})`
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
        penjualanList.value = sortNewestFirst(getCache())
        pagination.total = penjualanList.value.length
        $q.notify({ type: 'warning', message: 'Data dihapus (offline)' })
      } else {
        try {
          await api.delete(`${API_URL}/penjualan/${id}`)
          const cache = getCache().filter((x) => String(x.id) !== String(id))
          setCache(cache)
          penjualanList.value = normalizeForView(cache.filter(viewFilter))
          pagination.total = penjualanList.value.length
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
            penjualanList.value = normalizeForView(getCache())
            pagination.total = penjualanList.value.length
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

// Auto-fetch saat kembali online
window.addEventListener('online', async () => {
  adoptPendingToCurrentEmail()
  await syncOfflineData()
  await fullSyncAllPages()
  await fetchData()
})

onMounted(fetchData)
</script>
