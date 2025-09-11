<template>
  <q-page padding>
    <q-card class="q-pa-md">
      <q-card-section class="row items-center q-col-gutter-md">
        <div class="text-h6 col-12 col-sm">Laporan Laba Rugi</div>

        <div class="col-12 col-sm-4 col-md-3">
          <q-input
            v-model="bulan"
            type="month"
            outlined
            dense
            class="full-width"
            @update:model-value="fetchData"
          />
        </div>

        <div class="col-12 col-sm-auto q-mt-sm q-mt-none">
          <q-btn
            color="red"
            icon="picture_as_pdf"
            label="Export PDF"
            class="q-mr-sm"
            @click="exportPDF"
          />
          <q-btn color="green" icon="grid_on" label="Export Excel" @click="exportExcel" />
        </div>
      </q-card-section>

      <q-list bordered separator>
        <div v-for="header in headers" :key="header.id">
          <q-expansion-item
            v-if="header.masterCoaFiltered.length"
            :label="header.nama_header"
            expand-separator
            default-opened
          >
            <q-table
              :rows="header.masterCoaFiltered"
              :columns="columns"
              row-key="id"
              flat
              dense
              hide-bottom
            >
              <template v-slot:body-cell-debet="props">
                <q-td :props="props">{{ formatRupiah(props.row.debet) }}</q-td>
              </template>
              <template v-slot:body-cell-kredit="props">
                <q-td :props="props">{{ formatRupiah(props.row.kredit) }}</q-td>
              </template>
              <template v-slot:body-cell-saldo="props">
                <q-td :props="props">{{ formatRupiah(props.row.saldo) }}</q-td>
              </template>

              <template v-slot:bottom-row>
                <q-tr class="bg-grey-2 text-weight-bold">
                  <q-td colspan="1" class="text-right"> Total {{ header.nama_header }} </q-td>
                  <q-td class="text-right">{{
                    formatRupiah(totalDebet(header.masterCoaFiltered))
                  }}</q-td>
                  <q-td class="text-right">{{
                    formatRupiah(totalKredit(header.masterCoaFiltered))
                  }}</q-td>
                  <q-td class="text-right">{{
                    formatRupiah(totalSaldo(header.masterCoaFiltered))
                  }}</q-td>
                </q-tr>
              </template>
            </q-table>
          </q-expansion-item>
        </div>
      </q-list>

      <q-separator spaced />

      <!-- Grand Total (Net Profit / Loss) -->
      <div class="row q-col-gutter-md q-mt-md text-weight-bold">
        <div class="col-12">
          <q-card flat bordered class="q-pa-sm bg-grey-2">
            <div class="row items-center">
              <div class="col">Net Profit / Loss :</div>
              <div class="col-auto">{{ formatRupiah(netProfit) }}</div>
            </div>
          </q-card>
        </div>
      </div>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { API_URL } from 'boot/api'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const headers = ref([])
const bulan = ref(new Date().toISOString().slice(0, 7))

const columns = [
  { name: 'nama_akun_ind', label: 'Nama Akun', field: 'nama_akun_ind', align: 'left' },
  { name: 'debet', label: 'Debet', field: 'debet', align: 'right' },
  { name: 'kredit', label: 'Kredit', field: 'kredit', align: 'right' },
  { name: 'saldo', label: 'Saldo', field: 'saldo', align: 'right' },
]

// Export PDF
function exportPDF() {
  const doc = new jsPDF('landscape')
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(16)
  const title = 'Laporan Laba Rugi'
  doc.text(title, (pageWidth - doc.getTextWidth(title)) / 2, 20)

  const [tahun] = bulan.value.split('-')
  const namaBulan = new Date(bulan.value + '-01').toLocaleString('id-ID', { month: 'long' })
  const subtitle = `Periode: ${namaBulan} ${tahun}`
  doc.setFontSize(12)
  doc.text(subtitle, (pageWidth - doc.getTextWidth(subtitle)) / 2, 30)

  let startY = 40

  headers.value.forEach((header) => {
    if (!header.masterCoaFiltered.length) return
    doc.setFontSize(12)
    doc.text(header.nama_header, 14, startY)
    startY += 6

    autoTable(doc, {
      head: [['Kode Akun', 'Nama Akun', 'Debet', 'Kredit', 'Saldo']],
      body: header.masterCoaFiltered.map((row) => [
        row.nomor_akun,
        row.nama_akun_ind,
        formatRupiah(row.debet),
        formatRupiah(row.kredit),
        formatRupiah(row.saldo),
      ]),
      startY,
      theme: 'grid',
      styles: { fontSize: 10 },
      foot: [
        [
          {
            content: `Total ${header.nama_header}`,
            colSpan: 2,
            styles: { halign: 'right', fontStyle: 'bold' },
          },
          {
            content: formatRupiah(totalDebet(header.masterCoaFiltered)),
            styles: { halign: 'right', fontStyle: 'bold' },
          },
          {
            content: formatRupiah(totalKredit(header.masterCoaFiltered)),
            styles: { halign: 'right', fontStyle: 'bold' },
          },
          {
            content: formatRupiah(totalSaldo(header.masterCoaFiltered)),
            styles: { halign: 'right', fontStyle: 'bold' },
          },
        ],
      ],
      didDrawPage: (data) => {
        startY = data.cursor.y + 10
      },
    })
  })

  // Net Profit / Loss
  autoTable(doc, {
    body: [['Net Profit / Loss', formatRupiah(netProfit.value)]],
    startY,
    theme: 'plain',
    styles: { fontSize: 12, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right' } },
  })

  doc.save(`Laporan_LabaRugi_${bulan.value}.pdf`)
}

// Export Excel
function exportExcel() {
  const wb = XLSX.utils.book_new()
  headers.value.forEach((header) => {
    if (header.masterCoaFiltered.length) {
      const sheetData = [
        ['Nama Akun', 'Debet', 'Kredit', 'Saldo'],
        ...header.masterCoaFiltered.map((row) => [
          row.nama_akun_ind,
          row.debet,
          row.kredit,
          row.saldo,
        ]),
        [
          'Total ' + header.nama_header,
          totalDebet(header.masterCoaFiltered),
          totalKredit(header.masterCoaFiltered),
          totalSaldo(header.masterCoaFiltered),
        ],
      ]
      const ws = XLSX.utils.aoa_to_sheet(sheetData)
      XLSX.utils.book_append_sheet(wb, ws, header.nama_header.substring(0, 30))
    }
  })
  XLSX.writeFile(wb, `Laporan-LabaRugi-${bulan.value}.xlsx`)
}

// 💡 Hitung Net Profit = (revenues + other revenues) - (expenses + other losses)
const totalRevenues = computed(() => {
  return headers.value
    .filter((h) => [6, 8].includes(h.id))
    .reduce((sum, h) => sum + totalSaldo(h.masterCoaAll), 0)
})
const totalExpenses = computed(() => {
  return headers.value
    .filter((h) => [7, 9].includes(h.id))
    .reduce((sum, h) => sum + totalSaldo(h.masterCoaAll), 0)
})
const netProfit = computed(() => totalRevenues.value - totalExpenses.value)

const userEmail = JSON.parse(localStorage.getItem('auth_user'))?.user?.email || ''
function totalDebet(rows) {
  return rows.reduce((s, r) => s + (parseFloat(r.debet) || 0), 0)
}
function totalKredit(rows) {
  return rows.reduce((s, r) => s + (parseFloat(r.kredit) || 0), 0)
}
function totalSaldo(rows) {
  return rows.reduce((s, r) => s + (parseFloat(r.saldo) || 0), 0)
}
function formatRupiah(value) {
  if (!value) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value)
}

// Ambil data dari API
async function fetchData() {
  try {
    const res = await axios.get(`${API_URL}/laporan/laba-rugi`, {
      params: { bulan: bulan.value, email: userEmail },
    })
    headers.value = res.data.data.map((h) => {
      const masterCoaAll = h.masterCoa.map((c) => ({
        ...c,
        saldo: (parseFloat(c.debet) || 0) - (parseFloat(c.kredit) || 0),
      }))
      const masterCoaFiltered = masterCoaAll.filter((c) => c.saldo !== 0)
      return { ...h, masterCoaAll, masterCoaFiltered }
    })
  } catch (err) {
    console.error('Gagal fetch API:', err)
  }
}

onMounted(fetchData)
</script>
