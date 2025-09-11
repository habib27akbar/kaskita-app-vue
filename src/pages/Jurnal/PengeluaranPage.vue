<template>
  <q-page class="q-pa-md bg-grey-2">
    <q-card class="q-pa-md">
      <div class="row items-center justify-between q-mb-md">
        <div class="text-h6">Data Jurnal Pengeluaran</div>
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
        placeholder="Cari jurnal pengeluaran..."
        @update:model-value="fetchData"
        class="q-mb-md"
      />
      <q-list bordered separator v-if="pengeluaranList.length > 0">
        <q-item v-for="item in pengeluaranList" :key="item.id" clickable>
          <q-item-section>
            <q-item-label>Coa Kredit : {{ item.nama_coa_kredit }}</q-item-label>
            <q-item-label>Coa Debet : {{ item.nama_coa_debet }}</q-item-label>

            <q-item-label>Tanggal: {{ formatTanggalIndonesia(item.tanggal_kredit) }}</q-item-label>

            <q-item-label>Jurnal Pengeluaran: Rp {{ formatRupiah(item.kredit) }}</q-item-label>
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
      <div v-else class="text-center text-grey">Belum ada data jurnal pengeluaran.</div>
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
          <div class="text-h6">{{ form.id ? 'Ubah' : 'Tambah' }} Jurnal Pengeluaran</div>
        </q-card-section>

        <q-card-section>
          <q-input
            v-model="form.tanggal_kredit"
            label="Tanggal"
            type="date"
            dense
            outlined
            class="q-mt-sm"
          />

          <q-select
            v-model="selectedCoaKredit"
            :options="coaList"
            label="Nomor Akun Kredit"
            outlined
            dense
            use-input
            clearable
            input-debounce="300"
            option-label="nama_akun_ind"
            option-value="id"
            class="q-mt-sm"
            map-options
            @filter="filterCoa"
          />

          <q-input
            label="Jumlah"
            outlined
            dense
            class="q-mt-sm"
            :model-value="formattedFields.debet"
            @update:model-value="(val) => handleInput('debet', val)"
          />

          <q-select
            v-model="selectedCoa"
            :options="coaList"
            label="Nomor Akun Debet"
            outlined
            dense
            use-input
            clearable
            input-debounce="300"
            option-label="nama_akun_ind"
            option-value="id"
            class="q-mt-sm"
            map-options
            @filter="filterCoa"
          />

          <q-input
            label="Jumlah"
            outlined
            dense
            class="q-mt-sm"
            :model-value="formattedFields.kredit"
            @update:model-value="(val) => handleInput('kredit', val)"
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
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'boot/axios'
import { API_URL } from 'boot/api'
import { v4 as uuidv4 } from 'uuid'
import { useRouter } from 'vue-router'
const router = useRouter()
const $q = useQuasar()
const LOCAL_KEY = 'pengeluaran_data'
const pengeluaranList = ref([])
const formDialog = ref(false)

const selectedCoa = ref(null)
const selectedCoaKredit = ref(null) // untuk Kredit
const coaList = ref([])
const allCoa = ref([]) // simpan semua data asli

// =======================
// Offline helpers (seperti pembelian)
// =======================
const saving = ref(false)
const COA_LOCAL_KEY = 'coa_cache_v1'
const LAST_EMAIL_KEY = 'last_user_email'
const authRaw = localStorage.getItem('auth_user')
const auth = authRaw ? JSON.parse(authRaw) : null
let currentEmail = auth?.user?.email || localStorage.getItem(LAST_EMAIL_KEY) || 'local'
localStorage.setItem(LAST_EMAIL_KEY, currentEmail)

// --- di atas: state bantu ---
const targetDebetId = ref(null)
const targetKreditId = ref(null)

// cari dan set selected dari ID bila list COA sudah ada
function applySelectedFromIds() {
  if (targetDebetId.value != null) {
    selectedCoa.value =
      allCoa.value.find((o) => o.id === targetDebetId.value) ||
      // fallback kalau server cuma kirim nama (optional)
      (form.nama_coa_debet ? { id: targetDebetId.value, nama_akun_ind: form.nama_coa_debet } : null)
  }
  if (targetKreditId.value != null) {
    selectedCoaKredit.value =
      allCoa.value.find((o) => o.id === targetKreditId.value) ||
      (form.nama_coa_kredit
        ? { id: targetKreditId.value, nama_akun_ind: form.nama_coa_kredit }
        : null)
  }
}

function loadCoaFromCache() {
  try {
    const raw = localStorage.getItem(COA_LOCAL_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function saveCoaToCache(list) {
  try {
    localStorage.setItem(COA_LOCAL_KEY, JSON.stringify(list || []))
  } catch (e) {
    $q.notify({ type: 'negative', message: e })
  }
}

// kalau daftar COA baru selesai di-fetch, terapkan pilihan
watch(allCoa, () => applySelectedFromIds())

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
    const ta = new Date(a.created_at || a.tanggal_kredit || 0).getTime()
    const tb = new Date(b.created_at || b.tanggal_kredit || 0).getTime()
    if (ta && tb && ta !== tb) return tb - ta
    const na = Number(a.id),
      nb = Number(b.id)
    if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na
    return String(b.id).localeCompare(String(a.id))
  })
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

    // pending (synced:false) menang
    if (item.synced === false && prev.synced !== false) {
      map.set(key, item)
      continue
    }
    if (prev.synced === false && item.synced !== false) {
      continue
    }

    // sama2 synced → pilih yang terbaru
    const t = (o) => new Date(o.updated_at || o.created_at || o.tanggal_kredit || 0).getTime()
    if (t(item) > t(prev)) map.set(key, item)
  }
  return Array.from(map.values())
}
function normalizeForView(arr) {
  // kunci dedupe tampilan pakai local_id kalau ada
  const m = new Map()
  for (const it of arr) {
    const key = String(it.local_id || it.id)
    if (!m.has(key)) {
      m.set(key, it)
      continue
    }
    const prev = m.get(key)

    if (it.synced === false && prev.synced !== false) {
      m.set(key, it)
      continue
    }
    if (prev.synced === false && it.synced !== false) {
      continue
    }

    const ta = new Date(it.created_at || it.tanggal_kredit || 0).getTime()
    const tb = new Date(prev.created_at || prev.tanggal_kredit || 0).getTime()
    if (ta > tb) m.set(key, it)
  }
  return sortNewestFirst(Array.from(m.values()))
}
function viewFilter(x) {
  if (x.synced === false) return true
  return x.email ? x.email === currentEmail : true
}
function adoptPendingToCurrentEmail() {
  let cache = getCache(),
    changed = false
  cache = cache.map((x) => {
    if (x && x.synced === false && x.email !== currentEmail) {
      changed = true
      return { ...x, email: currentEmail }
    }
    return x
  })
  if (changed) setCache(sortNewestFirst(cache))
  return cache
}
function reconcileCacheWithServer(serverData) {
  const serverIds = new Set(serverData.map((x) => String(x.id)))
  let cache = getCache()
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
    const resp = await api.get(`${API_URL}/pengeluaran`, {
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
  pengeluaranList.value = normalizeForView(after.filter(viewFilter))
  pagination.total = pengeluaranList.value.length
}
function toInt(v) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : 0
}
function buildPayload(src) {
  return {
    email: currentEmail,
    no_faktur: String(src.no_faktur || ''),
    id_coa_debet: src.id_coa_debet ?? null,
    id_coa_kredit: src.id_coa_kredit ?? null,
    tanggal_kredit: src.tanggal_kredit || getToday(),
    debet: toInt(src.debet),
    kredit: toInt(src.kredit),
    keterangan: src.keterangan || '',
    ref: src.ref || '',
    local_id: src.local_id || uuidv4(),
  }
}

watch(selectedCoa, (val) => {
  form.id_coa_debet = val?.id || null
})

watch(selectedCoaKredit, (val) => {
  form.id_coa_kredit = val?.id || null
})

async function fetchCoaList() {
  // a) kalau offline → pakai cache saja
  if (isOffline()) {
    const cached = loadCoaFromCache()
    allCoa.value = cached
    coaList.value = cached
    if (!cached.length) {
      $q.notify({ type: 'warning', message: 'Daftar COA kosong (offline).' })
    }
    return
  }

  // b) kalau online → tampilkan cache dulu (biar cepat), lalu refresh dari server
  const cached = loadCoaFromCache()
  if (cached.length) {
    allCoa.value = cached
    coaList.value = cached
  }

  try {
    const { data } = await api.get(`${API_URL}/coa`, { timeout: 8000 })
    const mapped = (data || []).map((item) => ({
      id: item.id,
      nama_akun_ind: `${item.nomor_akun} - ${item.nama_akun_ind}`,
    }))
    allCoa.value = mapped
    coaList.value = mapped
    saveCoaToCache(mapped) // <-- simpan untuk offline nanti
  } catch (e) {
    if (!cached.length) {
      $q.notify({ type: 'negative', message: e })
    } else {
      $q.notify({ type: 'warning', message: e })
    }
  }
}

function filterCoa(val, update) {
  if (val === '') {
    update(() => {
      coaList.value = allCoa.value
    })
    return
  }

  const needle = val.toLowerCase()
  update(() => {
    coaList.value = allCoa.value.filter((opt) => opt.nama_akun_ind.toLowerCase().includes(needle))
  })
}

function goToPrintPage() {
  router.push('/pengeluaran/cetak')
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
  id_coa_debet: null,
  tanggal_kredit: defaultTanggal,
  debet: '',
  kredit: '',
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

// const formattedHutangDagang = computed(() => {
//   return formatRupiah(form.debet)
// })

const rupiahFields = ['debet', 'kredit']

function handleInput(fieldName, value) {
  if (rupiahFields.includes(fieldName)) {
    const numeric = parseInt(value.toString().replace(/\D/g, '')) || 0
    form[fieldName] = numeric

    // 🔹 Sinkronkan kredit dengan debet
    if (fieldName === 'debet') {
      form.kredit = numeric
    }
  } else {
    form[fieldName] = value
  }
}

const formattedFields = {
  debet: computed(() => formatRupiah(form.debet)),
  kredit: computed(() => formatRupiah(form.kredit)),
}

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
  form.tanggal_debet = getToday()
  form.keterangan = ''
  form.ref = ''
  form.debet = '0'
  form.kredit = '0'
  form.id_coa_debet = null
  form.id_coa_kredit = null

  selectedCoa.value = null
  selectedCoaKredit.value = null
}

function openForm(item = null) {
  if (item) {
    Object.assign(form, item)

    // simpan target ID lalu set selected (kalau list sudah ada)
    targetDebetId.value = item.id_coa_debet ?? null
    targetKreditId.value = item.id_coa_kredit ?? null
    applySelectedFromIds()
  } else {
    resetForm()
    form.local_id = uuidv4()

    // pastikan clear selected saat tambah baru
    selectedCoa.value = null
    selectedCoaKredit.value = null
    targetDebetId.value = null
    targetKreditId.value = null
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

async function fetchData() {
  loading.value = true
  if (!isOffline()) adoptPendingToCurrentEmail()

  if (isOffline()) {
    const cached = getCache()
    pengeluaranList.value = normalizeForView(cached)
    pagination.total = pengeluaranList.value.length
    loading.value = false
    return
  }

  try {
    const response = await api.get(`${API_URL}/pengeluaran`, {
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
      __from: 'server',
      email: currentEmail,
      synced: true,
      created_at: r.created_at || new Date().toISOString(),
      updated_at: r.updated_at || r.created_at || null,
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
      setCache(normalizeForView(merged))
    }

    pengeluaranList.value = normalizeForView(merged.filter(viewFilter))
    pagination.total = pengeluaranList.value.length

    await syncOfflineData() // push pending -> server

    const afterSync = getCache()
    pengeluaranList.value = normalizeForView(afterSync.filter(viewFilter))
    pagination.total = pengeluaranList.value.length
  } catch (e) {
    console.error(e)
    const cached = getCache()
    pengeluaranList.value = normalizeForView(cached.filter(viewFilter))
    pagination.total = pengeluaranList.value.length
    $q.notify({
      type: cached.length ? 'warning' : 'negative',
      message: cached.length
        ? 'Mode offline: data dari cache (pengeluaran)'
        : 'Gagal mengambil data & cache kosong',
    })
  } finally {
    loading.value = false
  }
}

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
        if (!String(rec.id).startsWith('local_'))
          await api.delete(`${API_URL}/pengeluaran/${rec.id}`)
        cache = cache.filter((x) => x.id !== rec.id)
        continue
      }

      if (rec.__op === 'update') {
        if (!String(rec.id).startsWith('local_')) {
          await api.put(`${API_URL}/pengeluaran/${rec.id}`, buildPayload(rec))
          const i = cache.findIndex((x) => x.id === rec.id)
          if (i !== -1) {
            cache[i].synced = true
            delete cache[i].__op
          }
        } else {
          const res = await api.post(`${API_URL}/pengeluaran`, buildPayload(rec))
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
        }
        continue
      }

      // CREATE
      const res = await api.post(`${API_URL}/pengeluaran`, buildPayload(rec))
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
    } catch (err) {
      console.error('Sync pengeluaran error:', err)
      $q.notify({
        type: 'warning',
        message: 'Sebagian data offline gagal tersinkron (pengeluaran).',
      })
    }
  }

  setCache(normalizeForView(cache))
}

async function saveData() {
  if (!form.id_coa_debet) return $q.notify({ type: 'negative', message: 'Nomor Akun Debet wajib' })
  if (!form.id_coa_kredit)
    return $q.notify({ type: 'negative', message: 'Nomor Akun Kredit wajib' })
  if (!form.debet) return $q.notify({ type: 'negative', message: 'Debet wajib' })

  const isEdit = !!form.id
  const payload = buildPayload(form)
  saving.value = true

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
    pengeluaranList.value = normalizeForView(getCache())
    pagination.total = pengeluaranList.value.length
  }

  try {
    if (isOffline()) {
      saveOfflineLocal()
    } else {
      if (isEdit) {
        const res = await api.put(`${API_URL}/pengeluaran/${form.id}`, payload)
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
        const res = await api.post(`${API_URL}/pengeluaran`, payload)
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
        pengeluaranList.value = normalizeForView(updated.filter(viewFilter))
        pagination.total = pengeluaranList.value.length
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
      pengeluaranList.value = normalizeForView(getCache())
      pagination.total = pengeluaranList.value.length
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
  const item = pengeluaranList.value.find((p) => p.id === id)
  //console.log('ITEM YANG AKAN DIHAPUS:', item)
  const nilaiHutang = item ? ` (pengeluaran : Rp ${Number(item.debet).toLocaleString()})` : ''
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
        pengeluaranList.value = sortNewestFirst(getCache())
        pagination.total = pengeluaranList.value.length
        $q.notify({ type: 'warning', message: 'Data dihapus (offline)' })
      } else {
        try {
          await api.delete(`${API_URL}/pembelian/${id}`)
          const cache = getCache().filter((x) => String(x.id) !== String(id))
          setCache(cache)
          pengeluaranList.value = normalizeForView(cache.filter(viewFilter))
          pagination.total = pengeluaranList.value.length
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
            pengeluaranList.value = normalizeForView(getCache())
            pagination.total = pengeluaranList.value.length
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

window.addEventListener('online', async () => {
  adoptPendingToCurrentEmail()
  fetchCoaList()
  await syncOfflineData()
  await fullSyncAllPages()
  await fetchData()
})

onMounted(() => {
  fetchData()
  fetchCoaList()
})
</script>
