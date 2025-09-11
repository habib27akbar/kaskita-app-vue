<template>
  <q-footer class="bg-white q-pa-sm shadow-2">
    <q-tabs align="justify" dense class="text-primary" indicator-color="transparent">
      <q-tab icon="home" label="Beranda" @click="navigate('/home')" />
      <q-tab icon="campaign" label="Berita" @click="navigate('/berita')" />
      <q-tab icon="event" label="Event" @click="navigate('/event')" />
      <q-tab icon="person" label="Profil" @click="navigate('/profil')" />
    </q-tabs>
  </q-footer>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function navigate(path) {
  router.push(path)
}
</script>
