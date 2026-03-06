<script setup lang="ts">
import { computed } from 'vue'
import { useWebScanner } from './useWebScanner'

const roi = {
  x: 0.15,
  y: 0.15,
  width: 0.7,
  height: 0.7,
}

const { videoElRef, state, detectedCode, error, stats, start, stop, pause, resume } = useWebScanner(
  {
    formats: ['qr', 'code_128'],
    preferredCamera: 'environment',
    roi,
    decodeFps: 15,
    maxDecodeFps: 30,
    dedupeMs: 1200,
  }
)

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
    return 'Stopped'
  }

  if (state.value.paused) {
    return `Paused (${state.value.engine})`
  }

  return `Running (${state.value.engine})`
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
        {{ state.running ? 'Stop' : 'Start' }}
      </button>
      <button type="button" :disabled="!state.running" @click="onPauseResume">
        {{ state.paused ? 'Resume' : 'Pause' }}
      </button>
    </div>

    <p class="status">{{ statusText }}</p>
    <p class="metrics">
      Decode FPS: {{ stats.decodeFps.toFixed(1) }} | Avg decode:
      {{ stats.avgDecodeMs.toFixed(1) }}ms
      <template v-if="typeof stats.previewFps === 'number'">
        | Preview FPS: {{ stats.previewFps.toFixed(1) }}
      </template>
    </p>
    <p class="result">
      Result:
      <strong>{{ detectedCode ? `${detectedCode.text} (${detectedCode.format})` : '—' }}</strong>
    </p>
  </section>
</template>

<style scoped>
.scanner-demo {
  display: grid;
  gap: 12px;
  max-width: 560px;
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
</style>
