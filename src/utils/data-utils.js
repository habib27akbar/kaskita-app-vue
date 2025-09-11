export const normalizeStr = (s) => String(s ?? '').toLowerCase()

export function matchesSearch(item, q, fields) {
  if (!q) return true
  const key = normalizeStr(q)
  const hay = (fields || Object.keys(item)).map((f) => normalizeStr(item?.[f])).join(' | ')
  return hay.includes(key)
}

export const toSafeInt = (v) => {
  if (v == null) return 0
  const s = String(v).replace(/[^\d-]/g, '')
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : 0
}

export function sortNewestFirst(arr) {
  return [...arr].sort((a, b) => {
    const ta = new Date(a.updated_at || a.created_at || a.tanggal || 0).getTime()
    const tb = new Date(b.updated_at || b.created_at || b.tanggal || 0).getTime()
    if (ta && tb && ta !== tb) return tb - ta
    const na = Number(a.id),
      nb = Number(b.id)
    if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na
    return String(b.id).localeCompare(String(a.id))
  })
}

export function dedupeByIdPreferLocal(arr) {
  const m = new Map()
  for (const it of arr) {
    const key = String(it.id ?? it.local_id)
    if (!m.has(key)) {
      m.set(key, it)
      continue
    }
    const prev = m.get(key)
    if (it.synced === false && prev.synced !== false) {
      m.set(key, { ...prev, ...it })
      continue
    }
    if (prev.synced === false && it.synced !== false) {
      m.set(key, { ...it, ...prev })
      continue
    }
    const t = (o) => new Date(o.updated_at || o.created_at || o.tanggal || 0).getTime()
    m.set(key, t(it) > t(prev) ? it : prev)
  }
  return [...m.values()]
}

export function normalizeForView(arr) {
  const m = new Map()
  for (const it of arr) {
    const key = it?.id != null ? String(it.id) : String(it.local_id)
    if (!m.has(key)) {
      m.set(key, it)
      continue
    }
    const prev = m.get(key)
    if (it.synced === false && prev.synced !== false) {
      m.set(key, { ...prev, ...it })
      continue
    }
    if (prev.synced === false && it.synced !== false) {
      m.set(key, { ...it, ...prev })
      continue
    }
    const ta = new Date(it.updated_at || it.created_at || it.tanggal || 0).getTime()
    const tb = new Date(prev.updated_at || prev.created_at || prev.tanggal || 0).getTime()
    if (ta > tb) m.set(key, it)
  }
  return sortNewestFirst([...m.values()])
}
