<template>
  <q-page class="q-pa-md bg-grey-2">
    <q-card class="q-pa-md q-mx-auto" style="max-width: 500px">
      <q-card-section class="row items-center q-gutter-sm">
        <q-icon name="sync" color="primary" size="40px" />
        <div>
          <div class="text-h6">Sinkronisasi Data</div>
          <div class="text-subtitle2 text-grey">Pastikan Anda terhubung ke internet.</div>
        </div>
      </q-card-section>

      <q-separator spaced />

      <q-card-section>
        <q-btn
          label="Mulai Sinkronisasi"
          color="primary"
          icon="cloud_download"
          :loading="loading"
          @click="syncSemua"
          class="full-width"
        />
      </q-card-section>
    </q-card>
  </q-page>
</template>
<script setup>
import { ref } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'boot/axios'
import { API_URL } from 'boot/api'

const $q = useQuasar()
const loading = ref(false)

const authUser = JSON.parse(localStorage.getItem('auth_user') || '{}')
const userEmail = authUser?.user?.email || ''

// Local keys
const localKeyPembelian = 'pembelian_data'
const localKeyPenjualan = 'penjualan_data'
const localKeyJurnalUmum = 'jurnal_umum_data'
const localKeyPenerimaanData = 'penerimaan_data'
const localKeyPengeluaranData = 'pengeluaran_data'

async function syncSemua() {
  loading.value = true
  try {
    // Berurutan biar aman
    await syncData(localKeyPembelian, 'pembelian')
    await syncData(localKeyPenjualan, 'penjualan')
    await syncData(localKeyJurnalUmum, 'jurnal_umum')
    await syncData(localKeyPenerimaanData, 'penerimaan')
    await syncData(localKeyPengeluaranData, 'pengeluaran')
  } catch (err) {
    console.error('Sync semua error:', err)
    $q.notify({
      type: 'negative',
      message: 'Gagal sinkronisasi keseluruhan',
    })
  } finally {
    loading.value = false
  }
}

async function syncData(localKey, endpoint) {
  try {
    const localData = JSON.parse(localStorage.getItem(localKey) || '[]')
    if (!Array.isArray(localData)) {
      console.warn(`Data lokal ${endpoint} bukan array, reset ke []`)
      localStorage.setItem(localKey, '[]')
      return
    }

    let uploadCount = 0

    // Upload data lokal
    for (const item of localData) {
      if (!item?.synced) {
        try {
          const payload = { ...item, email: userEmail }
          const res = await api.post(`${API_URL}/${endpoint}`, payload)

          item.synced = true
          if (res?.data?.id) item.id = res.data.id
          uploadCount++
        } catch (err) {
          console.warn(`Gagal upload ${endpoint}:`, err)
        }
      }
    }

    // Ambil ulang dari server
    const res = await api.get(`${API_URL}/${endpoint}`, {
      params: { email: userEmail },
    })
    const serverData = res?.data?.data || []

    // Map untuk pencocokan local_id
    const serverMap = new Map()
    for (const srv of serverData) {
      if (srv?.local_id) serverMap.set(srv.local_id, srv)
    }

    // Gabungkan server + lokal
    const merged = [...serverData]
    for (const localItem of localData) {
      const exists = localItem?.local_id && serverMap.has(localItem.local_id)
      if (!exists) merged.push(localItem)
    }

    // Simpan hasil merge
    localStorage.setItem(localKey, JSON.stringify(merged))

    $q.notify({
      type: 'positive',
      message: `Sinkronisasi ${endpoint} selesai. ${uploadCount} data berhasil dikirim.`,
    })
  } catch (err) {
    console.error(`Gagal sinkronisasi ${endpoint}:`, err)
    $q.notify({
      type: 'negative',
      message: `Gagal sinkronisasi ${endpoint}. Periksa koneksi internet Anda.`,
    })
  }
}
// import { ref } from 'vue'
// import { useQuasar } from 'quasar'
// import { api } from 'boot/axios'
// import { API_URL } from 'boot/api'

// const $q = useQuasar()
// const loading = ref(false)
// const syncStatus = ref({ message: '', color: '' })

// const userEmail = JSON.parse(localStorage.getItem('auth_user'))?.user?.email || ''
// const localKey = 'pembelian_data'

// async function syncPembelian() {
//   loading.value = true
//   syncStatus.value = { message: '', color: '' }

//   try {
//     // Ambil data lokal
//     const localData = JSON.parse(localStorage.getItem(localKey) || '[]')

//     let uploadCount = 0

//     // Kirim data lokal yang belum disinkron
//     for (const item of localData) {
//       if (!item.synced) {
//         try {
//           const payload = { ...item, email: userEmail }

//           // Kirim ke server
//           const res = await api.post(`${API_URL}/pembelian`, payload)

//           // Tandai sudah sync dan update id jika server kirim balik
//           item.synced = true
//           item.id = res.data.id || item.id
//           uploadCount++
//         } catch (uploadErr) {
//           console.warn('Gagal upload data lokal:', uploadErr)
//         }
//       }
//     }

//     // Ambil ulang data dari server
//     const res = await api.get(`${API_URL}/pembelian`, {
//       params: { email: userEmail },
//     })
//     const serverData = res.data.data || []

//     // Buat map dari serverData berdasarkan local_id
//     const serverMap = new Map()
//     for (const item of serverData) {
//       if (item.local_id) {
//         serverMap.set(item.local_id, item)
//       }
//     }

//     // Gabungkan data server + data lokal yang belum ada di server
//     const merged = [...serverData]
//     for (const localItem of localData) {
//       const exists = localItem.local_id && serverMap.has(localItem.local_id)
//       if (!exists) {
//         merged.push(localItem)
//       }
//     }

//     // Simpan hasil akhir ke localStorage
//     localStorage.setItem(localKey, JSON.stringify(merged))

//     $q.notify({
//       type: 'positive',
//       message: `Sinkronisasi selesai. ${uploadCount} data berhasil dikirim.`,
//     })
//   } catch (err) {
//     console.error('Gagal sinkronisasi:', err)
//     $q.notify({
//       type: 'negative',
//       message: 'Gagal sinkronisasi. Periksa koneksi internet Anda.',
//     })
//   } finally {
//     loading.value = false
//   }
// }
</script>
