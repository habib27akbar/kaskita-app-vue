<template>
  <q-page class="q-pa-md bg-grey-2">
    <!-- Status bar -->
    <div class="row items-center q-col-gutter-xs q-mb-sm">
      <div class="col-auto">
        <q-badge :color="online ? 'green' : 'orange'" rounded class="q-px-sm">
          {{ online ? 'Online' : 'Offline (cache)' }}
        </q-badge>
      </div>
      <div class="col">
        <div class="text-caption text-grey-7 ellipsis">
          Analisis LSTM & Isolation Forest — Cash-In / Cash-Out
        </div>
      </div>
      <div class="col-auto">
        <q-btn flat dense round icon="refresh" :disable="loading" @click="reloadFromCache" />
      </div>
    </div>

    <!-- Form -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="q-pt-sm">
        <div class="row q-col-gutter-sm items-end">
          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model.number="form.months"
              type="number"
              min="1"
              max="36"
              label="Jumlah Bulan (riwayat)"
              dense
              outlined
              input-class="text-right"
            />
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model.number="form.horizon"
              type="number"
              min="1"
              max="24"
              label="Langkah Prediksi (ke depan)"
              dense
              outlined
              input-class="text-right"
            />
          </div>
          <div class="col-12 col-md-6">
            <q-btn
              label="ANALISIS"
              color="primary"
              class="full-width"
              :loading="loading"
              @click="analyze"
              icon="insights"
            />
          </div>
        </div>

        <q-banner
          v-if="error"
          class="q-mt-md"
          dense
          rounded
          inline-actions
          :class="`bg-red-2 text-red-9`"
        >
          <div class="text-body2">{{ error }}</div>
          <template #action><q-btn flat dense label="Tutup" @click="error = ''" /></template>
        </q-banner>
      </q-card-section>
    </q-card>

    <!-- Content -->
    <div v-if="result" class="q-gutter-md" style="margin-top: 10px">
      <q-card flat bordered class="card-soft">
        <q-card-section class="q-pt-sm">
          <!-- Ringkasan (cards only) -->
          <TotalsSummary
            v-if="result"
            :labels="labelsBaseFmt"
            :history-in="history_in"
            :history-out="history_out"
            :forecast-in="aiIn?.prediction?.forecast || []"
            :forecast-out="aiOut?.prediction?.forecast || []"
          />

          <!-- CASH-IN -->
          <div class="text-subtitle2 q-mb-xs">LSTM — Cash-In (Histori vs Prakiraan)</div>
          <LineCompare
            :labels="labelsInCombinedFmt"
            :seriesA="seriesHistInAligned"
            :seriesB="seriesForecastInAligned"
            :seriesC="seriesFitInAligned"
            labelA="Cash-In Historis"
            labelB="Cash-In Prediksi"
            labelC="Cash-In Prediksi (fit)"
            y-label="Cash-In (IDR)"
            :value-formatter="formatIDR"
            :x-formatter="(s) => s"
          />

          <!-- CASH-OUT -->
          <div class="text-subtitle2 q-mt-lg q-mb-xs">LSTM — Cash-Out (Histori vs Prakiraan)</div>
          <LineCompare
            :labels="labelsOutCombinedFmt"
            :seriesA="seriesHistOutAligned"
            :seriesB="seriesForecastOutAligned"
            :seriesC="seriesFitOutAligned"
            labelA="Cash-Out Historis"
            labelB="Cash-Out Prediksi"
            labelC="Cash-Out Prediksi (fit)"
            y-label="Cash-Out (IDR)"
            :value-formatter="formatIDR"
            :x-formatter="(s) => s"
          />

          <!-- ANOMALI IN -->
          <div class="text-subtitle2 q-mt-lg q-mb-xs">Isolation Forest — Anomali Cash-In</div>
          <LineAnomaly
            :labels="labelsBaseFmt"
            :series="history_in"
            :anomalyIdx="anomalyIdxIn"
            label="Cash-In"
            :value-formatter="formatIDR"
            :label-formatter="(s) => s"
          />
          <div class="text-caption text-grey-7 q-mt-xs">
            Titik merah = anomali terdeteksi (cash-in)
          </div>

          <!-- ANOMALI OUT -->
          <div class="text-subtitle2 q-mt-lg q-mb-xs">Isolation Forest — Anomali Cash-Out</div>
          <LineAnomaly
            :labels="labelsBaseFmt"
            :series="history_out"
            :anomalyIdx="anomalyIdxOut"
            label="Cash-Out"
            :value-formatter="formatIDR"
            :label-formatter="(s) => s"
          />
          <div class="text-caption text-grey-7 q-mt-xs">
            Titik merah = anomali terdeteksi (cash-out)
          </div>
        </q-card-section>
      </q-card>
    </div>

    <q-inner-loading :showing="loading" label="Memproses..." />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, watch, defineComponent, h } from 'vue'
import { useQuasar, QCard, QCardSection, QIcon, QSpace } from 'quasar'
import { API_URL } from 'boot/api'

/* ---------- STATE ---------- */
const $q = useQuasar()
const online = ref(navigator.onLine)
const loading = ref(false)
const error = ref('')
const LAST_EMAIL_KEY = 'last_user_email'
const authRaw = localStorage.getItem('auth_user')
const auth = authRaw ? JSON.parse(authRaw) : null
let currentEmail = auth?.user?.email || localStorage.getItem(LAST_EMAIL_KEY) || 'local'
const form = ref({ months: 12, horizon: 3 })
const result = ref(null)
const CACHE_KEY = 'ai:analyze:last:v2'
// ------- Fitted/Prediksi di area historis (optional) -------
function getFirstArray(obj, keys = []) {
  for (const k of keys) {
    const v = k.split('.').reduce((o, kk) => (o ? o[kk] : undefined), obj)
    if (Array.isArray(v) && v.length) return v
  }
  return []
}

function pickFitted(aiNode) {
  if (!aiNode) return []
  // cari di berbagai kemungkinan nama properti
  return (
    getFirstArray(aiNode, [
      'prediction.fitted',
      'prediction.fit',
      'prediction.in_sample',
      'prediction.insample',
      'prediction.yhat', // beberapa lib memanggilnya yhat
      'prediction.backcast',
      'prediction.history_pred',
      'prediction.pred_in_hist',
      'prediction.train_pred',
      'fitted', // flat
      'fit',
      'in_sample',
      'insample',
      'yhat',
    ]) || []
  )
}

function alignFittedToHistory(fitted, histLen, fcLen) {
  // buang NaN, JANGAN ubah null jadi 0
  const clean = (fitted || []).map((x) => (x == null || Number.isNaN(+x) ? null : +x))

  let a = clean.slice(0, histLen)
  if (a.length < histLen) {
    a = Array(histLen - a.length)
      .fill(null)
      .concat(a)
  }
  return fcLen ? a.concat(Array(fcLen).fill(null)) : a
}

const fittedInRaw = computed(() => pickFitted(aiIn.value))
const fittedOutRaw = computed(() => pickFitted(aiOut.value))

const seriesFitInAligned = computed(() =>
  alignFittedToHistory(fittedInRaw.value, histIn.value.length, forecastLenIn.value),
)
const seriesFitOutAligned = computed(() =>
  alignFittedToHistory(fittedOutRaw.value, histOut.value.length, forecastLenOut.value),
)

/* ---------- HELPERS ---------- */
function saveCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }))
  } catch (e) {
    console.log(e)
  }
}
function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY))?.payload ?? null
  } catch {
    return null
  }
}
function reloadFromCache() {
  const c = loadCache()
  if (c) {
    result.value = c
    $q.notify({ message: 'Dimuat dari cache', color: 'grey-8' })
  } else {
    $q.notify({ message: 'Cache tidak ditemukan', color: 'orange' })
  }
}

/* Format angka & tanggal */
const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})
const formatIDR = (v) => rupiah.format(Number(v || 0))
function fmtIDMonth(ym) {
  if (!ym) return ''
  const [Y, M] = ym.split('-')
  return `${M}/${Y}`
}
function addMonthsYM(ym, k) {
  const [Y, M] = ym.split('-').map(Number)
  const d = new Date(Y, M - 1 + k, 1)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${mm}`
}

/* ---------- NETWORK ---------- */
async function analyze() {
  error.value = ''
  loading.value = true
  try {
    const res = await fetch(`${API_URL}/ai/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: currentEmail,
        months: Math.max(1, Number(form.value.months || 12)),
        horizon: Math.max(1, Number(form.value.horizon || 3)),
      }),
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    result.value = json
    // === DEBUG LOGS DI SINI ===
    console.log('AI IN prediction:', result.value?.ai?.in?.prediction)
    console.log('AI OUT prediction:', result.value?.ai?.out?.prediction)
    console.log('FITTED IN (raw):', result.value?.ai?.in?.prediction?.fitted)
    console.log('FITTED OUT (raw):', result.value?.ai?.out?.prediction?.fitted)
    // cek array yang sudah di-align ke chart:
    console.log('seriesFitInAligned:', seriesFitInAligned.value)
    console.log('seriesFitOutAligned:', seriesFitOutAligned.value)
    console.log('labelsBase:', labelsBase.value)
    saveCache(json)
    $q.notify({ message: 'Analisis selesai', color: 'primary' })
  } catch (e) {
    const cached = loadCache()
    if (cached) {
      result.value = cached
      $q.notify({ message: String(e), color: 'orange' })
    } else {
      error.value = String(e.message || e)
    }
  } finally {
    loading.value = false
  }
}

/* ---------- LIFECYCLE ---------- */
onMounted(() => {
  const c = loadCache()
  if (c) result.value = c
})
window.addEventListener('online', () => (online.value = true))
window.addEventListener('offline', () => (online.value = false))
watch(
  () => navigator.onLine,
  (v) => (online.value = v),
)

/* ---------- COMPUTED (labels & series) ---------- */
const labelsBase = computed(() => result.value?.input?.labels || [])
const labelsBaseFmt = computed(() => labelsBase.value.map(fmtIDMonth))
const histIn = computed(() => result.value?.history_in || [])
const histOut = computed(() => result.value?.history_out || [])
const history_in = computed(() => histIn.value)
const history_out = computed(() => histOut.value)

const aiIn = computed(() => result.value?.ai?.in || null)
const aiOut = computed(() => result.value?.ai?.out || null)
const forecastLenIn = computed(() => aiIn.value?.prediction?.forecast?.length || 0)
const forecastLenOut = computed(() => aiOut.value?.prediction?.forecast?.length || 0)

const forecastLabelsInRaw = computed(() => {
  const n = forecastLenIn.value
  if (!n) return []
  const last = labelsBase.value.at(-1)
  if (!last) return []
  return Array.from({ length: n }, (_, i) => addMonthsYM(last, i + 1))
})
const forecastLabelsOutRaw = computed(() => {
  const n = forecastLenOut.value
  if (!n) return []
  const last = labelsBase.value.at(-1)
  if (!last) return []
  return Array.from({ length: n }, (_, i) => addMonthsYM(last, i + 1))
})
const labelsInCombinedFmt = computed(() =>
  labelsBaseFmt.value.concat(forecastLabelsInRaw.value.map(fmtIDMonth)),
)
const labelsOutCombinedFmt = computed(() =>
  labelsBaseFmt.value.concat(forecastLabelsOutRaw.value.map(fmtIDMonth)),
)

const seriesHistInAligned = computed(() =>
  forecastLenIn.value ? histIn.value.concat(Array(forecastLenIn.value).fill(null)) : histIn.value,
)
const seriesForecastInAligned = computed(() => {
  const fc = aiIn.value?.prediction?.forecast || []
  const h = histIn.value.length
  return h ? Array(h).fill(null).concat(fc) : fc
})
const seriesHistOutAligned = computed(() =>
  forecastLenOut.value
    ? histOut.value.concat(Array(forecastLenOut.value).fill(null))
    : histOut.value,
)
const seriesForecastOutAligned = computed(() => {
  const fc = aiOut.value?.prediction?.forecast || []
  const h = histOut.value.length
  return h ? Array(h).fill(null).concat(fc) : fc
})

const anomalyIdxIn = computed(() =>
  (aiIn.value?.anomaly?.anomalies || []).map((a) => +a.index).filter(Number.isFinite),
)
const anomalyIdxOut = computed(() =>
  (aiOut.value?.anomaly?.anomalies || []).map((a) => +a.index).filter(Number.isFinite),
)

/* ---------- RINGKASAN NOMINAL (CARDS) ---------- */
const TotalsSummary = defineComponent({
  name: 'TotalsSummary',
  props: {
    labels: Array,
    historyIn: Array,
    historyOut: Array,
    forecastIn: Array,
    forecastOut: Array,
  },
  setup(p) {
    const fmtIDR = (v) =>
      new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(Number(v || 0))
    const compact = (v) =>
      new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(
        Number(v || 0),
      )
    const sum = (a = []) => a.reduce((s, x) => s + (+x || 0), 0)
    const last = (a = []) => (a.length ? +a[a.length - 1] : 0)
    const prev = (a = []) => (a.length > 1 ? +a[a.length - 2] : 0)
    const div0 = (a, b) => (b ? a / b : 0)
    const mom = (c, p) => div0(c - p, Math.abs(p)) * 100

    const tIn = computed(() => sum(p.historyIn))
    const tOut = computed(() => sum(p.historyOut))
    const tNet = computed(() => tIn.value - tOut.value)
    const avgIn = computed(() => div0(tIn.value, p.historyIn?.length || 0))
    const avgOut = computed(() => div0(tOut.value, p.historyOut?.length || 0))
    const avgNet = computed(() => avgIn.value - avgOut.value)

    const lastLbl = computed(() => p.labels?.at(-1) || '—')
    const lastIn = computed(() => last(p.historyIn))
    const lastOut = computed(() => last(p.historyOut))
    const momIn = computed(() => mom(lastIn.value, prev(p.historyIn)))
    const momOut = computed(() => mom(lastOut.value, prev(p.historyOut)))

    const fIn = computed(() => sum(p.forecastIn))
    const fOut = computed(() => sum(p.forecastOut))
    const fNet = computed(() => fIn.value - fOut.value)
    const horiz = computed(() => Math.max(p.forecastIn?.length || 0, p.forecastOut?.length || 0))

    const MoMChip = (val) =>
      h(
        'div',
        { class: ['chip', val > 0 ? 'chip-up' : val < 0 ? 'chip-down' : 'chip-flat'] },
        `${val >= 0 ? '+' : ''}${isFinite(val) ? val.toFixed(1) : '0.0'}% MoM`,
      )

    const StatCard = (o) =>
      h(QCard, { flat: true, bordered: true, class: 'ts-card q-mb-sm' }, () => [
        h(QCardSection, { class: 'ts-body' }, () => [
          h('div', { class: 'ts-head' }, [
            h(QIcon, { name: o.icon, size: '20px', color: o.iconColor || 'primary' }),
            h('div', { class: 'ts-title' }, o.title),
          ]),
          h('div', { class: ['ts-value', o.valueClass] }, o.value),
          o.hint ? h('div', { class: 'ts-hint' }, o.hint) : null,
        ]),
      ])

    const LastCard = ({ title, value, mom, color, icon }) =>
      h(QCard, { flat: true, bordered: true, class: 'ts-card q-mb-sm' }, () => [
        h(QCardSection, { class: 'ts-body' }, () => [
          h('div', { class: 'ts-head' }, [
            h(QIcon, { name: icon, size: '20px', color }),
            h('div', { class: 'ts-title' }, `${title} (${lastLbl.value})`),
            h(QSpace),
          ]),
          h('div', { class: ['ts-value', `text-${color}`] }, fmtIDR(value)),
          h('div', { class: 'q-mt-xs' }, [MoMChip(mom)]),
        ]),
      ])

    return () =>
      h('div', { class: 'ts-grid-wrap' }, [
        // Historis
        h('div', { class: 'ts-grid' }, [
          StatCard({
            icon: 'savings',
            title: 'Total Cash-In (Historis)',
            value: fmtIDR(tIn.value),
            hint: `Rata-rata/bln: ${fmtIDR(avgIn.value)}`,
            valueClass: 'text-primary',
          }),
          StatCard({
            icon: 'paid',
            iconColor: 'negative',
            title: 'Total Cash-Out (Historis)',
            value: fmtIDR(tOut.value),
            hint: `Rata-rata/bln: ${fmtIDR(avgOut.value)}`,
            valueClass: 'text-negative',
          }),
          StatCard({
            icon: 'balance',
            iconColor: tNet.value >= 0 ? 'positive' : 'negative',
            title: 'Total Bersih (Historis)',
            value: fmtIDR(tNet.value),
            hint: `Rata-rata Bersih/bln: ${fmtIDR(avgNet.value)}`,
            valueClass: tNet.value >= 0 ? 'text-positive' : 'text-negative',
          }),
        ]),
        // Bulan terakhir
        h('div', { class: 'ts-grid' }, [
          LastCard({
            title: 'Cash-In',
            value: lastIn.value,
            mom: momIn.value,
            color: 'primary',
            icon: 'trending_up',
          }),
          LastCard({
            title: 'Cash-Out',
            value: lastOut.value,
            mom: momOut.value,
            color: 'negative',
            icon: 'trending_down',
          }),
        ]),
        // Forecast
        h('div', { class: 'row items-center justify-between q-mt-sm q-mb-xs' }, [
          h('div', { class: 'text-subtitle2' }, 'Ringkasan Prakiraan'),
          h('div', { class: 'text-caption text-grey-7' }, `${horiz.value} bulan ke depan`),
        ]),
        h('div', { class: 'ts-grid' }, [
          StatCard({
            icon: 'trending_up',
            title: 'Total Prakiraan Cash-In',
            value: fmtIDR(fIn.value),
            hint: `≈ ${compact(fIn.value)}`,
            valueClass: 'text-positive',
          }),
          StatCard({
            icon: 'trending_down',
            title: 'Total Prakiraan Cash-Out',
            value: fmtIDR(fOut.value),
            hint: `≈ ${compact(fOut.value)}`,
            valueClass: 'text-negative',
          }),
          StatCard({
            icon: 'calculate',
            title: 'Total Prakiraan Bersih',
            value: fmtIDR(fNet.value),
            hint: `≈ ${compact(fNet.value)}`,
            valueClass: fNet.value >= 0 ? 'text-positive' : 'text-negative',
          }),
        ]),
      ])
  },
})

/* ---------- CHART COMPONENTS (SVG) ---------- */ /* ---------- CHART COMPONENTS (SVG) ---------- */
const LineCompare = defineComponent({
  name: 'LineCompare',
  props: {
    labels: Array,
    seriesA: Array, // histori (biru)
    seriesB: Array, // forecast (merah dashed)
    seriesC: Array, // fitted/in-sample (oranye)  ← NEW
    width: { type: Number, default: 900 },
    height: { type: Number, default: 340 },
    pad: { type: Number, default: 56 },
    labelA: { type: String, default: 'Seri A' },
    labelB: { type: String, default: 'Seri B' },
    labelC: { type: String, default: 'Seri C (fit)' }, // ← NEW
    yLabel: { type: String, default: 'Nilai' },
    title: { type: String, default: '' },
    valueFormatter: { type: Function, default: (v) => String(v) },
    xFormatter: { type: Function, default: (s) => s },
  },
  setup(p) {
    const root = ref(null),
      W = ref(p.width),
      H = ref(p.height),
      isXS = ref(false)
    onMounted(() => {
      const ro = new ResizeObserver(([entry]) => {
        const w = Math.max(280, Math.floor(entry.contentRect.width))
        W.value = w
        H.value = w < 480 ? 260 : p.height
        isXS.value = w < 480
      })
      if (root.value) ro.observe(root.value)
    })

    const take = (arr) =>
      (arr || []).filter((v) => v !== null && v !== undefined && Number.isFinite(+v)).map(Number)

    // --- skala termasuk C ---
    const values = computed(() => [
      ...take(p.seriesA),
      ...take(p.seriesB),
      ...take(p.seriesC || []),
    ])
    const minV = computed(() => (values.value.length ? Math.min(...values.value) : 0))
    const maxV = computed(() => (values.value.length ? Math.max(...values.value) : 1))
    const span = computed(() => Math.max(1e-9, maxV.value - minV.value))

    const pad = computed(() => (isXS.value ? 40 : p.pad))
    const innerW = computed(() => W.value - pad.value - 12)
    const innerH = computed(() => H.value - pad.value - (isXS.value ? 16 : 20))
    const x = (i, n) => pad.value + (i / Math.max(1, n - 1)) * innerW.value
    const y = (v) => H.value - pad.value - ((v - minV.value) / span.value) * innerH.value

    const pathFor = (arr = []) => {
      const a = arr.slice(),
        n = a.length
      if (!n) return ''
      let d = '',
        pen = false
      for (let i = 0; i < n; i++) {
        const v = a[i]
        if (v == null || !Number.isFinite(+v)) {
          pen = false
          continue
        }
        const X = x(i, n),
          Y = y(+v)
        d += pen ? ` L ${X} ${Y}` : `M ${X} ${Y}`
        pen = true
      }
      return d
    }

    // ticks
    const nX = computed(() =>
      Math.max(p.labels.length, p.seriesA.length, p.seriesB.length, (p.seriesC || []).length),
    )
    const yTicks = computed(() => {
      const steps = isXS.value ? 4 : 5,
        arr = []
      for (let k = 0; k <= steps; k++) {
        const val = minV.value + (span.value * k) / steps
        arr.push({ val, y: y(val) })
      }
      return arr
    })
    const xTicks = computed(() => {
      const n = nX.value
      if (!n) return []
      const target = isXS.value ? 5 : 8
      const step = Math.max(1, Math.ceil(n / target))
      return Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0 || i === n - 1)
    })

    const pts = (arr) => {
      const n = arr.length
      return arr
        .map((v, i) =>
          v == null || !Number.isFinite(+v) ? null : { i, v: +v, cx: x(i, n), cy: y(+v) },
        )
        .filter(Boolean)
    }
    const pointsA = computed(() => pts(p.seriesA))
    const pointsB = computed(() => pts(p.seriesB))
    const pointsC = computed(() => pts(p.seriesC || [])) // ← NEW

    // tooltip
    const tip = ref({ show: false, left: 0, top: 0, label: '', value: '' })
    const setTip = (evt, label, val) => {
      const rect = root.value?.getBoundingClientRect()
      tip.value = {
        show: true,
        left: (evt.clientX ?? evt.touches?.[0]?.clientX) - (rect?.left ?? 0) + 10,
        top: (evt.clientY ?? evt.touches?.[0]?.clientY) - (rect?.top ?? 0) + 10,
        label,
        value: p.valueFormatter(val),
      }
    }
    const hideTip = () => (tip.value.show = false)

    const colA = '#1976D2', // biru
      colB = '#E53935', // merah (forecast)
      colC = '#FB8C00', // oranye (fitted)  ← NEW
      grid = '#ECEFF1',
      axis = '#B0BEC5'
    const kompact = new Intl.NumberFormat('id-ID', {
      notation: 'compact',
      maximumFractionDigits: 1,
    })

    function legendItem(text, color, dashed = false) {
      return h('div', { class: 'legend-item' }, [
        h('svg', { width: 28, height: 12, viewBox: '0 0 28 12' }, [
          h('line', {
            x1: 2,
            y1: 6,
            x2: 26,
            y2: 6,
            stroke: color,
            'stroke-width': 3,
            ...(dashed ? { 'stroke-dasharray': '6 4' } : {}),
            'stroke-linecap': 'round',
          }),
          h('circle', {
            cx: 14,
            cy: 6,
            r: 2.3,
            fill: dashed ? '#fff' : color,
            stroke: color,
            'stroke-width': 2,
          }),
        ]),
        h('span', { class: 'legend-text' }, text),
      ])
    }

    return () =>
      h('div', { ref: root, class: 'chart shadow-sm', style: 'position:relative' }, [
        h(
          'svg',
          { viewBox: `0 0 ${W.value} ${H.value}`, width: '100%', height: H.value, role: 'img' },
          [
            // label Y, grid, ticks … (tidak berubah)
            h('rect', {
              x: pad.value,
              y: H.value - pad.value - innerH.value,
              width: innerW.value,
              height: innerH.value,
              fill: '#FAFAFA',
              stroke: axis,
              'stroke-width': 1,
              rx: 8,
            }),
            ...yTicks.value.map((t) =>
              h('g', {}, [
                h('line', {
                  x1: pad.value,
                  x2: pad.value + innerW.value,
                  y1: t.y,
                  y2: t.y,
                  stroke: grid,
                }),
                h(
                  'text',
                  {
                    x: pad.value - 8,
                    y: t.y + 4,
                    'text-anchor': 'end',
                    'font-size': isXS.value ? 10 : 11,
                    fill: '#546E7A',
                  },
                  kompact.format(t.val),
                ),
              ]),
            ),
            ...xTicks.value.map((i) => {
              const n = nX.value,
                X = x(i, n),
                lbl = p.labels?.[i] ?? `#${i + 1}`
              return h('g', {}, [
                h('line', {
                  x1: X,
                  x2: X,
                  y1: H.value - pad.value,
                  y2: H.value - pad.value + 6,
                  stroke: axis,
                }),
                h(
                  'text',
                  {
                    x: X,
                    y: H.value - pad.value + (isXS.value ? 16 : 20),
                    transform: `rotate(${isXS.value ? 35 : 45} ${X} ${H.value - pad.value + (isXS.value ? 16 : 20)})`,
                    'text-anchor': 'start',
                    'font-size': isXS.value ? 9 : 10,
                    fill: '#546E7A',
                  },
                  p.xFormatter(lbl),
                ),
              ])
            }),

            // --- Garis FITTED (C) dulu, tipis & semi-transparent ---
            p.seriesC && take(p.seriesC).length
              ? h('path', {
                  d: pathFor(p.seriesC),
                  fill: 'none',
                  stroke: colC,
                  'stroke-width': 2.5,
                  'stroke-linecap': 'round',
                  'stroke-linejoin': 'round',
                  opacity: 0.9,
                })
              : null,
            ...(pointsC.value || []).map((pt) =>
              h('circle', {
                cx: pt.cx,
                cy: pt.cy,
                r: 3,
                fill: '#fff',
                stroke: colC,
                'stroke-width': 2,
                onMouseenter: (e) =>
                  setTip(e, p.xFormatter(p.labels?.[pt.i] ?? `#${pt.i + 1}`), pt.v),
                onMousemove: (e) =>
                  setTip(e, p.xFormatter(p.labels?.[pt.i] ?? `#${pt.i + 1}`), pt.v),
                onMouseleave: hideTip,
              }),
            ),

            // --- Garis HISTORIS (A) ---
            h('path', {
              d: pathFor(p.seriesA),
              fill: 'none',
              stroke: colA,
              'stroke-width': 3,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            }),
            ...pointsA.value.map((pt) =>
              h('circle', {
                cx: pt.cx,
                cy: pt.cy,
                r: 3.5,
                fill: colA,
                stroke: '#fff',
                'stroke-width': 1.2,
                onMouseenter: (e) =>
                  setTip(e, p.xFormatter(p.labels?.[pt.i] ?? `#${pt.i + 1}`), pt.v),
                onMousemove: (e) =>
                  setTip(e, p.xFormatter(p.labels?.[pt.i] ?? `#${pt.i + 1}`), pt.v),
                onMouseleave: hideTip,
              }),
            ),

            // --- Garis FORECAST (B) ---
            h('path', {
              d: pathFor(p.seriesB),
              fill: 'none',
              stroke: colB,
              'stroke-width': 3,
              'stroke-dasharray': '6 6',
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            }),
            ...pointsB.value.map((pt) =>
              h('circle', {
                cx: pt.cx,
                cy: pt.cy,
                r: 3.5,
                fill: '#fff',
                stroke: colB,
                'stroke-width': 2,
                onMouseenter: (e) =>
                  setTip(e, p.xFormatter(p.labels?.[pt.i] ?? `#${pt.i + 1}`), pt.v),
                onMousemove: (e) =>
                  setTip(e, p.xFormatter(p.labels?.[pt.i] ?? `#${pt.i + 1}`), pt.v),
                onMouseleave: hideTip,
              }),
            ),
          ],
        ),

        // Legend (tambah item C kalau ada data)
        h('div', { class: ['legend-card', isXS.value ? 'legend-bottom' : 'legend-top-left'] }, [
          legendItem(p.labelA, colA, false),
          legendItem(p.labelB, colB, true),
          p.seriesC && take(p.seriesC).length
            ? legendItem(p.labelC || 'Prediksi (fit)', colC, false)
            : null,
        ]),

        tip.value.show
          ? h(
              'div',
              {
                class: 'if-tooltip',
                style: `position:absolute; left:${tip.value.left}px; top:${tip.value.top}px;`,
              },
              [
                h('div', { class: 'if-tooltip-label' }, tip.value.label),
                h('div', { class: 'if-tooltip-value' }, tip.value.value),
              ],
            )
          : null,
      ])
  },
})

const LineAnomaly = defineComponent({
  name: 'LineAnomaly',
  props: {
    labels: Array,
    series: Array,
    anomalyIdx: Array,
    width: { type: Number, default: 900 },
    height: { type: Number, default: 260 },
    pad: { type: Number, default: 40 },
    label: { type: String, default: 'Series' },
    valueFormatter: { type: Function, default: (v) => String(v) },
    labelFormatter: { type: Function, default: (s) => s },
  },
  setup(p) {
    const root = ref(null),
      W = ref(p.width),
      H = ref(p.height),
      isXS = ref(false)
    onMounted(() => {
      const ro = new ResizeObserver(([e]) => {
        const w = Math.max(280, Math.floor(e.contentRect.width))
        W.value = w
        H.value = w < 480 ? 220 : p.height
        isXS.value = w < 480
      })
      if (root.value) ro.observe(root.value)
    })
    const vals = computed(() => (p.series || []).map((v) => (v == null ? null : Number(v))))
    const finite = computed(() => vals.value.filter((v) => v != null && Number.isFinite(v)))
    const minV = computed(() => (finite.value.length ? Math.min(...finite.value) : 0))
    const maxV = computed(() => (finite.value.length ? Math.max(...finite.value) : 1))
    const span = computed(() => Math.max(1e-9, maxV.value - minV.value))
    const pad = computed(() => (isXS.value ? 32 : p.pad))
    const x = (i, n) => pad.value + (i / Math.max(1, n - 1)) * (W.value - 2 * pad.value)
    const y = (v) =>
      H.value - pad.value - ((v - minV.value) / span.value) * (H.value - 2 * pad.value)
    const pathD = computed(() => {
      const a = vals.value,
        n = a.length
      if (!n) return ''
      let d = '',
        pen = false
      for (let i = 0; i < n; i++) {
        const v = a[i]
        if (v == null || !Number.isFinite(v)) {
          pen = false
          continue
        }
        const X = x(i, n),
          Y = y(v)
        d += pen ? ` L ${X} ${Y}` : `M ${X} ${Y}`
        pen = true
      }
      return d
    })
    const points = computed(() => {
      const a = vals.value,
        n = a.length
      return a
        .map((v, i) =>
          v == null || !Number.isFinite(v)
            ? null
            : {
                i,
                v,
                label: p.labels?.[i] ?? `#${i + 1}`,
                cx: x(i, n),
                cy: y(v),
                anomaly: p.anomalyIdx.includes(i),
              },
        )
        .filter(Boolean)
    })
    const tip = ref({ show: false, left: 0, top: 0, label: '', value: '' })
    const setTip = (e, pt) => {
      const r = root.value?.getBoundingClientRect()
      tip.value = {
        show: true,
        left: (e.clientX ?? e.touches?.[0]?.clientX) - (r?.left ?? 0) + 10,
        top: (e.clientY ?? e.touches?.[0]?.clientY) - (r?.top ?? 0) + 10,
        label: p.labelFormatter(pt.label),
        value: p.valueFormatter(pt.v),
      }
    }
    const hideTip = () => (tip.value.show = false)
    const notify = (pt) =>
      $q.notify({
        color: 'primary',
        message: `${p.labelFormatter(pt.label)} • ${p.valueFormatter(pt.v)}`,
      })
    return () =>
      h('div', { ref: root, class: 'chart shadow-sm', style: 'position:relative' }, [
        h('svg', { viewBox: `0 0 ${W.value} ${H.value}`, width: '100%', height: H.value }, [
          h('rect', {
            x: pad.value,
            y: pad.value / 2,
            width: W.value - 2 * pad.value,
            height: H.value - 1.5 * pad.value,
            fill: '#FAFAFA',
            stroke: '#B0BEC5',
            rx: 8,
          }),
          h('path', {
            d: pathD.value,
            fill: 'none',
            stroke: '#455A64',
            'stroke-width': 3,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }),
          ...points.value.map((pt) =>
            h('circle', {
              cx: pt.cx,
              cy: pt.cy,
              r: pt.anomaly ? 5 : 3.5,
              fill: pt.anomaly ? '#D32F2F' : '#1976D2',
              stroke: '#fff',
              'stroke-width': pt.anomaly ? 2 : 1.2,
              onMouseenter: (e) => setTip(e, pt),
              onMousemove: (e) => setTip(e, pt),
              onMouseleave: hideTip,
              onTouchstart: (e) => setTip(e, pt),
              onTouchmove: (e) => setTip(e, pt),
              onTouchend: hideTip,
              onClick: () => notify(pt),
              style: 'cursor:pointer',
            }),
          ),
        ]),
        h('div', { class: 'legend row items-center q-gutter-sm q-mt-xs' }, [
          h('span', { class: 'dot', style: 'background:#455A64' }),
          h('span', null, p.label),
          h('span', { class: 'dot', style: 'background:#D32F2F' }),
          h('span', null, 'Anomali'),
        ]),
        tip.value.show
          ? h(
              'div',
              {
                class: 'if-tooltip',
                style: `position:absolute; left:${tip.value.left}px; top:${tip.value.top}px;`,
              },
              [
                h('div', { class: 'if-tooltip-label' }, tip.value.label),
                h('div', { class: 'if-tooltip-value' }, tip.value.value),
              ],
            )
          : null,
      ])
  },
})
</script>

<style scoped>
.card-soft {
  border-radius: 14px;
}

/* ===== Chart wrapper ===== */
.chart {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 14px;
  padding: 10px;
}
.shadow-sm {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.05);
}

/* Legend (LineCompare) */
.legend-card {
  position: absolute;
  display: flex;
  gap: 10px;
  align-items: center;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 6px 10px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}
.legend-top-left {
  left: 14px;
  top: 10px;
}
.legend-bottom {
  left: 50%;
  transform: translateX(-50%);
  bottom: 8px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.legend-text {
  font-size: 12px;
  color: #37474f;
}
@media (max-width: 480px) {
  .legend-card {
    gap: 8px;
    padding: 6px 8px;
  }
  .legend-text {
    font-size: 11px;
  }
}

.legend .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

/* Tooltip */
.if-tooltip {
  background: rgba(33, 33, 33, 0.96);
  color: #fff;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  pointer-events: none;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
}
.if-tooltip-label {
  opacity: 0.85;
}
.if-tooltip-value {
  font-weight: 700;
}

/* ===== TotalsSummary (cards) ===== */
.ts-grid-wrap {
  margin-bottom: 8px;
}
.ts-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 1024px) {
  .ts-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .ts-grid {
    grid-template-columns: 1fr;
  }
}

.ts-card {
  border-radius: 12px;
  margin-bottom: 12px;
}
.ts-body {
  padding: 12px;
  margin-bottom: 10px;
}
.ts-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ts-title {
  font-size: 12px;
  color: #607d8b;
}
.ts-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.1;
  margin-top: 2px;
}
.ts-hint {
  font-size: 12px;
  color: #90a4ae;
  margin-top: 2px;
}

/* MoM chip */
.chip {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  line-height: 1;
  border: 1px solid currentColor;
  display: inline-block;
}
.chip-up {
  color: #2e7d32;
  background: #e8f5e9;
}
.chip-down {
  color: #c62828;
  background: #ffebee;
}
.chip-flat {
  color: #546e7a;
  background: #eceff1;
}
</style>
