<template>
  <q-page class="q-pa-md bg-grey-1">
    <div class="row justify-center">
      <div class="col-12 col-sm-8 col-md-6 col-lg-5">
        <q-card flat bordered class="bg-white">
          <q-card-section>
            <div class="text-h6">Profil Akun</div>
          </q-card-section>

          <q-separator />

          <q-card-section>
            <q-form class="register-form" @submit.prevent="onSubmit" @reset="onReset" ref="formRef">
              <div class="column q-gutter-y-sm">
                <q-input
                  v-model="form.nama"
                  label="Nama"
                  outlined
                  dense
                  hide-bottom-space
                  :rules="[req('Nama')]"
                />

                <q-input
                  v-model="form.profesi"
                  label="Profesi/Pekerjaan"
                  outlined
                  dense
                  hide-bottom-space
                  :rules="[req('Profesi/Pekerjaan')]"
                />

                <q-input
                  v-model="form.alamat"
                  label="Alamat"
                  type="textarea"
                  outlined
                  autogrow
                  :rules="[req('Alamat')]"
                  hide-bottom-space
                />

                <q-input
                  v-model="form.hp"
                  label="No. Handphone"
                  outlined
                  dense
                  hide-bottom-space
                  :rules="[
                    req('No. Handphone'),
                    (v) => /^(\+?\d{10,13})$/.test(v) || 'Nomor harus 10–13 digit angka',
                  ]"
                />

                <q-input
                  v-model="form.namaUsaha"
                  label="Nama Usaha"
                  outlined
                  dense
                  hide-bottom-space
                  :rules="[req('Nama Usaha')]"
                />

                <q-input v-model="form.instagram" label="Instagram" outlined dense />

                <q-input
                  v-model="form.facebook"
                  label="Facebook"
                  outlined
                  dense
                  hide-bottom-space
                />
                <q-input
                  v-model="form.website"
                  label="Website"
                  outlined
                  dense
                  hide-bottom-space
                  :rules="[urlOptional]"
                />

                <q-input
                  v-model="form.password"
                  :type="showPwd ? 'text' : 'password'"
                  label="Password"
                  outlined
                  dense
                  hide-bottom-space
                  :rules="[(v) => !v || v.length >= 6 || 'Min. 6 karakter']"
                >
                  <template #append>
                    <q-icon
                      :name="showPwd ? 'visibility_off' : 'visibility'"
                      class="cursor-pointer"
                      @click="showPwd = !showPwd"
                    />
                  </template>
                </q-input>

                <div class="row q-gutter-sm q-mt-sm">
                  <q-btn
                    label="Simpan"
                    color="primary"
                    type="submit"
                    unelevated
                    :loading="loading"
                    :disable="loading || fetching"
                  />

                  <q-space />
                  <q-btn
                    flat
                    icon="sync"
                    :disable="loading"
                    @click="loadProfile"
                    title="Muat ulang data"
                  />
                </div>
              </div>
            </q-form>
          </q-card-section>

          <q-inner-loading :showing="loading || fetching">
            <q-spinner size="40px" />
            <div class="q-mt-sm">{{ fetching ? 'Memuat data…' : 'Mengirim data…' }}</div>
          </q-inner-loading>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import axios from 'axios'
import { API_URL } from 'boot/api'

axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const $q = useQuasar()
const formRef = ref(null)
const loading = ref(false)
const fetching = ref(false) // <-- loading awal fetch

// Ambil email dari auth storage kamu
const userEmail = JSON.parse(localStorage.getItem('auth_user'))?.user?.email || ''

const initialForm = {
  nama: '',
  profesi: '',
  alamat: '',
  hp: '',
  namaUsaha: '',
  instagram: '',
  facebook: '',
  website: '',
  password: '',
  agree: false,
}
const form = ref({ ...initialForm })

const showPwd = ref(false)

// ===== Rules =====
const req = (label) => (v) =>
  (v !== null && v !== undefined && String(v).trim() !== '') || `${label} wajib diisi`
const urlOptional = (v) => {
  if (!v) return true
  try {
    new URL(/^https?:\/\//.test(v) ? v : `https://${v}`)
    return true
  } catch {
    return 'URL tidak valid'
  }
}

// ===== Fetch profile =====
async function loadProfile() {
  if (!userEmail) {
    $q.notify({ type: 'warning', message: 'Email pengguna tidak ditemukan. Silakan login ulang.' })
    return
  }
  try {
    fetching.value = true
    const { data } = await axios.get(`${API_URL}/profil/${encodeURIComponent(userEmail)}`, {
      timeout: 20000,
      headers: { Accept: 'application/json' },
    })

    // Sesuaikan struktur respons backend-mu.
    const src = data?.data || data

    // Map API -> Form
    form.value.nama = src?.nama || ''
    form.value.profesi = src?.profesi_pekerjaan ?? src?.profesi ?? ''
    form.value.alamat = src?.alamat || ''
    form.value.hp = src?.no_hp || ''
    form.value.namaUsaha = src?.nama_usaha || ''
    form.value.instagram = src?.instagram || ''
    form.value.facebook = src?.facebook || ''
    form.value.website = src?.website || ''
    form.value.password = '' // demi keamanan, jangan prefill password

    await nextTick()
    formRef.value?.resetValidation()
  } catch (err) {
    const msg = err?.response?.data?.message || 'Gagal memuat data profil.'
    $q.notify({ type: 'negative', message: msg })
  } finally {
    fetching.value = false
  }
}
onMounted(loadProfile)

// ===== Submit / Update =====
const onSubmit = async () => {
  const valid = await formRef.value.validate()
  if (!valid) return

  const payload = {
    nama: form.value.nama,
    nama_usaha: form.value.namaUsaha || null,
    profesi_pekerjaan: form.value.profesi || null,
    alamat: form.value.alamat || null,
    no_hp: form.value.hp,
    instagram: form.value.instagram || null,
    facebook: form.value.facebook || null,
    website: form.value.website || null,
    alasan: null,
    status: 0,
    ...(form.value.password ? { password: form.value.password } : {}), // hanya kirim jika diisi
  }

  try {
    loading.value = true
    await axios.put(`${API_URL}/profil/${encodeURIComponent(userEmail)}`, payload, {
      timeout: 20000,
      headers: { Accept: 'application/json' },
    })
    $q.notify({ type: 'positive', message: 'Update profil berhasil!' })
    await loadProfile()
  } catch (err) {
    const msg =
      err?.code === 'ECONNABORTED'
        ? 'Waktu koneksi habis. Coba lagi.'
        : err?.response?.data?.message || 'Gagal update. Coba lagi.'
    $q.notify({ type: 'negative', message: msg })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.captcha-code {
  min-width: 56px;
  text-align: right;
}
</style>
