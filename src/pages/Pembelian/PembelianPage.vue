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
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { v4 as uuidv4 } from 'uuid'
import { useOfflineCrud } from '@/composables/useOfflineCrud'

const router = useRouter()

const getToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ----- KONFIGURASI KHUSUS PEMBELIAN -----
const numericFields = [
  'persediaan_barang',
  'biaya_angkut',
  'ppn_persen',
  'discount',
  'hutang_dagang',
]

// deriveForForm: set nilai turunan real-time (ppn_masukan)
// (hutang_dagang final dihitung di buildPayload)
const deriveForForm = (form) => {
  const pembelian = Number(form.persediaan_barang) || 0
  const persen = Number(form.ppn_persen) || 0
  form.ppn_masukan = Math.round((pembelian * persen) / 100)
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

// buildPayload pakai rumus aman dari kode kamu
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
    hutang_dagang: hutangHitung, // <-- hasil compute
    discount: discount,
    local_id: src.local_id || uuidv4(),
  }
}

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
  mergeBaseFields: ['persediaan_barang', 'biaya_angkut', 'ppn_persen', 'discount'], // sesuai logika dedupe kamu
  deriveForForm,
})

// Field tampil rupiah (hutang_dagang ditampilkan dari rumus live untuk UX)
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

function goToPrintPage() {
  router.push('/pembelian/cetak')
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
  formattedHutangDagang,
  pembelianList,
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
