import { ref, reactive, computed, watch, watchEffect, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'boot/axios'
import { API_URL } from 'boot/api'
import { v4 as uuidv4 } from 'uuid'

/**
 * Reusable CRUD offline-first untuk berbagai resource (pembelian, penjualan, dll).
 *
 * @param {Object} opts
 * @param {string}   opts.resource             - nama resource API, contoh: 'pembelian' / 'penjualan'
 * @param {string[]} [opts.searchFields]       - field yang dipakai untuk pencarian client-side
 * @param {string[]} [opts.numericFields]      - field angka yang ingin diparse rupiah saat input
 * @param {Object|Function} opts.defaultForm   - object default form atau function () => object
 * @param {Function} opts.buildPayload         - (form) => payload aman untuk request
 * @param {string[]} [opts.dateFieldsOrder]    - prioritas field tanggal untuk sorting
 * @param {string[]} [opts.mergeBaseFields]    - field dasar yang dipakai saat dedupe prefer-local
 * @param {Function} [opts.deriveForForm]      - optional: (form) => void untuk set nilai turunan (misal ppn_masukan)
 * @param {Function} [opts.matchesFn]          - optional: custom pencarian, default pakai searchFields (lowercase)
 * @param {string}   [opts.localKey]           - custom localStorage key; default: `${resource}_data`
 * @param {string}   [opts.lastEmailKey]       - localStorage key untuk email terakhir; default: 'last_user_email'
 * @param {number}   [opts.timeout]            - timeout request ms; default 7000
 * @param {boolean}  [opts.autoFetch]          - panggil fetchData onMounted; default true
 */
export function useOfflineCrud(opts) {
  const {
    resource,
    searchFields = ['no_faktur', 'keterangan', 'ref', 'tanggal', 'email', 'id'],
    numericFields = [],
    defaultForm,
    buildPayload,
    dateFieldsOrder = ['created_at', 'tanggal'],
    mergeBaseFields = [],
    matchesFn,
    localKey,
    lastEmailKey = 'last_user_email',
    timeout = 7000,
    autoFetch = true,
  } = opts || {}

  if (!resource) throw new Error('useOfflineCrud: "resource" wajib diisi')
  if (typeof buildPayload !== 'function')
    throw new Error('useOfflineCrud: "buildPayload(form)" wajib berupa function')

  // -------------------
  // Quasar & State umum
  // -------------------
  const $q = useQuasar()
  const loading = ref(false)
  const saving = ref(false)
  const items = ref([]) // daftar (mis. pembelianList/penjualanList)
  const formDialog = ref(false)

  // -------------------
  // User & Storage Keys
  // -------------------
  const LOCAL_KEY = localKey || `${resource}_data`
  const LAST_EMAIL_KEY = lastEmailKey

  const authRaw = localStorage.getItem('auth_user')
  const auth = authRaw ? JSON.parse(authRaw) : null
  let currentEmail = auth?.user?.email || localStorage.getItem(LAST_EMAIL_KEY) || 'local'
  localStorage.setItem(LAST_EMAIL_KEY, currentEmail)

  const defaultMatches = (item, q) => {
    if (!q) return true
    const key = normalizeStr(q)
    const hay = searchFields.map((f) => normalizeStr(item?.[f])).join(' | ')
    return hay.includes(key) // cukup includes, hindari .match (regex)
  }

  // ---------------
  // UI Helpers
  // ---------------
  const pagination = reactive({ page: 1, perPage: 10, total: 0 })
  const searchQuery = ref('')
  const sort = reactive({ by: 'id', descending: true })

  // Slice client-side untuk tampilan per halaman
  const pagedItems = computed(() => {
    const start = (pagination.page - 1) * pagination.perPage
    const end = start + pagination.perPage
    return items.value.slice(start, end)
  })

  // Reset page saat kata kunci berubah
  watch(
    () => searchQuery.value,
    () => {
      pagination.page = 1
    },
  )

  // ----------
  // Utilities
  // ----------
  const normalizeStr = (s) => String(s ?? '').toLowerCase()

  const matchesSearch = matchesFn || defaultMatches

  const formatTanggalIndonesia = (tanggal) => {
    if (!tanggal) return ''
    const date = new Date(tanggal)
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date)
  }
  const formatRupiah = (val) => {
    const num = Number(val) || 0
    return new Intl.NumberFormat('id-ID', { style: 'decimal' }).format(num)
  }

  const isNetworkError = (err) =>
    err?.code === 'ERR_NETWORK' ||
    err?.message?.toLowerCase?.().includes('network error') ||
    !err?.response

  const isOffline = () => !navigator.onLine

  // ---------------
  // Cache helpers
  // ---------------
  const getCache = () => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
    } catch {
      return []
    }
  }
  const setCache = (arr) => localStorage.setItem(LOCAL_KEY, JSON.stringify(arr))

  const sortNewestFirst = (arr) => {
    return [...arr].sort((a, b) => {
      // cari field tanggal sesuai prioritas
      const pickDate = (o) => {
        for (const f of dateFieldsOrder) if (o?.[f]) return o[f]
        return 0
      }
      const ta = new Date(pickDate(a) || 0).getTime()
      const tb = new Date(pickDate(b) || 0).getTime()
      if (ta && tb && ta !== tb) return tb - ta
      const na = Number(a?.id),
        nb = Number(b?.id)
      if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na
      return String(b?.id ?? '').localeCompare(String(a?.id ?? ''))
    })
  }

  const dedupeByIdPreferLocal = (arr) => {
    const map = new Map()
    for (const item of arr) {
      const key = String(item.id)
      if (!map.has(key)) {
        map.set(key, item)
        continue
      }
      const prev = map.get(key)

      // 1) pending menang
      if (item.synced === false && prev.synced !== false) {
        map.set(key, item)
        continue
      }
      if (prev.synced === false && item.synced !== false) {
        continue
      } // keep prev

      // 2) sama2 synced/pending -> pilih terbaru by updated_at/created_at/tanggal
      const t = (o) => new Date(o?.updated_at || o?.created_at || o?.tanggal || 0).getTime()
      const ti = t(item),
        tp = t(prev)

      if (ti > tp) {
        // jika item terbaru pending namun field dasar tidak berubah, keep prev
        const baseChanged = mergeBaseFields.some((f) => (item?.[f] ?? null) !== (prev?.[f] ?? null))
        if (item.synced === false && prev.synced === true && !baseChanged) {
          // keep prev
        } else {
          map.set(key, item)
        }
      } else if (ti < tp) {
        // keep prev
      } else {
        // tie-break: server override lokal
        if (item.__from === 'server' && prev.__from !== 'server') map.set(key, item)
      }
    }
    return Array.from(map.values())
  }

  const normalizeForView = (arr) => {
    const m = new Map()
    for (const it of arr) {
      const key = String(it.id || it.local_id)
      if (!m.has(key)) {
        m.set(key, it)
        continue
      }
      const prev = m.get(key)

      // pending menang untuk view
      if (it.synced === false && prev.synced !== false) {
        m.set(key, { ...prev, ...it })
        continue
      }
      if (prev.synced === false && it.synced !== false) {
        m.set(key, { ...it, ...prev })
        continue
      }

      // terbaru menang
      const ta = new Date(it.created_at || it.tanggal || 0).getTime()
      const tb = new Date(prev.created_at || prev.tanggal || 0).getTime()
      if (ta > tb) m.set(key, it)
    }
    return sortNewestFirst(Array.from(m.values()))
  }

  const adoptPendingToCurrentEmail = () => {
    let cache = getCache()
    let changed = false
    cache = cache.map((x) => {
      if (x?.synced === false) {
        if (!x.email || x.email !== currentEmail) {
          changed = true
          return { ...x, email: currentEmail }
        }
      }
      return x
    })
    if (changed) setCache(sortNewestFirst(cache))
    return cache
  }

  const viewFilter = (x) => {
    if (x.synced === false) return true
    return x.email ? x.email === currentEmail : true
  }

  const reconcileCacheWithServer = (serverData) => {
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

  // Migrasi key lama: `${resource}_data:<email>`
  ;(function migrateOldKeys() {
    try {
      const keys = Object.keys(localStorage)
      const prefix = `${resource}_data:`
      const oldKeys = keys.filter((k) => k.startsWith(prefix))
      if (!oldKeys.length) return
      const merged = []
      for (const k of oldKeys) {
        const arr = JSON.parse(localStorage.getItem(k) || '[]')
        if (Array.isArray(arr)) merged.push(...arr)
      }
      const existing = getCache()
      const deduped = dedupeByIdPreferLocal([...existing, ...merged])
      setCache(deduped)
    } catch {
      /* ignore */
    }
  })()

  // ---------------
  // Form & Formatters
  // ---------------
  const makeDefaultForm = () =>
    typeof defaultForm === 'function' ? defaultForm() : { ...(defaultForm || {}) }
  const form = reactive(makeDefaultForm())

  const resetForm = () => {
    const fresh = makeDefaultForm()
    for (const k of Object.keys(form)) delete form[k]
    Object.assign(form, fresh)
  }

  const handleInput = (fieldName, value) => {
    if (numericFields.includes(fieldName)) {
      const numeric = parseInt(String(value ?? '').replace(/\D/g, ''), 10)
      form[fieldName] = Number.isFinite(numeric) ? numeric : 0
    } else {
      form[fieldName] = value ?? ''
    }
  }

  const formattedFields = Object.fromEntries(
    numericFields.map((f) => [f, computed(() => formatRupiah(form[f]))]),
  )

  // Nilai turunan form (opsional), misal: set ppn_masukan dari persediaan_barang * ppn_persen
  if (typeof opts.deriveForForm === 'function') {
    watchEffect(() => {
      opts.deriveForForm(form)
    })
  }

  const openForm = (item = null) => {
    if (item) Object.assign(form, item)
    else {
      resetForm()
      form.local_id = form.local_id || uuidv4()
    }
    formDialog.value = true
  }

  // ----------------------
  // Sync Offline <-> Server
  // ----------------------
  const syncOfflineData = async () => {
    if (isOffline()) return
    let cache = getCache()
    const toSync = cache.filter(
      (x) => x.synced === false && (x.email ? x.email === currentEmail : true),
    )
    if (!toSync.length) return

    for (const record of toSync) {
      try {
        if (record.__op === 'delete') {
          if (!String(record.id).startsWith('local_'))
            await api.delete(`${API_URL}/${resource}/${record.id}`)
          cache = cache.filter((x) => x.id !== record.id)
          continue
        }
        if (record.__op === 'update') {
          if (!String(record.id).startsWith('local_')) {
            await api.put(`${API_URL}/${resource}/${record.id}`, {
              ...buildPayload(record),
              email: currentEmail,
            })
            const idx = cache.findIndex((x) => x.id === record.id)
            if (idx !== -1) {
              cache[idx].synced = true
              delete cache[idx].__op
            }
          } else {
            const res = await api.post(`${API_URL}/${resource}`, {
              ...buildPayload(record),
              email: currentEmail,
            })
            const serverItem = res.data?.data || res.data
            const idx = cache.findIndex((x) => x.id === record.id)
            if (idx !== -1) {
              cache[idx] = {
                ...cache[idx],
                ...serverItem,
                email: currentEmail,
                id: serverItem.id,
                synced: true,
              }
              delete cache[idx].__op
            }
          }
          continue
        }
        // CREATE
        const res = await api.post(`${API_URL}/${resource}`, {
          ...buildPayload(record),
          email: currentEmail,
        })
        const serverItem = res.data?.data || res.data
        const idx = cache.findIndex((x) => x.id === record.id)
        if (idx !== -1) {
          cache[idx] = {
            ...cache[idx],
            ...serverItem,
            email: currentEmail,
            id: serverItem.id,
            synced: true,
          }
          delete cache[idx].__op
        }
      } catch (e) {
        console.warn('Sync error:', e)
        $q.notify({
          type: 'warning',
          message: 'Sebagian data offline gagal tersinkron. Akan dicoba lagi.',
        })
      }
    }
    setCache(sortNewestFirst(cache))
  }

  const canPruneCache = ({ page, search, serverCount, serverTotal }) => {
    const noSearch = !search
    const firstPage = page === 1
    const allItemsReturned = serverTotal != null && serverCount >= serverTotal
    return noSearch && firstPage && allItemsReturned
  }

  const fullSyncAllPages = async () => {
    if (isOffline()) return
    let page = 1
    const perPage = 200
    const all = []
    while (true) {
      const resp = await api.get(`${API_URL}/${resource}`, {
        params: { email: currentEmail, page, perPage },
        timeout: timeout + 1000,
      })
      const dataArr = (resp.data?.data || resp.data || []).map((r) => ({
        ...r,
        email: currentEmail,
        synced: true,
        created_at: r.created_at || new Date().toISOString(),
      }))
      all.push(...dataArr)
      const total = resp.data?.total ?? resp.data?.meta?.total
      if (total != null) {
        if (all.length >= total) break
        page += 1
        continue
      }
      if (dataArr.length < perPage) break
      page += 1
    }
    const afterRecon = reconcileCacheWithServer(all)
    items.value = normalizeForView(afterRecon.filter(viewFilter))
    pagination.total = items.value.length
  }

  // --------------
  // Fetch Data
  // --------------
  const fetchData = async () => {
    loading.value = true
    if (!isOffline()) adoptPendingToCurrentEmail()

    if (isOffline()) {
      const cached = dedupeByIdPreferLocal(getCache())
      let display = normalizeForView(cached).filter(viewFilter)
      if (searchQuery.value) display = display.filter((it) => matchesSearch(it, searchQuery.value))
      items.value = display
      pagination.total = items.value.length
      loading.value = false
      return
    }

    try {
      const response = await api.get(`${API_URL}/${resource}`, {
        params: {
          email: currentEmail,
          page: pagination.page,
          perPage: pagination.perPage,
          search: searchQuery.value,
          sortBy: sort.by,
          sortDesc: sort.descending,
        },
        timeout,
      })

      const toNum = (v) => (v == null ? 0 : Number(v))
      const serverData = (response.data?.data || response.data || []).map((r) => ({
        ...r,
        __from: 'server',
        email: currentEmail,
        synced: true,
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || r.created_at || null,
      }))

      // Jika kamu ingin “amankan” angka tertentu agar tidak NaN, gunakan numericFields
      for (const it of serverData) for (const f of numericFields) it[f] = toNum(it[f])

      const serverTotal = response.data?.total ?? response.data?.meta?.total
      const serverCount = serverData.length
      const okToPrune = canPruneCache({
        page: pagination.page,
        search: searchQuery.value,
        serverCount,
        serverTotal,
      })

      let merged
      if (okToPrune) {
        merged = reconcileCacheWithServer(serverData)
      } else {
        const existing = getCache()
        merged = dedupeByIdPreferLocal([...existing, ...serverData])
        if (!searchQuery.value) setCache(sortNewestFirst(merged))
      }

      let display
      if (searchQuery.value) {
        display = normalizeForView(serverData.filter(viewFilter))
        display = display.filter((it) => matchesSearch(it, searchQuery.value))
      } else {
        display = normalizeForView(merged.filter(viewFilter))
      }

      items.value = display
      pagination.total = items.value.length

      await syncOfflineData()

      if (!searchQuery.value) {
        const afterSync = getCache()
        items.value = normalizeForView(afterSync.filter(viewFilter))
        pagination.total = items.value.length
      }
    } catch (e) {
      console.error(e)
      const cached = dedupeByIdPreferLocal(getCache())
      items.value = normalizeForView(cached).filter(viewFilter)
      pagination.total = items.value.length
      $q.notify({
        type: cached.length ? 'warning' : 'negative',
        message: cached.length
          ? 'Mode offline: menampilkan data dari cache'
          : 'Gagal mengambil data & cache kosong',
      })
    } finally {
      loading.value = false
    }
  }

  // --------------
  // Save / Delete
  // --------------
  const openConfirm = (message) =>
    new Promise((resolve) => {
      $q.dialog({ title: 'Konfirmasi', message, cancel: true, persistent: true })
        .onOk(() => resolve(true))
        .onCancel(() => resolve(false))
    })

  const saveData = async ({ validate } = {}) => {
    // optional validate(form) -> string|undefined
    if (typeof validate === 'function') {
      const err = validate(form)
      if (err) {
        $q.notify({ type: 'negative', message: err })
        return
      }
    }

    const isEdit = !!form.id
    //const payload = buildPayload(form)
    const basePayload = buildPayload(form)
    const payload = { ...basePayload, email: currentEmail } // paksa ada email
    saving.value = true

    const saveOfflineLocal = () => {
      let cache = getCache()
      if (isEdit) {
        const index = cache.findIndex((item) => String(item.id) === String(form.id))
        if (index !== -1) {
          cache[index] = {
            ...cache[index],
            ...payload,
            id: form.id,
            email: currentEmail,
            created_at: cache[index].created_at || new Date().toISOString(),
            synced: false,
            __op: 'update',
          }
        }
        $q.notify({ type: 'warning', message: 'Data diperbarui (offline)' })
      } else {
        const localId = `local_${Date.now()}`
        form.id = localId
        const newData = {
          ...payload,
          id: localId,
          email: currentEmail,
          created_at: new Date().toISOString(),
          synced: false,
          __op: 'create',
        }
        cache = normalizeForView([newData, ...cache])
        $q.notify({ type: 'warning', message: 'Data ditambahkan (offline)' })
      }
      setCache(cache)
      items.value = normalizeForView(getCache())
      pagination.total = items.value.length
    }

    try {
      if (isOffline()) {
        saveOfflineLocal()
      } else {
        if (isEdit) {
          const res = await api.put(`${API_URL}/${resource}/${form.id}`, payload)
          const serverItem = res?.data?.data || res?.data || null
          const cache = getCache()
          const idx = cache.findIndex((x) => String(x.id) === String(form.id))
          if (idx !== -1) {
            cache[idx] = {
              ...cache[idx],
              ...(serverItem || payload),
              id: serverItem?.id ?? form.id,
              email: currentEmail,
              synced: true,
              local_id: cache[idx].local_id || form.local_id || payload.local_id || uuidv4(),
              updated_at: serverItem?.updated_at || new Date().toISOString(),
            }
            setCache(sortNewestFirst(cache))
          }
          $q.notify({ type: 'positive', message: 'Data diperbarui (online)' })
        } else {
          const res = await api.post(`${API_URL}/${resource}`, payload)
          const created = res.data?.data || res.data
          $q.notify({ type: 'positive', message: 'Data ditambahkan (online)' })
          const cache = getCache()
          const withoutDup = cache.filter((x) => String(x.id) !== String(created.id))
          const updated = sortNewestFirst([
            {
              ...created,
              email: currentEmail,
              synced: true,
              created_at: created.created_at || new Date().toISOString(),
            },
            ...withoutDup,
          ])
          setCache(updated)
          items.value = normalizeForView(updated.filter(viewFilter))
          pagination.total = items.value.length
          pagination.page = 1
        }
      }
      formDialog.value = false
      resetForm()
      fetchData()
    } catch (error) {
      if (isNetworkError(error)) {
        saveOfflineLocal()
        formDialog.value = false
        resetForm()
        items.value = normalizeForView(getCache())
        pagination.total = items.value.length
        $q.notify({ type: 'warning', message: 'Koneksi bermasalah. Data disimpan offline.' })
      } else {
        $q.notify({
          type: 'negative',
          message: `Gagal menyimpan: ${error?.response?.data?.message || error.message}`,
        })
      }
    } finally {
      saving.value = false
    }
  }

  const deleteData = async (id, { confirm = true, labelNilai = '' } = {}) => {
    let ok = true
    if (confirm) {
      const item = items.value.find((p) => String(p.id) === String(id))
      const label =
        labelNilai && item
          ? ` (${labelNilai}: Rp ${Number(item[labelNilai]).toLocaleString()})`
          : ''
      ok = await openConfirm(`Yakin ingin menghapus data ini${label}?`)
    }
    if (!ok) return

    try {
      if (isOffline()) {
        let cache = getCache()
        const idx = cache.findIndex((x) => String(x.id) === String(id))
        if (idx !== -1) {
          if (String(cache[idx].id).startsWith('local_')) cache.splice(idx, 1)
          else {
            cache[idx].__op = 'delete'
            cache[idx].synced = false
          }
        } else {
          cache.push({
            id,
            email: currentEmail,
            created_at: new Date().toISOString(),
            __op: 'delete',
            synced: false,
          })
        }
        setCache(cache)
        items.value = normalizeForView(getCache())
        pagination.total = items.value.length
        $q.notify({ type: 'warning', message: 'Data dihapus (offline)' })
      } else {
        try {
          await api.delete(`${API_URL}/${resource}/${id}`)
          const cache = getCache().filter((x) => String(x.id) !== String(id))
          setCache(cache)
          items.value = normalizeForView(cache.filter(viewFilter))
          pagination.total = items.value.length
          $q.notify({ type: 'positive', message: 'Data dihapus (online)' })
        } catch (e) {
          if (isNetworkError(e)) {
            let cache = getCache()
            const idx = cache.findIndex((x) => String(x.id) === String(id))
            if (idx !== -1) {
              if (String(cache[idx].id).startsWith('local_')) cache.splice(idx, 1)
              else {
                cache[idx].__op = 'delete'
                cache[idx].synced = false
              }
            } else {
              cache.push({
                id,
                email: currentEmail,
                created_at: new Date().toISOString(),
                __op: 'delete',
                synced: false,
              })
            }
            setCache(cache)
            items.value = normalizeForView(getCache())
            pagination.total = items.value.length
            $q.notify({ type: 'warning', message: 'Koneksi bermasalah. Hapus disimpan offline.' })
          } else {
            $q.notify({ type: 'negative', message: 'Gagal menghapus data' })
          }
        }
      }
      fetchData()
    } catch {
      $q.notify({ type: 'negative', message: 'Gagal menghapus data' })
    }
  }

  // -----------------
  // Online listeners
  // -----------------
  const onOnline = async () => {
    adoptPendingToCurrentEmail()
    await syncOfflineData()
    await fullSyncAllPages()
    await fetchData()
  }

  onMounted(() => {
    window.addEventListener('online', onOnline)
    if (autoFetch) fetchData()
  })
  onUnmounted(() => window.removeEventListener('online', onOnline))

  // -------------
  // Public API
  // -------------
  return {
    // state
    loading,
    saving,
    items,
    pagedItems,
    formDialog,
    form,
    pagination,
    searchQuery,
    sort,
    // formatters
    formatTanggalIndonesia,
    formatRupiah,
    formattedFields,
    // actions
    fetchData,
    saveData,
    deleteData,
    openForm,
    resetForm,
    handleInput,
    // advanced (optional)
    syncOfflineData,
    fullSyncAllPages,
    isOffline,
  }
}
