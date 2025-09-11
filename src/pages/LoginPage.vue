<template>
  <q-page class="flex flex-center bg-grey-2">
    <q-card class="q-pa-lg" style="width: 400px">
      <q-card-section class="text-center">
        <q-img
          src="/images/login_bg.png"
          style="max-width: 200px; margin: auto"
          spinner-color="primary"
          alt="Logo"
        />
        <div class="text-h6 q-mt-md">Login</div>
      </q-card-section>

      <q-card-section>
        <q-form @submit.prevent="handleLogin" class="q-gutter-md">
          <q-input v-model="form.email" label="Email" dense outlined />
          <q-input v-model="form.password" label="Password" type="password" dense outlined />

          <!-- Captcha -->
          <div class="row items-center q-gutter-sm">
            <div class="text-subtitle2">Captcha: {{ captcha.question }}</div>
            <q-btn flat icon="refresh" @click="generateCaptcha" />
          </div>
          <q-input v-model="form.captchaInput" label="Jawaban Captcha" dense outlined />

          <q-btn label="Login" type="submit" color="primary" class="full-width" />

          <q-btn label="Daftar" color="warning" class="full-width" @click="goToRegis" />

          <q-btn label="Lupa Password" color="positive" class="full-width" @click="goToForgot" />
        </q-form>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup>
import { reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import { API_URL } from 'boot/api'
import axios from 'axios'
import { loginUser } from 'src/stores/auth'

const $q = useQuasar()
const router = useRouter()

const form = reactive({
  email: '',
  password: '',
  captchaInput: '',
})

function goToRegis() {
  router.push('/pendaftaran')
}

function goToForgot() {
  router.push('/forgot-password')
}

const captcha = reactive({
  question: '',
  answer: 0,
})

function generateCaptcha() {
  const a = Math.floor(Math.random() * 10) + 1
  const b = Math.floor(Math.random() * 10) + 1
  captcha.question = `${a} + ${b}`
  captcha.answer = a + b
}

function isOnline() {
  return navigator.onLine
}

async function handleLogin() {
  if (!form.email || !form.password || !form.captchaInput) {
    $q.notify({ type: 'negative', message: 'Lengkapi semua field', position: 'top' })
    return
  }

  if (parseInt(form.captchaInput) !== captcha.answer) {
    $q.notify({ type: 'negative', message: 'Jawaban captcha salah', position: 'top' })
    generateCaptcha()
    return
  }

  if (isOnline()) {
    try {
      const res = await axios.post(`${API_URL}/login`, {
        email: form.email,
        password: form.password,
      })

      const userData = res.data
      loginUser(userData) // update state auth

      $q.notify({ type: 'positive', message: 'Login sukses', position: 'top' })
      router.push('/home')
    } catch (error) {
      $q.notify({
        type: 'negative',
        message: error.response?.data?.message || 'Login gagal',
        position: 'top',
      })
    }
  } else {
    const userData = JSON.parse(localStorage.getItem('auth_user'))
    if (userData && userData.email === form.email) {
      loginUser(userData)
      $q.notify({ type: 'positive', message: 'Login offline sukses', position: 'top' })
      router.push('/home')
    } else {
      $q.notify({ type: 'negative', message: 'Offline login gagal', position: 'top' })
    }
  }

  generateCaptcha()
  form.captchaInput = ''
}

onMounted(() => {
  generateCaptcha()
  const user = localStorage.getItem('auth_user')
  if (user) {
    router.push('/home')
  }
})
</script>
