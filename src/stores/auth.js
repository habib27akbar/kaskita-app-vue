import { ref } from 'vue'

export const isLoggedIn = ref(!!localStorage.getItem('auth_user'))

export function loginUser(user) {
  localStorage.setItem('auth_user', JSON.stringify(user))
  isLoggedIn.value = true
}

export function logoutUser() {
  localStorage.removeItem('auth_user')
  isLoggedIn.value = false
}
