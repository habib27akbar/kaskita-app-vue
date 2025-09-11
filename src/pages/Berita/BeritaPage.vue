<template>
  <div class="q-pa-md">
    <q-card flat bordered>
      <q-card-section>
        <div class="text-h6">Daftar Berita</div>
      </q-card-section>

      <q-separator />

      <q-list bordered separator>
        <q-item v-for="item in berita" :key="item.id">
          <q-item-section avatar>
            <q-img
              :src="`https://mykaskita.com/public/img/${item.gambar}`"
              style="width: 80px; height: 80px; object-fit: cover"
            />
          </q-item-section>

          <q-item-section>
            <q-item-label class="text-subtitle1">
              {{ item.judul }}
            </q-item-label>

            <q-item-label caption>
              {{ formatTanggal(item.tgl) }} |
              <a :href="item.sumber" target="_blank" class="text-primary text-underline">
                {{ item.sumber }}
              </a>
            </q-item-label>

            <div class="q-mt-sm">
              <q-btn
                size="sm"
                flat
                color="primary"
                label="Lihat Selengkapnya"
                @click="lihatSelengkapnya(item)"
              />
            </div>
          </q-item-section>
        </q-item>
      </q-list>

      <q-separator />

      <!-- Pagination -->
      <div class="row justify-center q-pa-md">
        <q-pagination
          v-model="currentPage"
          :max="lastPage"
          boundary-numbers
          direction-links
          @update:model-value="getBerita"
        />
      </div>
    </q-card>

    <!-- Modal detail -->
    <q-dialog v-model="dialogDetail">
      <q-card style="max-width: 600px; width: 100%">
        <q-card-section>
          <div class="text-h6">{{ detail.judul }}</div>
          <div class="text-caption text-grey">
            {{ formatTanggal(detail.tgl) }} |
            <a :href="detail.sumber" target="_blank" class="text-primary text-underline">
              {{ detail.sumber }}
            </a>
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <q-img
            :src="`https://mykaskita.com/public/img/${detail.gambar}`"
            style="max-height: 300px; object-fit: cover"
            class="q-mb-md"
          />
          <div v-html="detail.isi"></div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Tutup" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from 'boot/axios'
import { API_URL } from 'boot/api'

const berita = ref([])
const currentPage = ref(1)
const lastPage = ref(1)

const dialogDetail = ref(false)
const detail = ref({})

const getBerita = async () => {
  try {
    const res = await api.get(`${API_URL}/berita`, {
      params: {
        page: currentPage.value,
        perPage: 5,
      },
    })

    berita.value = res.data.data
    currentPage.value = res.data.current_page
    lastPage.value = res.data.last_page
  } catch (err) {
    console.error(err)
  }
}

const lihatSelengkapnya = (item) => {
  detail.value = item
  dialogDetail.value = true
}

// Format tanggal ke Indonesia
const formatTanggal = (tgl) => {
  if (!tgl) return ''
  return new Date(tgl).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

onMounted(() => {
  getBerita()
})
</script>
