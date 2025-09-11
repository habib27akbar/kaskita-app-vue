<template>
  <q-page class="q-pa-md flex flex-center">
    <q-card class="q-pa-lg" style="width: 420px; max-width: 92vw">
      <div class="row items-center q-mb-md">
        <q-icon name="lock_reset" size="28px" class="q-mr-sm" />
        <div class="text-h6">Lupa Password</div>
      </div>

      <q-form @submit.prevent="onSubmit" ref="formRef" class="q-gutter-md">
        <q-input
          v-model="email"
          type="email"
          label="Email terdaftar"
          autocomplete="email"
          outlined
          dense
          :disable="loading"
          :rules="[rules.required, rules.email]"
          aria-label="Email"
        >
          <template #prepend><q-icon name="mail" /></template>
        </q-input>

        <q-btn
          type="submit"
          color="primary"
          label="Kirim Instruksi"
          class="full-width"
          :loading="loading"
          :disable="loading || cooldown > 0"
        >
          <template v-if="cooldown > 0" #loading> Mengirim… </template>
        </q-btn>

        <div class="text-caption text-grey-7 q-mt-sm">
          Kami akan mengirimkan instruksi ke email tersebut
          <span class="no-wrap">(jika terdaftar)</span>.
          <span v-if="cooldown > 0" class="no-wrap"> Coba lagi dalam {{ cooldown }}s.</span>
        </div>
      </q-form>

      <q-separator class="q-my-md" />

      <div class="text-body2">
        <q-icon name="info" size="18px" class="q-mr-xs" />
        Pastikan mengecek folder <b>Spam/Junk</b> bila email tidak terlihat di inbox.
      </div>

      <q-banner
        v-if="success"
        dense
        inline-actions
        class="q-mt-md bg-green-1 text-green-10"
        role="status"
        aria-live="polite"
      >
        {{ lastMessage }}
        <template #action>
          <q-btn flat color="green-10" label="Tutup" @click="success = false" />
        </template>
      </q-banner>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { Notify } from 'quasar'
import { api } from 'boot/axios'
import { API_URL } from 'boot/api'

const formRef = ref(null)
const email = ref('')
const loading = ref(false)
const success = ref(false)
const lastMessage = ref('Jika email terdaftar, instruksi sudah dikirim.')
const cooldown = ref(0)
let timer = null

const rules = {
  required: (v) => !!v || 'Harus diisi',
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Format email tidak valid',
}

function startCooldown(seconds = 30) {
  cooldown.value = seconds
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    cooldown.value--
    if (cooldown.value <= 0) {
      clearInterval(timer)
      timer = null
    }
  }, 1000)
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

function pickMessage(resMsg, fallback = 'Jika email terdaftar, instruksi sudah dikirim.') {
  return typeof resMsg === 'string' && resMsg.trim() ? resMsg : fallback
}

async function onSubmit() {
  const ok = await formRef.value?.validate?.()
  if (!ok) return

  loading.value = true
  try {
    // sesuai route kamu di api.php
    const res = await api.post(`${API_URL}/forgot-password`, { email: email.value })
    console.log(res)

    const msg = pickMessage(res?.data?.message)
    lastMessage.value = msg
    success.value = true
    Notify.create({ type: 'positive', message: msg })
    startCooldown(30)
  } catch (err) {
    const msg = pickMessage(err?.response?.data?.message)
    lastMessage.value = msg
    success.value = true
    Notify.create({ type: 'positive', message: msg })
    startCooldown(30)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.no-wrap {
  white-space: nowrap;
}
</style>
