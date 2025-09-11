<template>
  <q-page padding>
    <q-card class="q-pa-md">
      <q-card-section class="row items-center q-col-gutter-md">
        <div class="text-h6 col-12 col-sm">Laporan Neraca</div>

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
        <!-- Loop Header -->
        <div v-for="header in headers" :key="header.id">
          <!-- tampilkan hanya kalau ada COA yang ada nominalnya -->
          <q-expansion-item
            v-if="header.masterCoaFiltered.length"
            :label="header.nama_header"
            expand-separator
            default-opened
          >
            <!-- Table Master COA -->
            <q-table
              :rows="header.masterCoaFiltered"
              :columns="columns"
              row-key="id"
              flat
              dense
              hide-bottom
            >
              <template v-slot:body-cell-debet="props">
                <q-td :props="props">
                  {{ formatRupiah(props.row.debet) }}
                </q-td>
              </template>

              <template v-slot:body-cell-kredit="props">
                <q-td :props="props">
                  {{ formatRupiah(props.row.kredit) }}
                </q-td>
              </template>

              <template v-slot:body-cell-saldo="props">
                <q-td :props="props">
                  {{ formatRupiah(props.row.saldo) }}
                </q-td>
              </template>

              <!-- 👇 Tambah total di bawah tabel -->
              <template v-slot:bottom-row>
                <q-tr class="bg-grey-2 text-weight-bold">
                  <q-td colspan="1" class="text-right"> Total {{ header.nama_header }} </q-td>
                  <q-td class="text-right">
                    {{ formatRupiah(totalDebet(header.masterCoaFiltered)) }}
                  </q-td>
                  <q-td class="text-right">
                    {{ formatRupiah(totalKredit(header.masterCoaFiltered)) }}
                  </q-td>
                  <q-td class="text-right">
                    {{ formatRupiah(totalSaldo(header.masterCoaFiltered)) }}
                  </q-td>
                </q-tr>
              </template>
            </q-table>
          </q-expansion-item>
        </div>
      </q-list>
      <q-separator spaced />

      <!-- Grand Total -->
      <div class="row q-col-gutter-md q-mt-md text-weight-bold">
        <div class="col-6">
          <q-card flat bordered class="q-pa-sm">
            <div class="row items-center">
              <div class="col">Total Assets :</div>
              <div class="col-auto">{{ formatRupiah(totalAssets) }}</div>
            </div>
          </q-card>
        </div>
        <div class="col-6">
          <q-card flat bordered class="q-pa-sm">
            <div class="row items-center">
              <div class="col">Total Liabilities & Equity :</div>
              <div class="col-auto">{{ formatRupiah(totalLiabilities) }}</div>
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
const bulan = ref(new Date().toISOString().slice(0, 7)) // default bulan ini

const columns = [
  { name: 'nama_akun_ind', label: 'Nama Akun', field: 'nama_akun_ind', align: 'left' },
  { name: 'debet', label: 'Debet', field: 'debet', align: 'right' },
  { name: 'kredit', label: 'Kredit', field: 'kredit', align: 'right' },
  { name: 'saldo', label: 'Saldo', field: 'saldo', align: 'right' },
]

function exportPDF() {
  const doc = new jsPDF('landscape')
  const pageWidth = doc.internal.pageSize.getWidth()

  // Judul
  doc.setFontSize(16)
  const title = 'Laporan Neraca'
  const titleWidth = doc.getTextWidth(title)
  doc.text(title, (pageWidth - titleWidth) / 2, 20)

  // Keterangan bulan & tahun
  const [tahun] = bulan.value.split('-')
  const namaBulan = new Date(bulan.value + '-01').toLocaleString('id-ID', { month: 'long' })
  const subtitle = `Periode: ${namaBulan} ${tahun}`
  doc.setFontSize(12)
  const subtitleWidth = doc.getTextWidth(subtitle)
  doc.text(subtitle, (pageWidth - subtitleWidth) / 2, 30)

  let startY = 40

  headers.value.forEach((header) => {
    if (!header.masterCoaFiltered.length) return

    // Tulis nama header
    doc.setFontSize(12)
    doc.text(header.nama_header, 14, startY)
    startY += 6

    // Table per header
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

  // Grand Total table
  autoTable(doc, {
    body: [
      ['Total Assets', formatRupiah(totalAssets.value)],
      ['Total Liabilities & Equity', formatRupiah(totalLiabilities.value)],
    ],
    startY,
    theme: 'grid',
    styles: { fontSize: 10 },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right' },
    },
    headStyles: {
      fillColor: [230, 230, 230],
      textColor: [0, 0, 0],
      halign: 'center',
    },
  })

  doc.save(`Laporan_Neraca_${bulan.value}.pdf`)
}

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

  XLSX.writeFile(wb, `Laporan-Neraca-${bulan.value}.xlsx`)
}

const totalAssets = computed(() => {
  return headers.value
    .filter((h) => h.id === 1) // hanya Current assets
    .reduce((sum, h) => sum + totalSaldo(h.masterCoaAll), 0)
})

const totalLiabilities = computed(() => {
  return headers.value
    .filter((h) => [2, 3, 4, 5].includes(h.id)) // Fixed assets + Liabilities + Equity
    .reduce((sum, h) => sum + totalSaldo(h.masterCoaAll), 0)
})

const userEmail = JSON.parse(localStorage.getItem('auth_user'))?.user?.email || ''
function totalDebet(rows) {
  return rows.reduce((sum, r) => sum + (parseFloat(r.debet) || 0), 0)
}
function totalKredit(rows) {
  return rows.reduce((sum, r) => sum + (parseFloat(r.kredit) || 0), 0)
}
function totalSaldo(rows) {
  return rows.reduce((sum, r) => sum + (parseFloat(r.saldo) || 0), 0)
}
function formatRupiah(value) {
  if (!value) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value)
}

async function fetchData() {
  try {
    const res = await axios.get(`${API_URL}/laporan/neraca`, {
      params: {
        bulan: bulan.value,
        email: userEmail,
      },
    })
    headers.value = res.data.data.map((h) => {
      const masterCoaAll = h.masterCoa.map((c) => ({
        ...c,
        saldo: (parseFloat(c.debet) || 0) - (parseFloat(c.kredit) || 0),
      }))
      const masterCoaFiltered = h.masterCoa
        .map((c) => ({
          ...c,
          saldo: (parseFloat(c.debet) || 0) - (parseFloat(c.kredit) || 0),
        }))
        .filter((c) => c.saldo !== 0)

      return {
        ...h,
        masterCoaAll,
        masterCoaFiltered,
      }
    })
    //console.log(res)
  } catch (err) {
    console.error('Gagal fetch API:', err)
  }
}

onMounted(fetchData)
</script>
