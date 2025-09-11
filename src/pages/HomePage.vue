<template>
  <q-page class="bg-blue-1 column justify-between">
    <div class="q-pa-md">
      <q-card flat bordered class="q-pa-md bg-white text-center">
        <q-card-section>
          <!-- Grid rapi 3 kolom -->
          <div class="menu-grid">
            <q-btn
              v-for="item in menuItems"
              :key="item.title"
              flat
              class="column items-center justify-start"
              :style="{ width: '80px', height: '120px', padding: '0' }"
              @click="navigate(item.route)"
            >
              <!-- Warna tile via inline style (pasti menang) -->
              <div
                class="q-mb-sm"
                :style="{
                  width: '60px',
                  height: '60px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: item.color,
                }"
              >
                <q-icon :name="item.icon" color="white" size="32px" />
              </div>

              <div
                class="text-caption text-weight-medium text-center"
                style="height: 32px; overflow: hidden; line-height: 1.2"
              >
                {{ item.title }}
              </div>
            </q-btn>
          </div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()

const menuItems = [
  { title: 'Pembelian', icon: 'point_of_sale', color: '#EC407A', route: '/pembelian' },
  { title: 'Penjualan', icon: 'bar_chart', color: '#29B6F6', route: '/penjualan' },
  { title: 'Laba Rugi', icon: 'balance', color: '#FFCA28', route: '/laba-rugi' },
  { title: 'Neraca', icon: 'balance', color: '#FFCA28', route: '/neraca' },
  { title: 'Neraca Awal', icon: 'balance', color: '#FFCA28', route: '/neraca-awal' },
  { title: 'Neraca Saldo', icon: 'balance', color: '#FFCA28', route: '/neraca-saldo' },
  {
    title: 'Jurnal Penerimaan',
    icon: 'receipt_long',
    color: '#66BB6A',
    route: '/jurnal-penerimaan',
  },
  {
    title: 'Jurnal Pengeluaran',
    icon: 'receipt_long',
    color: '#66BB6A',
    route: '/jurnal-pengeluaran',
  },
  { title: 'Jurnal Umum', icon: 'receipt_long', color: '#66BB6A', route: '/jurnal-umum' },
  { title: 'Prediksi AI', icon: 'bar_chart', color: '#29B6F6', route: '/ai-analyze' },
  { title: 'Sync', icon: 'autorenew', color: '#66BB6A', route: '/sync' },
  { title: 'Sync Offline', icon: 'autorenew', color: '#66BB6A', route: '/sync-offline' },
]

function navigate(path) {
  router.push(path)
}
</script>

<style scoped>
.menu-grid {
  display: grid;
  grid-template-columns: repeat(3, 80px);
  gap: 16px 24px; /* row-gap / col-gap */
  justify-content: center;
}
</style>
