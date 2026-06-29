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
                <!-- Baris Total header (Assets / Liabilities / Equity dll) -->
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

                <!-- Baris Net Profit, muncul hanya di header Equity (id = 5) -->
                <q-tr v-if="header.id === 5" class="bg-grey-1 text-weight-bold">
                  <!-- Gabungkan 3 kolom pertama, nilai ada di kolom Saldo -->
                  <q-td colspan="3" class="text-right"> Net Profit </q-td>
                  <q-td class="text-right">
                    {{ formatRupiah(netProfit) }}
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
const netProfit = ref(0)
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

// const totalAssets = computed(() => {
//   return headers.value
//     .filter((h) => h.id === 1) // hanya Current assets
//     .reduce((sum, h) => sum + totalSaldo(h.masterCoaAll), 0)
// })

// const totalCurrentAssets = computed(() => {
//   return headers.value
//     .filter((h) => h.id === 2) // hanya Current assets
//     .reduce((sum, h) => sum + totalSaldo(h.masterCoaAll), 0)
// })

// const totalLiabilities = computed(() => {
//   return headers.value
//     .filter((h) => [2, 3, 4, 5].includes(h.id)) // Fixed assets + Liabilities + Equity
//     .reduce((sum, h) => sum + totalSaldo(h.masterCoaAll), 0)
// })

// 🔹 Asset tetap / non-current
const totalFixedAssets = computed(() => {
  return totalByHeaderId(1)
})

const totalCurrentAssets = computed(() => {
  return totalByHeaderId(2)
})

const totalAssets = computed(() => {
  return totalFixedAssets.value + totalCurrentAssets.value
})

const totalCurrentLiabilities = computed(() => {
  return totalByHeaderIds([3, 4])
})

const totalOwnerEquity = computed(() => {
  return totalByHeaderId(5)
})

const totalPrive = computed(() => {
  return totalByHeaderId(10)
})

const totalLiabilities = computed(() => {
  return totalCurrentLiabilities.value + totalOwnerEquity.value + netProfit.value - totalPrive.value
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
  const num = Number(value) || 0
  const sign = num < 0 ? '-' : ''

  return (
    sign +
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(Math.abs(num))
  )
}

const ASSET_HEADERS = [1, 2] // Fixed Assets, Current Assets
const LIABILITY_EQUITY_HEADERS = [3, 4, 5] // Liabilities, Equity
const REVENUE_HEADERS = [6, 8] // Revenue, Other Revenue

function hitungSaldoNeraca(headerId, row) {
  const id = Number(headerId)
  const debet = parseFloat(row.debet) || 0
  const kredit = parseFloat(row.kredit) || 0

  // Assets normal balance = Debet - Kredit
  if (ASSET_HEADERS.includes(id)) {
    return debet - kredit
  }

  // Liabilities & Equity normal balance = Kredit - Debet
  if (LIABILITY_EQUITY_HEADERS.includes(id)) {
    return kredit - debet
  }

  // Prive normal balance = Debet - Kredit
  if (id === 10) {
    return debet - kredit
  }

  return debet - kredit
}

function hitungSaldoLabaRugi(headerId, row) {
  const id = Number(headerId)
  const debet = parseFloat(row.debet) || 0
  const kredit = parseFloat(row.kredit) || 0

  // Revenue normal balance = Kredit - Debet
  if (REVENUE_HEADERS.includes(id)) {
    return kredit - debet
  }

  // Pembelian, Expenses, Other Losses = Debet - Kredit
  return debet - kredit
}

function totalByHeaderId(id) {
  return headers.value
    .filter((h) => Number(h.id) === id)
    .reduce((sum, h) => sum + totalSaldo(h.masterCoaAll), 0)
}

function totalByHeaderIds(ids) {
  return headers.value
    .filter((h) => ids.includes(Number(h.id)))
    .reduce((sum, h) => sum + totalSaldo(h.masterCoaAll), 0)
}

async function fetchData() {
  try {
    const [neracaRes, labaRugiRes] = await Promise.all([
      axios.get(`${API_URL}/laporan/neraca`, {
        params: {
          bulan: bulan.value,
          email: userEmail,
        },
      }),
      axios.get(`${API_URL}/laporan/laba-rugi`, {
        params: {
          bulan: bulan.value,
          email: userEmail,
        },
      }),
    ])

    // Proses data NERACA
    headers.value = neracaRes.data.data.map((h) => {
      const masterCoaAll = h.masterCoa.map((c) => ({
        ...c,
        saldo: hitungSaldoNeraca(h.id, c),
      }))

      const masterCoaFiltered = masterCoaAll.filter((c) => Number(c.saldo) !== 0)

      return {
        ...h,
        masterCoaAll,
        masterCoaFiltered,
      }
    })

    // Proses data LABA RUGI untuk hitung net profit
    const labaHeaders = labaRugiRes.data.data.map((h) => {
      const masterCoaAll = h.masterCoa.map((c) => ({
        ...c,
        saldo: hitungSaldoLabaRugi(h.id, c),
      }))

      return {
        ...h,
        masterCoaAll,
      }
    })

    const totalSaldoLocal = (rows) => {
      return rows.reduce((s, r) => s + (parseFloat(r.saldo) || 0), 0)
    }

    const sumLabaRugiByHeaderIds = (ids) => {
      return labaHeaders
        .filter((h) => ids.includes(Number(h.id)))
        .reduce((sum, h) => sum + totalSaldoLocal(h.masterCoaAll), 0)
    }

    const rev = sumLabaRugiByHeaderIds([6])
    const otherRev = sumLabaRugiByHeaderIds([8])
    const exp = sumLabaRugiByHeaderIds([7])
    const otherLoss = sumLabaRugiByHeaderIds([9])
    const pur = sumLabaRugiByHeaderIds([0])

    netProfit.value = rev + otherRev - pur - exp - otherLoss

    console.log('Total Assets:', totalAssets.value)
    console.log('Total Liabilities & Equity:', totalLiabilities.value)
    console.log('Net Profit:', netProfit.value)
  } catch (err) {
    console.error('Gagal fetch API:', err)
  }
}

onMounted(fetchData)
</script>
