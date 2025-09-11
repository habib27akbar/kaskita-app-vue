<template>
  <q-layout view="lHh Lpr lFf">
    <!-- HEADER -->
    <q-header elevated>
      <q-toolbar>
        <q-btn
          flat
          dense
          round
          icon="menu"
          aria-label="Menu"
          @click="toggleLeftDrawer"
          v-if="isLoggedIn"
        />
        <q-toolbar-title>My Kaskita</q-toolbar-title>
        <div class="row items-center q-gutter-sm">
          <div>Version {{ $q.version }}</div>
          <q-btn v-if="isLoggedIn" flat round icon="logout" @click="handleLogout">
            <q-tooltip>Logout</q-tooltip>
          </q-btn>
        </div>
      </q-toolbar>
    </q-header>

    <!-- DRAWER -->
    <q-drawer
      v-if="isLoggedIn"
      v-model="leftDrawerOpen"
      show-if-above
      bordered
      class="bg-white text-dark"
    >
      <q-list padding>
        <q-item-label header class="text-center text-weight-bold text-primary q-mb-md">
          Menu
        </q-item-label>

        <!-- Loop menu -->
        <q-item
          v-for="link in linksList"
          :key="link.title"
          clickable
          v-ripple
          :to="link.link"
          active-class="q-item--active"
        >
          <q-item-section avatar>
            <q-icon :name="link.icon" color="primary" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-medium">{{ link.title }}</q-item-label>
          </q-item-section>
        </q-item>

        <!-- Logout -->
        <q-separator spaced />
        <q-item clickable v-ripple @click="handleLogout">
          <q-item-section avatar>
            <q-icon name="logout" color="negative" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-negative text-weight-medium">Logout</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <!-- MAIN CONTENT -->
    <q-page-container>
      <router-view />
      <FooterPage v-if="isLoggedIn" />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import { logoutUser, isLoggedIn } from 'src/stores/auth'
import FooterPage from 'src/pages/include/FooterPage.vue'
const $q = useQuasar()
const router = useRouter()

const leftDrawerOpen = ref(false)

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value
}

const linksList = [
  {
    title: 'Berita',
    icon: 'campaign',
    link: '/berita',
  },
  {
    title: 'Event',
    icon: 'event',
    link: '/event',
  },
  {
    title: 'Profil',
    icon: 'person',
    link: '/profil',
  },
]

async function handleLogout() {
  try {
    logoutUser()
    $q.notify({ type: 'positive', message: 'Logout berhasil', position: 'top' })
    router.push('/')
  } catch {
    $q.notify({ type: 'negative', message: 'Logout gagal', position: 'top' })
  }
}
</script>
