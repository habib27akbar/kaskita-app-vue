<template>
  <div class="q-pa-md">
    <!-- Filter Bulan -->
    <div class="row items-center q-gutter-sm q-mb-md">
      <div class="col-12 col-sm-3">
        <q-input filled v-model="bulan" type="month" label="Pilih Bulan" @change="getData" />
      </div>
      <div class="col-12 col-sm-auto">
        <q-btn color="primary" label="Export PDF" @click="exportPDF" icon="picture_as_pdf" />
        <q-btn
          color="green"
          label="Export Excel"
          @click="exportExcel"
          icon="table_view"
          class="q-ml-sm"
        />
      </div>
    </div>

    <!-- Data Tabel -->
    <q-table
      title="Laporan Arus Kas"
      :rows="rows"
      :columns="columns"
      row-key="bulan"
      flat
      bordered
      class="shadow-2 rounded-borders"
    >
      <!-- Format Bulan -->
      <template v-slot:body-cell-bulan="props">
        <q-td :props="props">
          {{ formatBulan(props.row.bulan) }}
        </q-td>
      </template>

      <!-- Format angka -->
      <template v-slot:body-cell-kas_masuk="props">
        <q-td :props="props">
          {{ numberFormat(props.row.kas_masuk) }}
        </q-td>
      </template>
      <template v-slot:body-cell-kas_keluar="props">
        <q-td :props="props">
          {{ numberFormat(props.row.kas_keluar) }}
        </q-td>
      </template>
      <template v-slot:body-cell-saldo_akhir="props">
        <q-td :props="props">
          {{ numberFormat(props.row.saldo_akhir) }}
        </q-td>
      </template>

      <!-- Footer total -->
      <template v-slot:bottom-row>
        <q-tr>
          <q-td colspan="1"><b>Total</b></q-td>
          <q-td align="right"
            ><b>{{ numberFormat(totalKasMasuk) }}</b></q-td
          >
          <q-td align="right"
            ><b>{{ numberFormat(totalKasKeluar) }}</b></q-td
          >
          <q-td align="right"
            ><b>{{ numberFormat(totalSaldoAkhir) }}</b></q-td
          >
        </q-tr>
      </template>
    </q-table>

    <!-- Responsive Card untuk mobile -->
    <div class="q-mt-md row q-col-gutter-md justify-center">
      <div v-for="(item, idx) in rows" :key="idx" class="col-12 col-sm-4">
        <q-card class="shadow-2 rounded-borders">
          <q-card-section>
            <div class="text-h6">{{ formatBulan(item.bulan) }}</div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <div><b>Kas Masuk:</b> {{ numberFormat(item.kas_masuk) }}</div>
            <div><b>Kas Keluar:</b> {{ numberFormat(item.kas_keluar) }}</div>
            <div><b>Saldo Akhir:</b> {{ numberFormat(item.saldo_akhir) }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useQuasar } from 'quasar'
import axios from 'axios'
import { API_URL } from 'boot/api'

// export libraries
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const $q = useQuasar()
const bulan = ref(new Date().toISOString().slice(0, 7)) // default bulan ini
const rows = ref([])
const userEmail = JSON.parse(localStorage.getItem('auth_user'))?.user?.email || ''

const columns = [
  { name: 'bulan', label: 'Bulan', field: 'bulan', align: 'left' },
  { name: 'kas_masuk', label: 'Kas Masuk', field: 'kas_masuk', align: 'right' },
  { name: 'kas_keluar', label: 'Kas Keluar', field: 'kas_keluar', align: 'right' },
  { name: 'saldo_akhir', label: 'Saldo Akhir', field: 'saldo_akhir', align: 'right' },
]

// ambil data
const getData = async () => {
  try {
    $q.loading.show()
    const res = await axios.get(`${API_URL}/laporan/arus-kas`, {
      params: {
        bulan: bulan.value,
        email: userEmail,
      },
    })
    rows.value = res.data
  } catch (err) {
    $q.notify({ type: 'negative', message: err })
  } finally {
    $q.loading.hide()
  }
}

// helper number format
const numberFormat = (val) => {
  if (val == null) return '0'
  return new Intl.NumberFormat('id-ID').format(val)
}

// format bulan
const formatBulan = (bln) => {
  const date = new Date(bln)
  return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
}

// computed total
const totalKasMasuk = computed(() => rows.value.reduce((a, b) => a + (b.kas_masuk || 0), 0))
const totalKasKeluar = computed(() => rows.value.reduce((a, b) => a + (b.kas_keluar || 0), 0))
const totalSaldoAkhir = computed(() => rows.value.reduce((a, b) => a + (b.saldo_akhir || 0), 0))

// Export PDF
const exportPDF = () => {
  const doc = new jsPDF()
  doc.text(`Laporan Arus Kas - ${formatBulan(bulan.value)}`, 14, 10)
  autoTable(doc, {
    head: [['Bulan', 'Kas Masuk', 'Kas Keluar', 'Saldo Akhir']],
    body: rows.value
      .map((r) => [
        formatBulan(r.bulan),
        numberFormat(r.kas_masuk),
        numberFormat(r.kas_keluar),
        numberFormat(r.saldo_akhir),
      ])
      .concat([
        [
          'Total',
          numberFormat(totalKasMasuk.value),
          numberFormat(totalKasKeluar.value),
          numberFormat(totalSaldoAkhir.value),
        ],
      ]),
  })
  doc.save(`arus-kas-${bulan.value}.pdf`)
}

// Export Excel
const exportExcel = () => {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.value.map((r) => ({
      Bulan: formatBulan(r.bulan),
      'Kas Masuk': r.kas_masuk,
      'Kas Keluar': r.kas_keluar,
      'Saldo Akhir': r.saldo_akhir,
    })),
  )
  // tambah total di excel
  XLSX.utils.sheet_add_aoa(
    worksheet,
    [['Total', totalKasMasuk.value, totalKasKeluar.value, totalSaldoAkhir.value]],
    { origin: -1 },
  )

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Arus Kas')
  XLSX.writeFile(workbook, `arus-kas-${bulan.value}.xlsx`)
}

// load awal
getData()
</script>
