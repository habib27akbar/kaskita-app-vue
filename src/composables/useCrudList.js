import { ref, reactive } from 'vue'
import { api } from 'boot/axios'
import { API_URL } from 'boot/api'
import { v4 as uuidv4 } from 'uuid'
//import { useRouter } from 'vue-router'
import {
  matchesSearch,
  sortNewestFirst,
  dedupeByIdPreferLocal,
  normalizeForView,
} from '@/utils/data-utils'
export function useCrudList({ resource, LOCAL_KEY, currentEmail }) {
  // state umum
  const list = ref([])
  const loading = ref(false)
  const search = ref('')
  const pagination = reactive({ page: 1, perPage: 10, total: 0 })
  const sortState = reactive({ by: 'id', descending: true })

  // helpers storage
  const getCache = () => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
    } catch {
      return []
    }
  }
  const setCache = (arr) => localStorage.setItem(LOCAL_KEY, JSON.stringify(arr))

  //const viewFilter = (x) => (x.synced === false ? true : x.email ? x.email === currentEmail : true)
  const viewFilter = (x) => {
    if (x.synced === false) return true
    if (!currentEmail) return true
    return x.email ? x.email === currentEmail : true
  }
  const isOffline = () => !navigator.onLine
  const isNetworkError = (err) =>
    err?.code === 'ERR_NETWORK' ||
    err?.message?.toLowerCase?.().includes('network error') ||
    !err?.response

  function adoptPendingToCurrentEmail() {
    let cache = getCache(),
      changed = false
    cache = cache.map((x) => {
      if (x?.synced === false && x.email !== currentEmail) {
        changed = true
        return { ...x, email: currentEmail }
      }
      return x
    })
    if (changed) setCache(sortNewestFirst(cache))
    return cache
  }

  function reconcileCacheWithServer(serverData) {
    const serverIds = new Set(serverData.map((x) => String(x.id)))
    let cache = getCache()
    cache = cache.filter((x) => {
      const isMine = x.email ? x.email === currentEmail : true
      if (!isMine) return true
      if (x.synced === false) return true
      return serverIds.has(String(x.id))
    })
    const merged = dedupeByIdPreferLocal([...cache, ...serverData])
    const sorted = sortNewestFirst(merged)
    setCache(sorted)
    return sorted
  }

  async function syncOfflineData(buildPayload) {
    if (isOffline()) return
    let cache = getCache()
    const toSync = cache.filter(
      (x) => x.synced === false && (x.email ? x.email === currentEmail : true),
    )
    if (!toSync.length) return

    for (const rec of toSync) {
      try {
        if (rec.__op === 'delete') {
          if (!String(rec.id).startsWith('local_'))
            await api.delete(`${API_URL}/${resource}/${rec.id}`)
          cache = cache.filter((x) => x.id !== rec.id)
          continue
        }
        if (rec.__op === 'update') {
          if (!String(rec.id).startsWith('local_')) {
            await api.put(`${API_URL}/${resource}/${rec.id}`, buildPayload(rec))
            const i = cache.findIndex((x) => x.id === rec.id)
            if (i !== -1) {
              cache[i].synced = true
              delete cache[i].__op
            }
          } else {
            const res = await api.post(`${API_URL}/${resource}`, buildPayload(rec))
            const serverItem = res.data?.data || res.data
            const i = cache.findIndex((x) => x.id === rec.id)
            if (i !== -1) {
              cache[i] = {
                ...cache[i],
                ...serverItem,
                email: currentEmail,
                id: serverItem.id,
                synced: true,
                local_id: undefined,
              }
              delete cache[i].__op
            }
          }
          continue
        }
        // CREATE
        const res = await api.post(`${API_URL}/${resource}`, buildPayload(rec))
        const serverItem = res.data?.data || res.data
        const i = cache.findIndex((x) => x.id === rec.id)
        if (i !== -1) {
          cache[i] = {
            ...cache[i],
            ...serverItem,
            email: currentEmail,
            id: serverItem.id,
            synced: true,
            local_id: undefined,
          }
          delete cache[i].__op
        }
      } catch (e) {
        console.warn(`Sync error ${resource}:`, e)
      }
    }
    setCache(sortNewestFirst(cache))
  }

  async function fullSyncAllPages() {
    if (isOffline()) return
    let page = 1
    const perPage = 200
    const all = []
    while (true) {
      const resp = await api.get(`${API_URL}/${resource}`, {
        params: { email: currentEmail, page, perPage },
        timeout: 8000,
      })
      const arr = (resp.data?.data || resp.data || []).map((r) => ({
        ...r,
        email: currentEmail,
        synced: true,
        created_at: r.created_at || new Date().toISOString(),
      }))
      all.push(...arr)
      const total = resp.data?.total ?? resp.data?.meta?.total
      if (total != null) {
        if (all.length >= total) break
        page += 1
        continue
      }
      if (arr.length < perPage) break
      page += 1
    }
    const after = reconcileCacheWithServer(all)
    list.value = normalizeForView(after.filter(viewFilter))
    pagination.total = list.value.length
  }

  async function fetchData({ fieldsForSearch, mapServerItem } = {}) {
    loading.value = true
    if (!isOffline()) adoptPendingToCurrentEmail()

    if (isOffline()) {
      let display = normalizeForView(getCache()).filter(viewFilter)
      if (search.value)
        display = display.filter((it) => matchesSearch(it, search.value, fieldsForSearch))
      list.value = display
      pagination.total = list.value.length
      loading.value = false
      return
    }

    try {
      const resp = await api.get(`${API_URL}/${resource}`, {
        params: {
          ...(currentEmail ? { email: currentEmail } : {}),
          page: pagination.page,
          perPage: pagination.perPage,
          search: search.value,
          sortBy: sortState.by,
          sortDesc: sortState.descending,
        },
        timeout: 7000,
      })

      let serverData = (resp.data?.data || resp.data || []).map((r) => ({
        ...r,
        __from: 'server',
        email: currentEmail,
        synced: true,
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || r.created_at || null,
      }))
      if (mapServerItem) serverData = serverData.map(mapServerItem)

      const serverTotal = resp.data?.total ?? resp.data?.meta?.total
      const serverCount = serverData.length
      const okToPrune =
        !search.value && pagination.page === 1 && serverTotal != null && serverCount >= serverTotal

      let merged
      if (okToPrune) {
        merged = reconcileCacheWithServer(serverData)
      } else {
        const existing = getCache()
        merged = dedupeByIdPreferLocal([...existing, ...serverData])
        if (!search.value) setCache(sortNewestFirst(merged))
      }

      // tampilan
      let display
      if (search.value) {
        display = normalizeForView(serverData.filter(viewFilter))
        display = display.filter((it) => matchesSearch(it, search.value, fieldsForSearch))
      } else {
        display = normalizeForView(merged.filter(viewFilter))
      }
      list.value = display
      pagination.total = list.value.length

      // sync offline → jangan timpa hasil search
      // caller wajib pass buildPayload ke sync jika ingin aktif
    } catch (e) {
      // fallback ke cache
      const cached = normalizeForView(getCache()).filter(viewFilter)
      list.value = cached
      pagination.total = cached.length
      console.warn(`fetchData ${resource} failed`, e)
    } finally {
      loading.value = false
    }
  }

  function saveOfflineLocal(payload, isEdit) {
    let cache = getCache()
    if (isEdit) {
      const index = cache.findIndex((item) => item.id === payload.id)
      if (index !== -1) {
        cache[index] = {
          ...payload,
          email: currentEmail,
          created_at: cache[index].created_at || new Date().toISOString(),
          synced: false,
          __op: 'update',
        }
      }
    } else {
      const localId = `local_${Date.now()}`
      const newData = {
        ...payload,
        id: localId,
        email: currentEmail,
        created_at: new Date().toISOString(),
        synced: false,
        __op: 'create',
      }
      cache = normalizeForView([newData, ...cache])
    }
    setCache(cache)
    list.value = normalizeForView(getCache())
    pagination.total = list.value.length
  }

  return {
    // state
    list,
    loading,
    search,
    pagination,
    sortState,
    // storage helpers
    getCache,
    setCache,
    // visibility
    viewFilter,
    isOffline,
    isNetworkError,
    // ops
    fetchData,
    syncOfflineData,
    fullSyncAllPages,
    saveOfflineLocal,
    reconcileCacheWithServer,
    adoptPendingToCurrentEmail,
    // re-exports utils (opsional)
    matchesSearch,
    normalizeForView,
    dedupeByIdPreferLocal,
    sortNewestFirst,
    uuidv4,
  }
}
