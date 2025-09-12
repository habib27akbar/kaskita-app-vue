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
      <q-list bordered separator v-if="!loading && penjualanList.length > 0">
        <q-item v-for="item in pagedItems" :key="String(item.id || item.local_id)" clickable>
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
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { v4 as uuidv4 } from 'uuid'
import { useOfflineCrud } from '@/composables/useOfflineCrud'

const router = useRouter()

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

// ----- KONFIGURASI KHUSUS PEMBELIAN -----
const numericFields = [
  'piutang_dagang',
  'penjualan',
  'biaya_angkut',
  'ppn_keluaran',
  'ppn_persen',
  'discount',
]

// deriveForForm: set nilai turunan real-time (ppn_masukan)
// (hutang_dagang final dihitung di buildPayload)
const deriveForForm = (form) => {
  // const penjualan = Number(form.penjualan) || 0
  // const persen = Number(form.ppn_persen) || 0
  // form.ppn_keluaran = Math.round((penjualan * persen) / 100)
  const penjualan = Number(form.penjualan) || 0
  const biayaAngkut = Number(form.biaya_angkut) || 0
  const persen = Number(form.ppn_persen) || 0
  const discount = Number(form.discount) || 0

  // PPN keluaran
  form.ppn_keluaran = Math.round((penjualan * persen) / 100)

  // Piutang dagang (total - diskon)
  const totalSblmDiskon = penjualan + biayaAngkut + form.ppn_keluaran
  const diskonRupiah = (discount / 100) * totalSblmDiskon
  form.piutang_dagang = Math.round(totalSblmDiskon - diskonRupiah)
}

const defaultForm = () => ({
  id: null,
  local_id: uuidv4(),
  synced: false,
  no_faktur: '',
  tanggal: getToday(),
  keterangan: '',
  ref: '',
  piutang_dagang: 0,
  penjualan: 0,
  biaya_angkut: 0,
  ppn_persen: 0,
  ppn_keluaran: 0,
  discount: 0,
})

// buildPayload pakai rumus aman dari kode kamu
const buildPayload = (src) => {
  const safeNum = (v) => {
    if (v == null) return 0
    const s = String(v).replace(/[^\d-]/g, '')
    const n = parseInt(s, 10)
    return Number.isFinite(n) ? n : 0
  }
  const penjualan = safeNum(src.penjualan)
  const biayaAngkut = safeNum(src.biaya_angkut)
  const persenPPN = safeNum(src.ppn_persen)
  const discount = safeNum(src.discount)

  const ppnKeluaran = Math.round((penjualan * persenPPN) / 100)
  const totalSebelumDiskon = penjualan + biayaAngkut + ppnKeluaran
  const diskonRupiah = (discount / 100) * totalSebelumDiskon
  const hutangHitung = Math.round(totalSebelumDiskon - diskonRupiah)

  return {
    tanggal: src.tanggal || getToday(),
    no_faktur: String(src.no_faktur || ''),
    keterangan: src.keterangan || '',
    ref: src.ref || '',
    biaya_angkut: biayaAngkut,
    ppn_persen: persenPPN,
    ppn_keluaran: ppnKeluaran,
    penjualan: penjualan,
    piutang_dagang: hutangHitung, // <-- hasil compute
    discount: discount,
    local_id: src.local_id || uuidv4(),
  }
}

const {
  loading,
  saving,
  items: penjualanList,
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
  resource: 'penjualan',
  searchFields: [
    'no_faktur',
    'keterangan',
    'ref',
    'tanggal',
    'email',
    'penjualan',
    'piutang_dagang',
    'biaya_angkut',
    'ppn_persen',
    'ppn_keluaran',
    'discount',
    'id',
  ],
  numericFields,
  defaultForm,
  buildPayload,
  mergeBaseFields: ['penjualan', 'biaya_angkut', 'ppn_persen', 'discount'], // sesuai logika dedupe kamu
  deriveForForm,
})

// Field tampil rupiah (hutang_dagang ditampilkan dari rumus live untuk UX)
const piutangDagangComputed = computed(() => {
  const penjualan = Number(form.penjualan) || 0
  const biayaAngkut = Number(form.biaya_angkut) || 0
  const discount = Number(form.discount) || 0
  const ppnKeluaran = Number(form.ppn_keluaran) || 0
  const totalSebelumDiskon = penjualan + biayaAngkut + ppnKeluaran
  const diskonRupiah = (discount / 100) * totalSebelumDiskon
  return Math.round(totalSebelumDiskon - diskonRupiah)
})
const formattedPiutangDagang = computed(() => formatRupiah(piutangDagangComputed.value))

function goToPrintPage() {
  router.push('/penjualan/cetak')
}

// (opsional) expose ke template
defineExpose({
  formatTanggalIndonesia,
  formatRupiah,
  openForm,
  saveData,
  deleteData,
  fetchData,
  handleInput,
  formattedFields,
  formattedPiutangDagang,
  penjualanList,
  formDialog,
  form,
  pagination,
  searchQuery,
  loading,
  saving,
  sort,
  goToPrintPage,
  isOffline,
})
</script>
