<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useBarcodeScanner } from '../composables/useBarcodeScanner'

const {
  autoPauseAfterFirstScan,
  clearHistory,
  hasBarcodeSupport,
  history,
  isCameraActive,
  isScanning,
  lastBarcodeFormat,
  lastBarcodeValue,
  startScanning,
  statusText,
  stopCamera,
  videoRef,
} = useBarcodeScanner()

const startButtonText = computed(() => {
  if (!isCameraActive.value) {
    return 'Открыть камеру'
  }

  if (!isScanning.value) {
    return 'Продолжить сканирование'
  }

  return 'Сканирование активно'
})

const formattedTime = (date: Date): string =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)

onBeforeUnmount(() => {
  stopCamera()
})
</script>

<template>
  <section class="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <header class="grid gap-3">
      <h1 class="text-2xl font-bold tracking-tight text-slate-900">Сканер штрихкода</h1>
      <p class="text-sm text-slate-600">{{ statusText }}</p>
      <p
        v-if="!hasBarcodeSupport"
        class="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700"
      >
        В этом браузере нет поддержки Barcode Detection API.
      </p>
    </header>

    <div class="flex flex-wrap items-center gap-2">
      <button
        class="w-fit rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
        type="button"
        :disabled="isScanning || !hasBarcodeSupport"
        @click="startScanning"
      >
        {{ startButtonText }}
      </button>

      <button
        class="w-fit rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-400"
        type="button"
        :disabled="!isCameraActive"
        @click="stopCamera()"
      >
        Остановить камеру
      </button>

      <label class="ml-auto flex items-center gap-2 text-sm text-slate-700">
        <input
          v-model="autoPauseAfterFirstScan"
          class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          type="checkbox"
        />
        Автопауза после первого чтения
      </label>
    </div>

    <video
      ref="videoRef"
      class="max-h-105 w-full rounded-xl bg-black object-cover shadow"
      autoplay
      playsinline
      muted
    />

    <div class="grid gap-2 rounded-lg bg-slate-100 p-3 text-slate-900">
      <p><strong>Последний результат:</strong> {{ lastBarcodeValue }}</p>
      <p v-if="lastBarcodeFormat"><strong>Формат:</strong> {{ lastBarcodeFormat }}</p>
    </div>

    <section class="grid gap-2">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-slate-900">История сканирований</h2>
        <button
          class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          :disabled="history.length === 0"
          @click="clearHistory"
        >
          Очистить
        </button>
      </div>

      <p v-if="history.length === 0" class="text-sm text-slate-500">Сканирований пока нет</p>

      <ul
        v-else
        class="max-h-60 space-y-2 overflow-auto rounded-lg border border-slate-200 bg-white p-2"
      >
        <li
          v-for="record in history"
          :key="record.id"
          class="rounded-md border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800"
        >
          <p><strong>Значение:</strong> {{ record.value }}</p>
          <p><strong>Формат:</strong> {{ record.format }}</p>
          <p><strong>Время:</strong> {{ formattedTime(record.scannedAt) }}</p>
        </li>
      </ul>
    </section>
  </section>
</template>
