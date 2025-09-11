<template>
  <div class="q-pa-md">
    <div class="row q-gutter-sm items-center q-mb-md">
      <div class="col-auto">
        <q-input
          v-model="selectedMonth"
          type="month"
          label="Pilih Bulan"
          dense
          outlined
          @change="onMonthChange"
        />
      </div>
      <div class="col-auto">
        <q-btn label="Refresh" color="primary" @click="fetchCoaList" />
      </div>
      <div class="col-auto">
        <q-btn label="Export PDF" color="red" @click="exportPDF" />
      </div>
      <div class="col-auto">
        <q-btn label="Export Excel" color="green" @click="exportExcel" />
      </div>
    </div>

    <q-table
      title="Neraca Saldo"
      flat
      bordered
      :rows="rows"
      :columns="columns"
      row-key="id"
      separator="cell"
      :pagination="{ rowsPerPage: 0 }"
      :rows-per-page-options="[0]"
      wrap-cells
      :table-style="{ 'max-height': '500px' }"
      class="sticky-header-table"
      hide-bottom
    >
      <!-- Tampilkan Debet -->
      <template v-slot:body-cell-debet="props">
        <q-td :props="props" align="right">
          {{ (props.row.debet || 0).toLocaleString('id-ID') }}
        </q-td>
      </template>

      <!-- Tampilkan Kredit -->
      <template v-slot:body-cell-kredit="props">
        <q-td :props="props" align="right">
          {{ (props.row.kredit || 0).toLocaleString('id-ID') }}
        </q-td>
      </template>

      <!-- Footer total -->
      <template v-slot:bottom-row>
        <q-tr>
          <q-td colspan="2" class="text-bold text-right">Total</q-td>
          <q-td class="text-bold text-right">{{ totalDebet.toLocaleString() }}</q-td>
          <q-td class="text-bold text-right">{{ totalKredit.toLocaleString() }}</q-td>
        </q-tr>
      </template>
    </q-table>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from 'boot/axios'
import { API_URL } from 'boot/api'

// 🔹 import library untuk export
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const rows = ref([])
const LOCAL_KEY = 'neraca_saldo_data'

const columns = [
  { name: 'nomor_akun', label: 'Nomor', field: 'nomor_akun', align: 'left' },
  { name: 'nama_akun_ind', label: 'Nama Akun', field: 'nama_akun_ind', align: 'left' },
  { name: 'debet', label: 'Debet', field: 'debet', align: 'right', style: 'width: 190px' },
  { name: 'kredit', label: 'Kredit', field: 'kredit', align: 'right', style: 'width: 190px' },
]

function isOffline() {
  return !navigator.onLine
}

const totalDebet = computed(() => rows.value.reduce((sum, r) => sum + (r.debet || 0), 0))
const totalKredit = computed(() => rows.value.reduce((sum, r) => sum + (r.kredit || 0), 0))
const userEmail = JSON.parse(localStorage.getItem('auth_user'))?.user?.email || ''
const selectedMonth = ref(new Date().toISOString().slice(0, 7))

async function fetchCoaList() {
  if (isOffline()) {
    const offlineData = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
    rows.value = offlineData.filter((item) => item.email === userEmail)
    return
  }

  const { data } = await api.get(`${API_URL}/neraca-saldo`, {
    params: {
      email: userEmail,
      bln_tahun: selectedMonth.value,
    },
  })

  rows.value = data.map((item) => {
    const debet = Number(item.total_debet) || 0
    const kredit = Number(item.total_kredit) || 0

    return {
      id_coa: item.id_coa,
      nomor_akun: item.nomor_akun,
      nama_akun_ind: item.nama_akun,
      debet,
      kredit,
    }
  })
}

function formatMonthYear(ym) {
  if (!ym) return ''
  const [year, month] = ym.split('-')
  return `${month}/${year}`
}
// 🔹 Export ke PDF
function exportPDF() {
  const doc = new jsPDF()
  doc.text(`Neraca Saldo - ${formatMonthYear(selectedMonth.value)}`, 14, 10)

  autoTable(doc, {
    head: [['Nomor', 'Nama Akun', 'Debet', 'Kredit']],
    body: rows.value.map((r) => [
      r.nomor_akun,
      r.nama_akun_ind,
      (r.debet || 0).toLocaleString('id-ID'),
      (r.kredit || 0).toLocaleString('id-ID'),
    ]),
    foot: [
      [
        '',
        'TOTAL',
        totalDebet.value.toLocaleString('id-ID'),
        totalKredit.value.toLocaleString('id-ID'),
      ],
    ],
    startY: 20,
  })

  doc.save(`neraca-saldo-${selectedMonth.value}.pdf`)
}

// 🔹 Export ke Excel
function exportExcel() {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.value.map((r) => ({
      Nomor: r.nomor_akun,
      'Nama Akun': r.nama_akun_ind,
      Debet: r.debet,
      Kredit: r.kredit,
    })),
  )

  // Tambahkan total di bawah
  const totalRow = ['', 'TOTAL', totalDebet.value, totalKredit.value]
  XLSX.utils.sheet_add_aoa(worksheet, [totalRow], { origin: -1 })

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Neraca Saldo')
  XLSX.writeFile(workbook, `neraca-saldo-${selectedMonth.value}.xlsx`)
}

onMounted(() => {
  fetchCoaList()
})
</script>
<style>
.sticky-header-table thead tr th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: white;
}

.sticky-header-table tr.q-tr {
  position: sticky;
  bottom: 0;
  background: #f8f9fa; /* warna biar beda */
  font-weight: bold;
  z-index: 2; /* biar di atas tbody */
}
</style>
