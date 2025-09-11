<template>
  <q-page class="q-pa-md bg-grey-1">
    <div class="row justify-center">
      <div class="col-12 col-sm-8 col-md-6 col-lg-5">
        <q-card flat bordered class="bg-white">
          <q-card-section>
            <div class="text-h6">Pendaftaran Akun</div>
            <div class="text-caption text-grey-7">Lengkapi data di bawah ini</div>
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
                  v-model="form.email"
                  label="Email"
                  type="email"
                  outlined
                  dense
                  hide-bottom-space
                  :rules="[req('Email'), emailRule]"
                />

                <q-input
                  v-model="form.password"
                  :type="showPwd ? 'text' : 'password'"
                  label="Password"
                  outlined
                  dense
                  hide-bottom-space
                  :rules="[req('Password'), (v) => v.length >= 6 || 'Min. 6 karakter']"
                >
                  <template #append>
                    <q-icon
                      :name="showPwd ? 'visibility_off' : 'visibility'"
                      class="cursor-pointer"
                      @click="showPwd = !showPwd"
                    />
                  </template>
                </q-input>

                <!-- Captcha rapi & sejajar -->
                <div class="row items-center no-wrap q-gutter-x-sm q-mt-xs">
                  <div class="captcha-code text-subtitle2">{{ captcha.display }}</div>
                  <q-input
                    v-model="captcha.input"
                    outlined
                    dense
                    style="width: 220px"
                    placeholder="Masukan angka di samping"
                    hide-bottom-space
                    :rules="[req('Captcha')]"
                  />
                  <q-btn flat round icon="refresh" @click="regenCaptcha" />
                </div>

                <div class="row q-gutter-sm q-mt-sm">
                  <q-btn
                    label="Daftar"
                    color="primary"
                    type="submit"
                    unelevated
                    :loading="loading"
                    :disable="loading"
                  />
                  <q-btn label="Reset" color="grey-7" outline type="reset" :disable="loading" />
                </div>
              </div>
            </q-form>
          </q-card-section>
          <q-inner-loading :showing="loading">
            <q-spinner size="40px" />
            <div class="q-mt-sm">Mengirim data...</div>
          </q-inner-loading>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { useQuasar } from 'quasar'
import axios from 'axios' // <-- tambah ini
import { API_URL } from 'boot/api'
// optional: set baseURL sekali (atau pakai axios default project)
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const $q = useQuasar()
const formRef = ref(null)
const loading = ref(false)

const initialForm = {
  nama: '',
  profesi: '',
  alamat: '',
  hp: '',
  namaUsaha: '',
  instagram: '',
  facebook: '',
  website: '',
  email: '',
  password: '',
  agree: false,
}
const form = ref({ ...initialForm })

async function resetForm() {
  Object.assign(form.value, initialForm)
  regenCaptcha()
  // tunggu DOM update dulu, lalu bersihkan error state
  await nextTick()
  formRef.value?.resetValidation()
}

const showPwd = ref(false)

// Captcha angka sederhana
const captcha = ref({ display: '', value: '', input: '' })
const regenCaptcha = () => {
  const n = Math.floor(10000 + Math.random() * 90000) // 5 digit
  captcha.value = { display: String(n), value: String(n), input: '' }
}
regenCaptcha()

// ===== Rules (frontend) =====
const req = (label) => (v) =>
  (v !== null && v !== undefined && String(v).trim() !== '') || `${label} wajib diisi`
const emailRule = (v) => /.+@.+\..+/.test(v) || 'Email tidak valid'
const urlOptional = (v) => {
  if (!v) return true
  try {
    new URL(/^https?:\/\//.test(v) ? v : `https://${v}`)
    return true
  } catch {
    return 'URL tidak valid'
  }
}

// ===== Handlers =====
const onSubmit = async () => {
  const valid = await formRef.value.validate()
  if (!valid) return

  if (captcha.value.input !== captcha.value.value) {
    $q.notify({ type: 'warning', message: 'Captcha salah. Silakan coba lagi.' })
    regenCaptcha()
    return
  }

  const payload = {
    email: form.value.email,
    nama: form.value.nama,
    nama_usaha: form.value.namaUsaha || null,
    profesi_pekerjaan: form.value.profesi || null,
    alamat: form.value.alamat || null,
    no_hp: form.value.hp,
    instagram: form.value.instagram || null,
    facebook: form.value.facebook || null,
    website: form.value.website || null,
    alasan: null, // isi kalau ada field alasan
    password: form.value.password,
    status: 0,
  }

  try {
    loading.value = true
    // optional: juga tampilkan full-screen loader
    // $q.loading.show({ message: 'Mengirim data...' })

    await axios.post(`${API_URL}/register`, payload, { timeout: 20000 }) // 20s

    $q.notify({ type: 'positive', message: 'Pendaftaran berhasil! Cek email untuk verifikasi.' })
    await resetForm()
  } catch (err) {
    const msg =
      err?.code === 'ECONNABORTED'
        ? 'Waktu koneksi habis. Coba lagi.'
        : err?.response?.data?.message || 'Gagal mendaftar. Coba lagi.'
    $q.notify({ type: 'negative', message: msg })
  } finally {
    loading.value = false
    // $q.loading.hide()
    regenCaptcha()
  }
}

const onReset = () => resetForm()
</script>

<style scoped>
.captcha-code {
  min-width: 56px; /* angka captcha tidak geser-geser */
  text-align: right;
}
</style>
