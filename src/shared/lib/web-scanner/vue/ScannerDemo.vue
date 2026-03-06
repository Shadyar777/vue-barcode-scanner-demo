<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { BarcodeFormat } from '../types'
import { useWebScanner } from './useWebScanner'

const requestedFormats: BarcodeFormat[] = ['qr', 'code_128']
const preferredCamera = 'environment'
const decodeFpsTarget = 15
const maxDecodeFps = 30
const minAdaptiveDecodeFps = 8
const dedupeMs = 1200

const roi = {
  x: 0.15,
  y: 0.15,
  width: 0.7,
  height: 0.7,
}

const { videoElRef, state, detectedCode, error, stats, start, stop, pause, resume } = useWebScanner({
  formats: requestedFormats,
  preferredCamera,
  roi,
  decodeFps: decodeFpsTarget,
  maxDecodeFps,
  dedupeMs,
})

const nativeDetectorAvailable = ref(false)
const nativeSupportedFormats = ref<string[] | null>(null)
const nativeSupportError = ref<string | null>(null)

onMounted(async () => {
  nativeDetectorAvailable.value = typeof window !== 'undefined' && 'BarcodeDetector' in window
  if (!nativeDetectorAvailable.value) {
    return
  }

  try {
    nativeSupportedFormats.value = await BarcodeDetector.getSupportedFormats()
  } catch (nextError) {
    nativeSupportError.value =
      nextError instanceof Error ? nextError.message : 'Неизвестная ошибка нативного детектора'
    nativeSupportedFormats.value = []
  }
})

const requestedNativeFormats = computed(() => {
  return requestedFormats.map((format) => (format === 'qr' ? 'qr_code' : format))
})

const missingRequestedNativeFormats = computed(() => {
  if (!nativeSupportedFormats.value) {
    return []
  }

  const supported = new Set(nativeSupportedFormats.value)
  return requestedNativeFormats.value.filter((format) => !supported.has(format))
})

const roiStyle = computed(() => ({
  left: `${roi.x * 100}%`,
  top: `${roi.y * 100}%`,
  width: `${roi.width * 100}%`,
  height: `${roi.height * 100}%`,
}))

const statusText = computed(() => {
  if (error.value) {
    return error.value.message
  }

  if (!state.value.running) {
    return 'Остановлен'
  }

  if (state.value.paused) {
    return `Пауза (${state.value.engine})`
  }

  return `Работает (${state.value.engine})`
})

const activeApiLabel = computed(() => {
  return state.value.engine === 'native'
    ? 'BarcodeDetector API (нативный)'
    : 'Web Worker + @zxing/library'
})

const strategyLabel = 'Проверка feature support -> сначала нативный BarcodeDetector -> fallback на Worker'

const engineReason = computed(() => {
  if (state.value.engine === 'native') {
    return 'Запрошенные форматы покрываются нативным детектором в этом браузере.'
  }

  if (!nativeDetectorAvailable.value) {
    return 'BarcodeDetector недоступен, поэтому путь через Worker обязателен.'
  }

  if (missingRequestedNativeFormats.value.length > 0) {
    return `Нативный детектор не покрывает все запрошенные форматы (${missingRequestedNativeFormats.value.join(', ')}).`
  }

  return 'Выбран путь через Worker как fallback по совместимости/производительности.'
})

const nativeFormatsText = computed(() => {
  if (!nativeDetectorAvailable.value) {
    return 'недоступен'
  }

  if (nativeSupportError.value) {
    return `ошибка: ${nativeSupportError.value}`
  }

  if (!nativeSupportedFormats.value) {
    return 'проверка...'
  }

  if (nativeSupportedFormats.value.length === 0) {
    return 'браузер вернул пустой список'
  }

  return nativeSupportedFormats.value.join(', ')
})

const bboxText = computed(() => {
  if (!detectedCode.value?.bbox) {
    return '—'
  }

  const { x, y, width, height } = detectedCode.value.bbox
  return `x:${x.toFixed(1)} y:${y.toFixed(1)} w:${width.toFixed(1)} h:${height.toFixed(1)}`
})

const detectedAtText = computed(() => {
  if (!detectedCode.value) {
    return '—'
  }

  return new Date(detectedCode.value.ts).toLocaleTimeString()
})

const onStartStop = async () => {
  if (state.value.running) {
    stop()
    return
  }

  try {
    await start()
  } catch {
    // Error text is already exposed by composable.
  }
}

const onPauseResume = () => {
  if (state.value.paused) {
    resume()
    return
  }

  pause()
}
</script>

<template>
  <section class="scanner-demo">
    <div class="viewport">
      <video ref="videoElRef" class="preview" autoplay muted playsinline></video>
      <div class="roi-frame" :style="roiStyle"></div>
    </div>

    <div class="controls">
      <button type="button" @click="onStartStop">
        {{ state.running ? 'Стоп' : 'Старт' }}
      </button>
      <button type="button" :disabled="!state.running" @click="onPauseResume">
        {{ state.paused ? 'Продолжить' : 'Пауза' }}
      </button>
    </div>

    <p class="status">{{ statusText }}</p>
    <p class="metrics">
      FPS декодирования: {{ stats.decodeFps.toFixed(1) }} | Среднее время decode:
      {{ stats.avgDecodeMs.toFixed(1) }} мс
      <template v-if="typeof stats.previewFps === 'number'">
        | FPS превью: {{ stats.previewFps.toFixed(1) }}
      </template>
    </p>
    <p class="result">
      Результат:
      <strong>{{ detectedCode ? `${detectedCode.text} (${detectedCode.format})` : '—' }}</strong>
    </p>

    <section class="debug-panel">
      <h3>Движок и стратегия</h3>
      <p><strong>Активный API:</strong> {{ activeApiLabel }}</p>
      <p><strong>Стратегия выбора:</strong> {{ strategyLabel }}</p>
      <p><strong>Почему выбран этот движок:</strong> {{ engineReason }}</p>

      <p><strong>Запрошенные форматы сканера:</strong> {{ requestedFormats.join(', ') }}</p>
      <p><strong>Запрошенные форматы для native:</strong> {{ requestedNativeFormats.join(', ') }}</p>
      <p><strong>Форматы, поддерживаемые native:</strong> {{ nativeFormatsText }}</p>

      <p>
        <strong>Конфиг:</strong>
        камера={{ preferredCamera }},
        ROI={ x:{{ roi.x }}, y:{{ roi.y }}, w:{{ roi.width }}, h:{{ roi.height }} },
        decodeFps={{ decodeFpsTarget }} (адаптивно {{ minAdaptiveDecodeFps }}..{{ maxDecodeFps }}),
        dedupe={{ dedupeMs }} мс,
        стабилизация=2 совпадения подряд
      </p>

      <p><strong>Время последнего детекта:</strong> {{ detectedAtText }}</p>
      <p><strong>Последний bbox:</strong> {{ bboxText }}</p>
    </section>
  </section>
</template>

<style scoped>
.scanner-demo {
  display: grid;
  gap: 12px;
  max-width: 680px;
}

.viewport {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background: #111827;
  aspect-ratio: 16 / 10;
}

.preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.roi-frame {
  position: absolute;
  border: 2px solid #22d3ee;
  border-radius: 10px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.28);
  pointer-events: none;
}

.controls {
  display: flex;
  gap: 8px;
}

button {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #ffffff;
  color: #111827;
  padding: 8px 12px;
  font-size: 14px;
}

button:disabled {
  opacity: 0.5;
}

.status,
.metrics,
.result {
  margin: 0;
  color: #111827;
  font-size: 14px;
}

.debug-panel {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  display: grid;
  gap: 6px;
}

.debug-panel h3 {
  margin: 0;
  font-size: 15px;
  color: #0f172a;
}

.debug-panel p {
  margin: 0;
  color: #334155;
  font-size: 13px;
  line-height: 1.35;
}
</style>
