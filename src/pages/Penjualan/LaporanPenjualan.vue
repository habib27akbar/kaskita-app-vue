<template>
  <q-page padding>
    <div class="q-gutter-md">
      <q-card>
        <q-card-section>
          <div class="text-h6">Laporan penjualan</div>
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
  { name: 'tanggal', label: 'Tanggal', field: 'tanggal', align: 'left' },
  { name: 'no_faktur', label: 'No Faktur', field: 'no_faktur', align: 'left' },
  { name: 'keterangan', label: 'Keterangan', field: 'keterangan', align: 'left' },
  { name: 'ref', label: 'Pos Ref', field: 'ref', align: 'left' },
  {
    name: 'piutang_dagang',
    label: 'Piutang Dagang',
    field: 'piutang_dagang',
    align: 'right',
    format: (val) => `Rp ${(Number(val) || 0).toLocaleString('id-ID')}`,
  },
  {
    name: 'ppn_keluaran',
    label: 'PPN Keluaran',
    field: 'ppn_keluaran',
    align: 'right',
    format: (val) => `Rp ${(Number(val) || 0).toLocaleString('id-ID')}`,
  },
  {
    name: 'biaya_angkut',
    label: 'Biaya Angkut',
    field: 'biaya_angkut',
    align: 'right',
    format: (val) => `Rp ${(Number(val) || 0).toLocaleString('id-ID')}`,
  },
  { name: 'discount', label: 'Discount', field: 'discount', align: 'right' },
]

async function filterData() {
  loading.value = true
  try {
    const res = await api.get(`${API_URL}/laporan/penjualan`, {
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

// function exportToExcel() {
//   const content = [
//     columns.map((col) => col.label),
//     ...filteredData.value.map((row) => columns.map((col) => row[col.field])),
//   ]

//   const csv = content.map((row) => row.join(',')).join('\n')

//   const status = exportFile('laporan_penjualan.csv', csv, 'text/csv')

//   if (!status) {
//     console.warn('Gagal meng-export CSV.')
//   }
// }

const exportToExcel = () => {
  // Buat worksheet dari data
  const worksheet = XLSX.utils.json_to_sheet(
    filteredData.value.map((row) => ({
      Tanggal: row.tanggal,
      'No. Faktur': row.no_faktur,
      Keterangan: row.keterangan,
      'Pos Ref': row.pos_ref,
      'Piutang Dagang': row.piutang_dagang,
      Penjualan: row.penjualan,
      'Biaya Angkut': row.biaya_angkut,
      'PPN Keluaran': row.ppn_keluaran,
      Discount: row.discount,
    })),
  )

  // Buat workbook
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan')

  // Simpan ke file Excel
  XLSX.writeFile(
    workbook,
    `laporan_penjualan_${formatTanggal(tanggalMulai.value)}_s.d_${formatTanggal(tanggalAkhir.value)}.xlsx`,
  )
}

function exportToPDF() {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  // Judul di tengah
  const title = `Laporan Penjualan Tanggal ${formatTanggal(tanggalMulai.value)} s.d ${formatTanggal(tanggalAkhir.value)}`
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

        { content: 'No. Faktur' },
        { content: 'Keterangan' },
        { content: 'Pos Ref' },
        { content: 'Debit', colSpan: 1, styles: { halign: 'center' } },
        { content: 'Kredit', colSpan: 4, styles: { halign: 'center' } },
      ],
      [
        { content: '' },

        { content: '' },
        { content: '' },
        { content: '' },
        { content: 'Piutang Dagang' },
        { content: 'Penjualan' },
        { content: 'Biaya Angkut' },
        { content: 'PPN Keluaran' },
        { content: 'Discount' },
      ],
    ],
    body: filteredData.value.map((row) => [
      row.tanggal,

      row.no_faktur,
      row.keterangan,
      row.pos_ref,
      formatNumber(row.piutang_dagang),
      formatNumber(row.penjualan),
      formatNumber(row.biaya_angkut),
      formatNumber(row.ppn_keluaran),
      formatNumber(row.discount),
    ]),
    styles: { fontSize: 10 },
    theme: 'grid',
  })

  doc.save(
    `laporan_penjualan ${formatTanggal(tanggalMulai.value)} s.d ${formatTanggal(tanggalAkhir.value)}.pdf`,
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
