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
    </div>
    <q-table
      title="Neraca Awal"
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
      <!-- Input Debet -->
      <template v-slot:body-cell-debet="props">
        <q-td :props="props" align="right">
          <q-input
            v-model="props.row.debetFormatted"
            dense
            outlined
            input-class="text-right"
            class="full-width"
            @update:model-value="(val) => onDebetInput(val, props.row)"
          />
        </q-td>
      </template>

      <!-- Input Kredit -->
      <template v-slot:body-cell-kredit="props">
        <q-td :props="props" align="right">
          <q-input
            v-model="props.row.kreditFormatted"
            dense
            outlined
            input-class="text-right"
            class="full-width"
            @update:model-value="(val) => onKreditInput(val, props.row)"
          />
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
    <div class="q-mt-md">
      <q-btn
        v-if="totalDebet === totalKredit"
        color="primary"
        label="Simpan"
        @click="simpanData"
        :loading="saving"
        :disable="saving"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { api } from 'boot/axios'
import { API_URL } from 'boot/api'
import { v4 as uuidv4 } from 'uuid'
import { useQuasar } from 'quasar'
const $q = useQuasar()
const saving = ref(false)
const rows = ref([])
const LOCAL_KEY = 'neraca_awal_data'
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

function onDebetInput(val, row) {
  const raw = val.replace(/\D/g, '')
  const number = parseInt(raw || '0')
  row.debet = number
  row.debetFormatted = number ? number.toLocaleString('id-ID') : ''
}

function onKreditInput(val, row) {
  const raw = val.replace(/\D/g, '')
  const number = parseInt(raw || '0')
  row.kredit = number
  row.kreditFormatted = number ? number.toLocaleString('id-ID') : ''
}

watch([totalDebet, totalKredit], ([d, k]) => {
  if (d !== k) {
    $q.notify({
      type: 'warning',
      message: '⚠️ Total Debet dan Kredit harus sama!',
      position: 'top',
      timeout: 1500,
    })
  }
})

async function simpanData() {
  if (saving.value) return // guard anti double-click

  if (totalDebet.value !== totalKredit.value) {
    $q.notify({
      type: 'negative',
      message: 'Total Debet tidak sama dengan Total Kredit!',
      position: 'top',
    })
    return
  }

  saving.value = true
  $q.loading.show({
    message: 'Menyimpan data...',
    boxClass: 'bg-grey-1 text-dark',
    spinnerSize: 40,
  })

  try {
    if (isOffline()) {
      let offlineData = JSON.parse(localStorage.getItem(LOCAL_KEY)) || []

      const newBatch = {
        local_id: uuidv4(),
        email: userEmail,
        bln_tahun: selectedMonth.value,
        data: rows.value.map((r) => ({
          id_coa: r.id_coa,
          debet: r.debet || 0,
          kredit: r.kredit || 0,
        })),
        synced: false,
        created_at: new Date().toISOString(),
      }

      offlineData.push(newBatch)
      localStorage.setItem(LOCAL_KEY, JSON.stringify(offlineData))

      $q.notify({
        type: 'warning',
        message: 'Data disimpan offline & menunggu sinkronisasi',
        position: 'top',
      })
    } else {
      const payload = {
        email: userEmail,
        bln_tahun: selectedMonth.value,
        data: rows.value.map((r) => ({
          id_coa: r.id_coa,
          debet: r.debet || 0,
          kredit: r.kredit || 0,
        })),
      }

      await api.post(`${API_URL}/neraca-awal`, payload)

      $q.notify({
        type: 'positive',
        message: 'Data berhasil disimpan',
        position: 'top',
      })
    }
  } catch (err) {
    console.error(err)
    $q.notify({
      type: 'negative',
      message: err?.message || 'Gagal menyimpan data',
      position: 'top',
    })
  } finally {
    $q.loading.hide()
    saving.value = false
  }
}

async function fetchCoaList() {
  if (isOffline()) {
    const offlineData = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
    rows.value = offlineData.filter((item) => item.email === userEmail)
    //pagination.total = rows.value.length
    //loading.value = false
    return
  }

  const { data } = await api.get(`${API_URL}/neraca-awal`, {
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
      debetFormatted: debet ? debet.toLocaleString('id-ID') : '',
      kreditFormatted: kredit ? kredit.toLocaleString('id-ID') : '',
    }
  })
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
