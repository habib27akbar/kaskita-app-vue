<template>
  <q-page class="q-pa-md bg-grey-2">
    <q-card class="q-pa-md">
      <div class="row items-center justify-between q-mb-md">
        <div class="text-h6">Sinkronisasi Data (Online ➜ Offline)</div>
        <div class="row items-center q-gutter-sm">
          <q-btn
            color="primary"
            icon="sync"
            :loading="syncingAll"
            label="Sync Semua"
            @click="syncAll"
          />
          <q-btn
            flat
            dense
            icon="help_outline"
            @click="$q.dialog({ title: 'Info', message: infoText })"
          />
        </div>
      </div>

      <q-table
        :rows="rows"
        :columns="columns"
        row-key="key"
        flat
        bordered
        :loading="pageLoading"
        :rows-per-page-options="[0]"
        hide-bottom
        :grid="$q.screen.lt.md"
      >
        <!-- ====== DESKTOP (table cells) ====== -->
        <template #body-cell-status="props">
          <q-td :props="props">
            <div class="row items-center q-gutter-x-sm">
              <q-badge
                :color="props.row.syncing ? 'primary' : props.row.error ? 'negative' : 'positive'"
                :label="props.row.syncing ? 'Syncing…' : props.row.error ? 'Error' : 'Siap'"
              />
              <q-spinner-dots v-if="props.row.syncing" size="16px" />
            </div>
            <div class="text-caption text-grey-7" v-if="props.row.error">
              {{ props.row.error }}
            </div>
          </q-td>
        </template>

        <template #body-cell-cacheCount="props">
          <q-td :props="props">
            <div>{{ props.row.cacheCount }}</div>
            <div class="text-caption text-grey-7" v-if="props.row.lastSync">
              Terakhir: {{ formatWaktu(props.row.lastSync) }}
            </div>
          </q-td>
        </template>

        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              color="primary"
              dense
              icon="sync"
              label="Sync"
              :disable="props.row.syncing || isOffline()"
              :loading="props.row.syncing"
              @click="syncOne(props.row.key)"
            />
            <q-btn
              class="q-ml-sm"
              color="grey-7"
              dense
              flat
              icon="delete_sweep"
              label="Bersihkan Cache"
              :disable="props.row.syncing"
              @click="clearCache(props.row.key)"
            />
          </q-td>
        </template>

        <!-- ====== MOBILE (grid/card item) ====== -->
        <template #item="props">
          <div class="q-pa-sm col-12">
            <q-card flat bordered class="q-pa-md">
              <div class="row items-center justify-between q-mb-sm">
                <div class="text-subtitle1 ellipsis">
                  {{ props.row.nama || props.row.key }}
                </div>
                <q-badge
                  :color="props.row.syncing ? 'primary' : props.row.error ? 'negative' : 'positive'"
                  :label="props.row.syncing ? 'Syncing…' : props.row.error ? 'Error' : 'Siap'"
                />
              </div>

              <div class="text-caption text-grey-7 q-mb-xs" v-if="props.row.error">
                {{ props.row.error }}
              </div>

              <div class="row items-center q-col-gutter-md q-mb-sm">
                <div class="col-6">
                  <div class="text-caption text-grey-7">Cache</div>
                  <div class="text-body1">{{ props.row.cacheCount }}</div>
                </div>
                <div class="col-6" v-if="props.row.lastSync">
                  <div class="text-caption text-grey-7">Terakhir</div>
                  <div class="text-body1">{{ formatWaktu(props.row.lastSync) }}</div>
                </div>
              </div>

              <div class="row q-col-gutter-sm">
                <div class="col-6">
                  <q-btn
                    unelevated
                    color="primary"
                    class="full-width"
                    :disable="props.row.syncing || isOffline()"
                    :loading="props.row.syncing"
                    @click="syncOne(props.row.key)"
                  >
                    <q-icon name="sync" class="q-mr-sm" />
                    Sync
                  </q-btn>
                </div>
                <div class="col-6">
                  <q-btn
                    flat
                    color="grey-8"
                    class="full-width"
                    @click="clearCache(props.row.key)"
                    :disable="props.row.syncing"
                  >
                    <q-icon name="delete_sweep" class="q-mr-sm" />
                    Bersihkan
                  </q-btn>
                </div>
              </div>
            </q-card>
          </div>
        </template>
      </q-table>

      <q-inner-loading :showing="pageLoading || syncingAll">
        <q-spinner-dots size="48px" />
        <div class="q-mt-sm">Menyiapkan…</div>
      </q-inner-loading>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'boot/axios'
import { API_URL } from 'boot/api'

const $q = useQuasar()
const COA_LOCAL_KEY = 'coa_cache_v1'

/* =========================
   Konfigurasi sumber data
   ========================= */
const SOURCES = [
  // key, label, endpoint, localStorage key, field tanggal utama (untuk sort)
  {
    key: 'coa',
    label: 'COA',
    endpoint: '/coa',
    lkey: COA_LOCAL_KEY,
    tfield: [],
    type: 'lookup', // penanda: ini tabel referensi (tanpa email/pagination khusus)
  },
  {
    key: 'pembelian',
    label: 'Pembelian',
    endpoint: '/pembelian',
    lkey: 'pembelian_data',
    tfield: ['created_at', 'tanggal'],
  },
  {
    key: 'penjualan',
    label: 'Penjualan',
    endpoint: '/penjualan',
    lkey: 'penjualan_data',
    tfield: ['created_at', 'tanggal'],
  },
  {
    key: 'penerimaan',
    label: 'Penerimaan',
    endpoint: '/penerimaan',
    lkey: 'penerimaan_data',
    tfield: ['created_at', 'tanggal_debet'],
  },
  {
    key: 'pengeluaran',
    label: 'Pengeluaran',
    endpoint: '/pengeluaran',
    lkey: 'pengeluaran_data',
    tfield: ['created_at', 'tanggal_kredit'],
  },
  {
    key: 'jurnal_umum',
    label: 'Jurnal Umum',
    endpoint: '/jurnal_umum',
    lkey: 'jurnal_umum_data',
    tfield: ['created_at', 'tanggal_debet'],
  },
]

/* =========================
   Kolom table
   ========================= */
const columns = [
  { name: 'label', label: 'Modul', field: 'label', align: 'left' },
  { name: 'status', label: 'Status', field: 'status', align: 'left' },
  { name: 'cacheCount', label: 'Item di Cache', field: 'cacheCount', align: 'right' },
  { name: 'actions', label: 'Aksi', field: 'actions', align: 'left' },
]

/* =========================
   State baris per modul
   ========================= */
const states = reactive(
  Object.fromEntries(
    SOURCES.map((s) => [
      s.key,
      {
        syncing: false,
        lastSync: null,
        cacheCount: 0,
        error: '',
      },
    ]),
  ),
)

const rows = ref([])
//const pageLoading = ref(false)
const syncingAll = ref(false)

/* =========================
   User/email
   ========================= */
const LAST_EMAIL_KEY = 'last_user_email'
const authRaw = localStorage.getItem('auth_user')
const auth = authRaw ? JSON.parse(authRaw) : null
const currentEmail = auth?.user?.email || localStorage.getItem(LAST_EMAIL_KEY) || 'local'
localStorage.setItem(LAST_EMAIL_KEY, currentEmail)

/* =========================
   Utils (cache & merge)
   ========================= */
function isOffline() {
  return !navigator.onLine
}
function getCache(lkey) {
  try {
    return JSON.parse(localStorage.getItem(lkey) || '[]')
  } catch {
    return []
  }
}
function setCache(lkey, arr) {
  localStorage.setItem(lkey, JSON.stringify(arr))
}
function ts(o, fields) {
  for (const f of fields) {
    if (o?.[f]) return new Date(o[f]).getTime()
  }
  return 0
}
function sortNewestFirst(arr, tfields) {
  return [...arr].sort((a, b) => {
    const ta = ts(a, tfields)
    const tb = ts(b, tfields)
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
    // sama-sama synced → pakai yang lebih baru
    const t = (o) =>
      new Date(
        o.updated_at || o.created_at || o.tanggal || o.tanggal_debet || o.tanggal_kredit || 0,
      ).getTime()
    if (t(item) > t(prev)) map.set(key, item)
  }
  return Array.from(map.values())
}
function reconcileCacheWithServer(lkey, tfields, serverData) {
  const serverIds = new Set(serverData.map((x) => String(x.id)))
  let cache = getCache(lkey)
  cache = cache.filter((x) => {
    const isMine = x.email ? x.email === currentEmail : true
    if (!isMine) return true
    if (x.synced === false) return true
    return serverIds.has(String(x.id))
  })
  const merged = dedupeByIdPreferLocal([...cache, ...serverData])
  const sorted = sortNewestFirst(merged, tfields)
  setCache(lkey, sorted)
  return sorted
}

function mapCoa(arr = []) {
  return arr.map((item) => ({
    id: Number(item.id),
    nomor_akun: item.nomor_akun,
    // simpan dalam format yang dipakai seluruh app:
    nama_akun_ind: `${item.nomor_akun} - ${item.nama_akun_ind}`,
  }))
}

/* =========================
   Full Sync per modul
   ========================= */
async function fullSync(key) {
  const conf = SOURCES.find((s) => s.key === key)
  if (!conf) return
  const st = states[key]
  st.syncing = true
  st.error = ''

  if (isOffline()) {
    st.error = 'Perangkat offline. Tidak bisa sync.'
    st.syncing = false
    return
  }

  if (conf.type === 'lookup') {
    try {
      const resp = await api.get(`${API_URL}${conf.endpoint}`, { timeout: 8000 })
      const raw = resp.data?.data || resp.data || []
      const mapped = mapCoa(raw)
      setCache(conf.lkey, mapped) // => localStorage 'coa_cache_v1'
      st.cacheCount = mapped.length
      st.lastSync = Date.now()
      $q.notify({ type: 'positive', message: `Sync ${conf.label} selesai: ${mapped.length} akun.` })
    } catch (e) {
      st.error = e?.response?.data?.message || e.message || 'Gagal sinkron COA'
      $q.notify({ type: 'negative', message: `Sync ${conf.label} gagal: ${st.error}` })
    } finally {
      st.syncing = false
      refreshRows()
    }
    return
  }

  try {
    let page = 1
    const perPage = 200
    const all = []

    while (true) {
      const resp = await api.get(`${API_URL}${conf.endpoint}`, {
        params: { email: currentEmail, page, perPage },
        timeout: 8000,
      })
      const arr = (resp.data?.data || resp.data || []).map((r) => ({
        ...r,
        email: currentEmail,
        synced: true,
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || r.created_at || null,
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

    const after = reconcileCacheWithServer(conf.lkey, conf.tfield, all)
    st.cacheCount = after.length
    st.lastSync = Date.now()
    $q.notify({ type: 'positive', message: `Sync ${conf.label} selesai: ${after.length} item.` })
  } catch (e) {
    st.error = e?.response?.data?.message || e.message || 'Gagal sinkron'
    $q.notify({ type: 'negative', message: `Sync ${conf.label} gagal: ${st.error}` })
  } finally {
    st.syncing = false
    refreshRows()
  }
}

/* =========================
   Aksi UI
   ========================= */
async function syncOne(key) {
  await fullSync(key)
}
async function syncAll() {
  if (isOffline()) {
    $q.notify({ type: 'warning', message: 'Perangkat offline. Tidak bisa sync semua.' })
    return
  }
  syncingAll.value = true
  for (const s of SOURCES) {
    // jalankan berurutan agar tidak membebani server
    // kalau ingin paralel, gunakan Promise.allSettled
    // namun notifikasi bisa jadi saling tumpuk
    // await Promise.resolve() untuk memberi kesempatan UI update
    await fullSync(s.key)
  }
  syncingAll.value = false
}
function clearCache(key) {
  const conf = SOURCES.find((s) => s.key === key)
  if (!conf) return
  $q.dialog({
    title: 'Bersihkan Cache',
    message: `Hapus semua data cache untuk modul ${conf.label}? (Data offline pending yang belum tersinkron juga ikut terhapus)`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    localStorage.setItem(conf.lkey, '[]')
    states[key].cacheCount = 0
    states[key].lastSync = null
    states[key].error = ''
    refreshRows()
    $q.notify({ type: 'positive', message: `Cache ${conf.label} dibersihkan.` })
  })
}

/* =========================
   Render table rows
   ========================= */
function refreshRows() {
  rows.value = SOURCES.map((s) => ({
    key: s.key,
    label: s.label,
    status: states[s.key].syncing ? 'Syncing...' : states[s.key].error ? 'Error' : 'Siap',
    cacheCount: states[s.key].cacheCount,
    lastSync: states[s.key].lastSync,
    syncing: states[s.key].syncing,
    error: states[s.key].error,
  }))
}
function formatWaktu(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

/* =========================
   Init
   ========================= */
const infoText = `Halaman ini menyalin data dari server (online) ke cache lokal (offline) untuk 5 modul, lalu menyatu-kannya dengan item pending (synced:false). Gunakan "Sync Semua" saat koneksi baik.`

const pageLoading = ref(false)
onMounted(() => {
  pageLoading.value = true
  // hitung jumlah awal cache per modul
  for (const s of SOURCES) {
    states[s.key].cacheCount = getCache(s.lkey).length
  }
  refreshRows()
  pageLoading.value = false
})
</script>
