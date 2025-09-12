<template>
  <q-page class="q-pa-md bg-grey-2">
    <q-card class="q-pa-md">
      <div class="row items-center justify-between q-mb-md">
        <div class="text-h6">Data Jurnal Umum</div>
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
        placeholder="Cari jurnal umum..."
        @update:model-value="fetchData"
        class="q-mb-md"
      />
      <q-list bordered separator v-if="!loading && jurnalUmumList.length > 0">
        <q-item v-for="item in pagedItems" :key="String(item.id || item.local_id)" clickable>
          <q-item-section>
            <q-item-label>Coa Debet : {{ item.nama_coa_debet }}</q-item-label>
            <q-item-label>Coa Kredit : {{ item.nama_coa_kredit }}</q-item-label>
            <q-item-label>Tanggal: {{ formatTanggalIndonesia(item.tanggal_debet) }}</q-item-label>

            <q-item-label>Jurnal Umum: Rp {{ formatRupiah(item.debet) }}</q-item-label>
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
      <div v-else class="text-center text-grey">Belum ada data jurnal umum.</div>
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
          <div class="text-h6">{{ form.id ? 'Ubah' : 'Tambah' }} Jurnal Umum</div>
        </q-card-section>

        <q-card-section>
          <q-input
            v-model="form.tanggal_debet"
            label="Tanggal"
            type="date"
            dense
            outlined
            class="q-mt-sm"
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
            :model-value="formattedFields.debet"
            @update:model-value="(val) => handleInput('debet', val)"
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
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { v4 as uuidv4 } from 'uuid'
import { api } from 'boot/axios'
import { API_URL } from 'boot/api'
import { useOfflineCrud } from '@/composables/useOfflineCrud'

/* =========================
   Helpers (format & route)
   ========================= */
const router = useRouter()
const $q = useQuasar()
function goToPrintPage() {
  router.push('/jurnal-umum/cetak')
}

function formatTanggalIndonesia(tanggal) {
  if (!tanggal) return ''
  const d = new Date(tanggal)
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}
function formatRupiah(val) {
  return new Intl.NumberFormat('id-ID', { style: 'decimal' }).format(val || 0)
}
function getToday() {
  const t = new Date()
  const yyyy = t.getFullYear()
  const mm = String(t.getMonth() + 1).padStart(2, '0')
  const dd = String(t.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/* =========================
   COA (fetch + cache lokal)
   ========================= */
const selectedCoa = ref(null) // v-model untuk Nomor Akun Debet (select)
const selectedCoaKredit = ref(null) // v-model untuk Nomor Akun Kredit (select)
const coaList = ref([])
const allCoa = ref([])
const COA_LOCAL_KEY = 'coa_cache_v1'

function loadCoaFromCache() {
  try {
    return JSON.parse(localStorage.getItem(COA_LOCAL_KEY) || '[]')
  } catch (e) {
    $q.notify({ type: 'warning', message: e })
  }
}
function saveCoaToCache(list) {
  try {
    localStorage.setItem(COA_LOCAL_KEY, JSON.stringify(list || []))
  } catch (e) {
    $q.notify({ type: 'warning', message: e })
  }
}
async function fetchCoaList() {
  // tampilkan cache dulu biar cepat
  const cached = loadCoaFromCache()
  if (cached.length) {
    allCoa.value = cached
    coaList.value = cached
  }
  // refresh dari server (kalau ada koneksi)
  try {
    const { data } = await api.get(`${API_URL}/coa`, { timeout: 8000 })
    const mapped = (data || []).map((item) => ({
      id: Number(item.id),
      nama_akun_ind: `${item.nomor_akun} - ${item.nama_akun_ind}`,
    }))
    allCoa.value = mapped
    coaList.value = mapped
    saveCoaToCache(mapped)
  } catch (e) {
    if (!cached.length) $q.notify({ type: 'warning', message: e })
  }
}
function filterCoa(val, update) {
  const q = (val || '').toLowerCase()
  update(() => {
    if (!q) {
      coaList.value = allCoa.value
      return
    }
    coaList.value = allCoa.value.filter((opt) => opt.nama_akun_ind.toLowerCase().includes(q))
  })
}

/* =========================
   useOfflineCrud (inti)
   ========================= */
const numericFields = ['debet', 'kredit']

const defaultForm = () => ({
  id: null,
  local_id: uuidv4(),
  synced: false,
  no_faktur: '',
  id_coa_debet: null,
  id_coa_kredit: null,
  tanggal_debet: getToday(),
  debet: 0,
  kredit: 0,
  keterangan: '',
  ref: '',
})

/** Turunan: kredit mengikuti debet (sesuai UI: field kredit readonly) */
const deriveForForm = (form) => {
  const deb = Number(form.debet) || 0
  form.kredit = deb
}

/** Payload ke backend (nama field DIJAGA sesuai permintaan) */
const buildPayload = (src) => ({
  email: getEmail(),
  no_faktur: String(src.no_faktur || ''),
  id_coa_debet: src.id_coa_debet ?? null,
  id_coa_kredit: src.id_coa_kredit ?? null,
  tanggal_debet: src.tanggal_debet || getToday(),
  debet: Number(src.debet) || 0,
  kredit: Number(src.kredit) || 0,
  keterangan: src.keterangan || '',
  ref: src.ref || '',
  local_id: src.local_id || uuidv4(),
})

/** Ambil email user untuk filter data (sama pola dengan halaman lain) */
const LAST_EMAIL_KEY = 'last_user_email'
function getEmail() {
  const authRaw = localStorage.getItem('auth_user')
  const auth = authRaw ? JSON.parse(authRaw) : null
  const email = auth?.user?.email || localStorage.getItem(LAST_EMAIL_KEY) || 'local'
  localStorage.setItem(LAST_EMAIL_KEY, email)
  return email
}

const {
  // state umum
  loading,
  saving,
  items: jurnalUmumList,
  pagedItems,
  formDialog,
  form,
  pagination,
  searchQuery,
  sort,
  // format & input
  formattedFields,
  handleInput,
  // CRUD
  fetchData,
  saveData,
  deleteData,
  openForm,
} = useOfflineCrud({
  resource: 'jurnal_umum',
  searchFields: [
    'no_faktur',
    'keterangan',
    'ref',
    'tanggal_debet',
    'email',
    'debet',
    'kredit',
    'id',
    'id_coa_debet',
    'id_coa_kredit',
  ],
  numericFields,
  defaultForm,
  buildPayload,
  deriveForForm,
  mergeBaseFields: [
    'id_coa_debet',
    'id_coa_kredit',
    'debet',
    'kredit',
    'tanggal_debet',
    'no_faktur',
  ],
})

/* =========================
   Sinkronisasi select COA
   ========================= */
watch(selectedCoa, (val) => {
  form.id_coa_debet = val?.id ?? null
})
watch(selectedCoaKredit, (val) => {
  form.id_coa_kredit = val?.id ?? null
})
//console.log(form.id_coa_kredit)

/** Saat edit: set selectedCoa/selectedCoaKredit dari id yang ada */
watch(
  () => [form.id_coa_debet, form.id_coa_kredit, allCoa.value],
  () => {
    if (!allCoa.value?.length) return
    const debId = form.id_coa_debet != null ? Number(form.id_coa_debet) : null
    const kreId = form.id_coa_kredit != null ? Number(form.id_coa_kredit) : null
    selectedCoa.value = allCoa.value.find((o) => o.id === debId) || null
    selectedCoaKredit.value = allCoa.value.find((o) => o.id === kreId) || null
  },
  { immediate: true },
)

/* =========================
   Expose ke template (biar 100% sama)
   ========================= */
function formatListTanggal(v) {
  return formatTanggalIndonesia(v)
}

function openFormWrapper(item = null) {
  openForm(item)
  // pastikan kredit readonly mengikuti debet begitu dialog dibuka
  deriveForForm(form)
}

onMounted(() => {
  fetchCoaList()
  fetchData()
})

defineExpose({
  // tampilan & aksi (nama sama persis dgn template)
  goToPrintPage,
  formatTanggalIndonesia: formatListTanggal,
  formatRupiah,
  openForm: openFormWrapper,
  saveData,
  deleteData,
  fetchData,

  // state template
  jurnalUmumList,
  pagedItems,
  formDialog,
  form,
  pagination,
  searchQuery,
  loading,
  saving,
  sort,
  // input uang
  formattedFields,
  handleInput,

  // select COA
  selectedCoa,
  selectedCoaKredit,
  coaList,
  filterCoa,
})
</script>
