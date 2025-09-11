import { defineRouter } from '#q-app/wrappers'
import {
  createRouter,
  createMemoryHistory,
  createWebHistory,
  createWebHashHistory,
} from 'vue-router'
import routes from './routes'

export default defineRouter(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(process.env.VUE_ROUTER_BASE),
  })

  // ✅ Tambahkan guard di sini
  Router.beforeEach((to, from, next) => {
    const isLoggedIn = localStorage.getItem('auth_user') !== null

    if (to.meta.requiresAuth && !isLoggedIn) {
      next('/') // Redirect ke halaman login
    } else {
      next() // Lanjut ke halaman yang diminta
    }
  })

  return Router
})
