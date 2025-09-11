<template>
  <q-page class="q-pa-md bg-grey-2">
    <!-- Top status bar -->
    <div class="row items-center q-col-gutter-xs q-mb-sm">
      <div class="col-auto">
        <q-badge :color="online ? 'green' : 'orange'" rounded class="q-px-sm">
          {{ online ? 'Online' : 'Offline (cache)' }}
        </q-badge>
      </div>
      <div class="col">
        <div class="text-caption text-grey-7 ellipsis">AI Cashflow & Risk Analyzer</div>
      </div>
      <div class="col-auto">
        <q-btn
          flat
          dense
          round
          icon="refresh"
          :disable="loading"
          @click="reloadFromCache"
          aria-label="Load Cache"
        />
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
              label="Months"
              dense
              outlined
              clear-icon="close"
              input-class="text-right"
            />
          </div>

          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model.number="form.horizon"
              type="number"
              min="1"
              max="24"
              label="Horizon"
              dense
              outlined
              clear-icon="close"
              input-class="text-right"
            />
          </div>

          <div class="col-12 col-md-6">
            <q-btn
              label="Analyze"
              color="primary"
              class="full-width"
              :loading="loading"
              @click="analyze"
              icon="analytics"
              size="md"
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
          <template #action>
            <q-btn flat dense label="Dismiss" @click="error = ''" />
          </template>
        </q-banner>
      </q-card-section>
    </q-card>

    <!-- Content -->
    <div v-if="result" class="q-gutter-md">
      <!-- Summary cards -->
      <!-- Summary cards -->
      <div class="row q-col-gutter-md items-stretch">
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="tile-card column justify-between full-height">
            <q-card-section class="q-pa-md">
              <div class="text-caption text-grey-7">Cash on Hand (Approx)</div>
              <div class="value q-mt-xs">{{ money(result.input.cash_on_hand_approx) }}</div>
            </q-card-section>
          </q-card>
        </div>

        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="tile-card column justify-between full-height">
            <q-card-section class="q-pa-md">
              <div class="text-caption text-grey-7">Avg Monthly Outflow</div>
              <div class="value q-mt-xs">{{ money(result.input.avg_outflow) }}</div>
            </q-card-section>
          </q-card>
        </div>

        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="tile-card column justify-between full-height">
            <q-card-section class="q-pa-md">
              <div class="text-caption text-grey-7">Risk Level</div>
              <div class="q-mt-sm">
                <q-badge
                  :color="riskColor(aiRisk?.level)"
                  :label="`${aiRisk?.level || '-'} (${aiRisk?.risk_score ?? 0})`"
                  class="q-pa-sm"
                />
              </div>
            </q-card-section>
          </q-card>
        </div>

        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="tile-card column justify-between full-height">
            <q-card-section class="q-pa-md">
              <div class="text-caption text-grey-7">Trend (Slope)</div>
              <div class="value q-mt-xs">{{ money(aiRisk?.signals?.slope ?? 0) }}</div>
              <div class="text-caption text-grey-7">
                Volatility: {{ (aiRisk?.signals?.vol_ratio ?? 0).toFixed(2) }}
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Charts -->
      <q-card flat bordered class="card-soft">
        <q-card-section class="q-pt-sm">
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-md-7">
              <div class="text-subtitle2 q-mb-xs">Net Cash per Month</div>
              <div class="scroll-x">
                <AiSparkline
                  :values="result.history"
                  :labels="result.input.labels"
                  :height="140"
                  :strokeWidth="2"
                />
              </div>
            </div>

            <div class="col-12 col-md-5">
              <div class="text-subtitle2 q-mb-xs">
                Forecast (Next {{ aiForecast?.forecast?.length || 0 }})
              </div>
              <div class="scroll-x">
                <AiSparkline
                  :values="aiForecast?.forecast || []"
                  :labels="forecastLabels"
                  :height="140"
                  color="#1976D2"
                  :strokeWidth="2"
                />
              </div>
              <div class="row q-col-gutter-sm q-mt-sm">
                <div class="col-12 col-sm-4">
                  <MiniStat label="Mean" :value="aiForecast?.stats?.mean" :formatter="money" />
                </div>
                <div class="col-12 col-sm-4">
                  <MiniStat label="Std" :value="aiForecast?.stats?.std" :formatter="money" />
                </div>
                <div class="col-12 col-sm-4">
                  <MiniStat label="Last" :value="aiForecast?.stats?.last" :formatter="money" />
                </div>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Signals (collapsible on mobile) -->
      <q-expansion-item
        icon="insights"
        label="Risk Signals"
        header-class="text-subtitle2"
        expand-separator
        dense
        default-opened
      >
        <q-card flat bordered class="card-soft">
          <q-card-section>
            <div class="row q-col-gutter-sm">
              <SignalItem label="Slope" :value="fmt(aiRisk?.signals?.slope)" />
              <SignalItem label="Vol Ratio" :value="fmt(aiRisk?.signals?.vol_ratio)" />
              <SignalItem label="Max Neg Run" :value="fmt(aiRisk?.signals?.max_neg_run, 0)" />
              <SignalItem label="Runway (months)" :value="fmt(aiRisk?.signals?.runway)" />
              <SignalItem label="Mean" :value="money(aiRisk?.signals?.mean || 0)" />
              <SignalItem label="Std" :value="money(aiRisk?.signals?.std || 0)" />
            </div>
          </q-card-section>
        </q-card>
      </q-expansion-item>

      <!-- Table -->
      <q-card flat bordered class="card-soft">
        <q-card-section>
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle2">Data</div>
            <!-- <q-btn dense flat icon="file_download" label="Export CSV" @click="$emit?.('export')" /> -->
          </div>

          <!-- horizontal scroll on mobile -->
          <div class="scroll-x">
            <q-table
              dense
              flat
              :rows="tableRows"
              :columns="columns"
              row-key="idx"
              :rows-per-page-options="[5, 10, 12, 20]"
              :pagination="{ rowsPerPage: 10 }"
              class="minw-560"
            />
          </div>
        </q-card-section>
      </q-card>
    </div>

    <q-inner-loading :showing="loading" label="Analyzing..." />
  </q-page>
</template>
<style scoped>
/* bikin semua tile punya tinggi konsisten dan visualnya rapih */
.tile-card {
  height: 100%;
  min-height: 110px; /* samain tinggi minimum antar tile */
  border-radius: 12px;
  background: #fff;
}

/* konsistenkan ukuran angka utama */
.tile-card .value {
  font-size: 1.25rem; /* ~20px */
  font-weight: 600;
  line-height: 1.2;
  word-break: break-word;
}

/* pastikan row men-stretch anak2nya */
.items-stretch {
  align-items: stretch !important;
}

.card-soft {
  border-radius: 14px;
}

.scroll-x {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.q-col-gutter-x-md,
.q-col-gutter-md {
  margin-left: 0px !important;
}

.minw-560 {
  min-width: 560px; /* biar kolom ga mepet di hp, bisa di-scroll */
}

.tile {
  padding: 8px 10px;
  border: 1px solid var(--q-border-color, #e0e0e0);
  border-radius: 10px;
  background: white;
}

.mini-stat {
  border: 1px solid var(--q-border-color, #e0e0e0);
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
}

/* Label kecil, nilai tebal dan jelas */
.mini-label {
  font-size: 12px;
  line-height: 1.1;
}

.mini-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
  word-break: break-word;
}

/* Sedikit lebih besar di layar kecil agar nyaman dilihat */
@media (max-width: 599px) {
  .mini-stat {
    padding: 12px 14px;
  }
  .mini-value {
    font-size: 19px;
  }
}

/* Di tablet/desktop, tiga kolom */
@media (min-width: 600px) {
  .mini-stat {
    height: 100%;
  }
}
</style>
<script setup>
import { ref, computed, onMounted, watch, defineComponent, h } from 'vue'
import { useQuasar } from 'quasar'
import { API_URL } from 'boot/api'

/** =========================
 *  STATE
 *  ========================= */
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
const CACHE_KEY = 'ai:analyze:last'
const BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]
const MiniStat = defineComponent({
  name: 'MiniStat',
  props: {
    label: { type: String, required: true },
    value: { type: [Number, String, null], default: null },
    formatter: { type: Function, default: (v) => v },
  },
  setup(props) {
    const display = () => {
      if (props.value === null || props.value === undefined || props.value === '') return '-'
      const n = Number(props.value)
      return isNaN(n) ? String(props.value) : props.formatter(n)
    }
    return () =>
      h('div', { class: 'mini-stat row items-center no-wrap' }, [
        h('div', { class: 'col-auto' }, [
          h('div', { class: 'mini-label text-grey-7' }, props.label),
        ]),
        h('div', { class: 'col text-right' }, [h('div', { class: 'mini-value' }, display())]),
      ])
  },
})
function ymToIndo(ym) {
  // expect "YYYY-MM"
  if (!ym || typeof ym !== 'string' || ym.length < 7) return ym
  const [y, m] = ym.split('-')
  const mi = Math.max(1, Math.min(12, parseInt(m, 10))) - 1
  return `${BULAN_ID[mi]} ${y}`
}
const aiForecast = computed(() => result.value?.ai?.prediction)
const aiRisk = computed(() => result.value?.ai?.risk)

const forecastLabels = computed(() => {
  const n = aiForecast.value?.forecast?.length || 0
  if (n === 0) return []
  const last = (result.value?.input?.labels || []).slice(-1)[0] || ''
  return Array.from({ length: n }, (_, i) => `F+${i + 1} ${last}`)
})

const columns = [
  { name: 'idx', label: '#', field: 'idx', align: 'left' },
  {
    name: 'label',
    label: 'Month',
    field: 'label',
    align: 'left',
    sortable: true,
    format: (v) => ymToIndo(v), // << di sini
  },

  { name: 'history', label: 'Net Cash', field: 'history', align: 'right', format: (v) => money(v) },
  {
    name: 'forecast',
    label: 'Forecast',
    field: 'forecast',
    align: 'right',
    format: (v) => (v == null ? '-' : money(v)),
  },
]

const tableRows = computed(() => {
  const labels = result.value?.input?.labels || []
  const hist = result.value?.history || []
  const fc = aiForecast.value?.forecast || []
  const rows = labels.map((lb, i) => ({
    idx: i + 1,
    label: lb,
    history: hist[i] ?? null,
    forecast: null,
  }))
  for (let j = 0; j < fc.length; j++) {
    rows.push({
      idx: labels.length + j + 1,
      label: forecastLabels.value[j] || `F+${j + 1}`,
      history: null,
      forecast: fc[j],
    })
  }
  return rows
})

/** =========================
 *  HELPERS
 *  ========================= */
const money = (v) => {
  const n = Number(v || 0)
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
}
const fmt = (v, digits = 2) => {
  if (v == null) return '-'
  const n = Number(v)
  return isNaN(n) ? '-' : n.toFixed(digits)
}
const riskColor = (lvl) => {
  switch ((lvl || '').toUpperCase()) {
    case 'LOW':
      return 'green'
    case 'MEDIUM':
      return 'amber'
    case 'HIGH':
      return 'red'
    default:
      return 'grey'
  }
}

function saveCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }))
  } catch (e) {
    console.log(e)
  }
}
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw).payload : null
  } catch {
    return null
  }
}
function reloadFromCache() {
  const cached = loadCache()
  if (cached) {
    result.value = cached
    $q.notify({ message: 'Loaded from cache', color: 'grey-8' })
  } else {
    $q.notify({ message: 'No cache found', color: 'orange' })
  }
}

/** =========================
 *  NETWORK HANDLER
 *  ========================= */
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
    saveCache(json)
    $q.notify({ message: 'Analysis done', color: 'primary' })
  } catch (e) {
    const cached = loadCache()
    if (cached) {
      result.value = cached
      $q.notify({ message: e, color: 'orange' })
    } else {
      error.value = e
    }
  } finally {
    loading.value = false
  }
}

/** =========================
 *  LIFECYCLE
 *  ========================= */
onMounted(() => {
  const cached = loadCache()
  if (cached) result.value = cached
})
window.addEventListener('online', () => (online.value = true))
window.addEventListener('offline', () => (online.value = false))
watch(
  () => navigator.onLine,
  (v) => (online.value = v),
)

/** =========================
 *  INLINE COMPONENTS
 *  ========================= */
const AiSparkline = defineComponent({
  name: 'AiSparkline',
  props: {
    values: { type: Array, default: () => [] },
    labels: { type: Array, default: () => [] },
    height: { type: Number, default: 100 },
    padding: { type: Number, default: 8 },
    color: { type: String, default: '#26A69A' },
    strokeWidth: { type: Number, default: 1.5 },
  },
  setup(props) {
    const pathD = computed(() => {
      const vals = (props.values || []).map((v) => Number(v))
      const n = vals.length,
        w = 600,
        h = props.height
      if (!n) return ''
      const min = Math.min(...vals),
        max = Math.max(...vals),
        span = Math.max(1e-9, max - min)
      const x = (i) => (i / Math.max(1, n - 1)) * (w - 2 * props.padding) + props.padding
      const y = (v) => h - props.padding - ((v - min) / span) * (h - 2 * props.padding)
      let d = `M ${x(0)} ${y(vals[0])}`
      for (let i = 1; i < n; i++) d += ` L ${x(i)} ${y(vals[i])}`
      return d
    })
    const areaD = computed(() => {
      const vals = (props.values || []).map((v) => Number(v))
      const n = vals.length,
        w = 600,
        h = props.height
      if (!n) return ''
      const min = Math.min(...vals),
        max = Math.max(...vals),
        span = Math.max(1e-9, max - min)
      const x = (i) => (i / Math.max(1, n - 1)) * (w - 2 * props.padding) + props.padding
      const y = (v) => h - props.padding - ((v - min) / span) * (h - 2 * props.padding)
      let d = `M ${x(0)} ${h - props.padding} L ${x(0)} ${y(vals[0])}`
      for (let i = 1; i < n; i++) d += ` L ${x(i)} ${y(vals[i])}`
      d += ` L ${x(n - 1)} ${h - props.padding} Z`
      return d
    })
    return () =>
      h(
        'svg',
        {
          class: 'sparkline',
          viewBox: `0 0 600 ${props.height}`,
          height: props.height,
          role: 'img',
          'aria-label': 'sparkline',
        },
        [
          h('path', { d: areaD.value, fill: props.color + '22', stroke: 'none' }),
          h('path', {
            d: pathD.value,
            fill: 'none',
            stroke: props.color,
            'stroke-width': props.strokeWidth,
            'stroke-linecap': 'round',
          }),
        ],
      )
  },
})

const SignalItem = defineComponent({
  name: 'SignalItem',
  props: { label: String, value: [String, Number] },
  setup(props) {
    return () =>
      h('div', { class: 'col-6 col-md-2 signal-item' }, [
        h('div', { class: 'text-caption text-grey-7' }, props.label),
        h('div', { class: 'text-subtitle1' }, String(props.value ?? '-')),
      ])
  },
})
</script>

<style scoped>
svg.sparkline {
  width: 100%;
  display: block;
}
.signal-item {
  border: 1px solid var(--q-border-color, #e0e0e0);
  border-radius: 12px;
  padding: 10px 12px;
}
</style>
