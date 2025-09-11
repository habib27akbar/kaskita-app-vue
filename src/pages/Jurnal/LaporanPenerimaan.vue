<template>
  <q-page padding>
    <div class="q-gutter-md">
      <q-card>
        <q-card-section>
          <div class="text-h6">Laporan Jurnal Penerimaan</div>
        </q-card-section>

        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-4">
              <q-input filled v-model="tanggalMulai" label="Tanggal Mulai" type="date" />
            </div>
            <div class="col-12 col-md-4">
              <q-input filled v-model="tanggalAkhir" label="Tanggal Akhir" type="date" />
            </div>
            <div class="col-12 col-md-4">
              <q-btn label="Tampilkan" color="primary" @click="filterData" :loading="loading" />
            </div>
          </div>
        </q-card-section>

        <q-separator />

        <q-card-section>
          <q-table :rows="filteredData" :columns="columns" row-key="id" flat dense bordered />
        </q-card-section>

        <q-separator />

        <q-card-actions align="right">
          <q-btn label="Export PDF" color="negative" @click="exportToPDF" />
          <q-btn label="Export Excel" color="green" @click="exportToExcel" />
        </q-card-actions>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import { api } from 'boot/axios'
import { API_URL } from 'boot/api'
//import { exportFile } from 'quasar' // untuk Excel
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const tanggalMulai = ref('')
const tanggalAkhir = ref('')
const data = ref([])
const filteredData = ref([])
const loading = ref(false)
const userEmail = JSON.parse(localStorage.getItem('auth_user'))?.user?.email || ''
// const columns = [
//   { name: 'tanggal', label: 'Tanggal', field: 'tanggal', align: 'left' },
//   { name: 'no_faktur', label: 'No Faktur', field: 'no_faktur', align: 'left' },
//   { name: 'supplier', label: 'Supplier', field: 'supplier', align: 'left' },
//   {
//     name: 'total',
//     label: 'Total',
//     field: 'total',
//     align: 'right',
//     format: (val) => `Rp ${val.toLocaleString('id-ID')}`,
//   },
// ]

const columns = [
  { name: 'tanggal_debet', label: 'Tanggal', field: 'tanggal_debet', align: 'left' },
  { name: 'nama_coa_debet', label: 'Nama Akun Debet', field: 'nama_coa_debet', align: 'left' },
  { name: 'nama_coa_kredit', label: 'Nama Akun Kredit', field: 'nama_coa_kredit', align: 'left' },
  {
    name: 'debet',
    label: 'Jumlah',
    field: 'debet',
    align: 'right',
    format: (val) => `Rp ${(Number(val) || 0).toLocaleString('id-ID')}`,
  },
]

async function filterData() {
  loading.value = true
  try {
    const res = await api.get(`${API_URL}/laporan/penerimaan`, {
      params: {
        tanggal_mulai: tanggalMulai.value,
        tanggal_akhir: tanggalAkhir.value,
        email: userEmail,
      },
    })
    console.log(res)

    data.value = res.data.data || []
    filteredData.value = data.value
  } catch (err) {
    console.error('Gagal mengambil data laporan:', err)
  } finally {
    loading.value = false
  }
}

const exportToExcel = () => {
  // Buat worksheet dari data
  const worksheet = XLSX.utils.json_to_sheet(
    filteredData.value.map((row) => ({
      Tanggal: row.tanggal_debet,
      'Nama Akun Debet': row.nama_coa_debet,
      'Nama Akun Kredit': row.nama_coa_kredit,
      Debet: row.debet,
    })),
  )

  // Buat workbook
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan')

  // Simpan ke file Excel
  XLSX.writeFile(
    workbook,
    `laporan_penerimaan_${formatTanggal(tanggalMulai.value)}_s.d_${formatTanggal(tanggalAkhir.value)}.xlsx`,
  )
}

function exportToPDF() {
  const doc = new jsPDF({
    orientation: 'potrait',
    unit: 'mm',
    format: 'a4',
  })

  // Judul di tengah
  const title = `Laporan Penerimaan Tanggal ${formatTanggal(tanggalMulai.value)} s.d ${formatTanggal(tanggalAkhir.value)}`
  const pageWidth = doc.internal.pageSize.getWidth()
  const textWidth = doc.getTextWidth(title)
  doc.setFontSize(14)
  doc.text(title, (pageWidth - textWidth) / 2, 10)
  const formatNumber = (val) =>
    val != null && !isNaN(val) ? new Intl.NumberFormat('id-ID').format(val) : '0'
  // Header dengan colspan
  autoTable(doc, {
    startY: 20,
    head: [
      [
        { content: 'Tanggal' },

        { content: 'Nama Akun Debet' },
        { content: 'Nama Akun Kredit' },
        { content: 'Debit', styles: { halign: 'center' } },
      ],
    ],
    body: filteredData.value.map((row) => [
      formatTanggal(row.tanggal_debet),
      row.nama_coa_debet,
      row.nama_coa_kredit,
      formatNumber(row.debet),
    ]),
    styles: { fontSize: 10 },
    theme: 'grid',
    columnStyles: {
      3: { halign: 'right' }, // index 3 = kolom Debit
    },
  })

  doc.save(
    `laporan penerimaan ${formatTanggal(tanggalMulai.value)} s.d ${formatTanggal(tanggalAkhir.value)}.pdf`,
  )
}

function formatTanggal(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
</script>
