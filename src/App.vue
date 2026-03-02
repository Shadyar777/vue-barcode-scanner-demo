<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const videoRef = ref<HTMLVideoElement | null>(null)
const statusText = ref('Нажмите кнопку, чтобы открыть камеру')
const barcodeValue = ref('Пока ничего не найдено')
const barcodeFormat = ref('')
const isScanning = ref(false)

const hasBarcodeSupport =
  typeof window !== 'undefined' &&
  'BarcodeDetector' in window &&
  !!navigator.mediaDevices?.getUserMedia

let stream: MediaStream | null = null
let detector: BarcodeDetector | null = null
let rafId: number | null = null

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Неизвестная ошибка'
}

const stopScanner = (): void => {
  isScanning.value = false

  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
    stream = null
  }

  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
}

const scanLoop = async () => {
  if (!isScanning.value || !detector || !videoRef.value) {
    return
  }

  try {
    if (videoRef.value.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const barcodes = await detector.detect(videoRef.value)

      if (barcodes.length > 0) {
        barcodeValue.value = barcodes[0].rawValue || 'Значение пустое'
        barcodeFormat.value = barcodes[0].format || ''
        statusText.value = 'Штрихкод найден'
      }
    }
  } catch (error) {
    statusText.value = `Ошибка распознавания: ${getErrorMessage(error)}`
    stopScanner()
    return
  }

  rafId = requestAnimationFrame(scanLoop)
}

const startScanner = async () => {
  if (isScanning.value) {
    return
  }

  if (!hasBarcodeSupport) {
    statusText.value = 'Barcode Detection API не поддерживается в этом браузере'
    return
  }

  try {
    statusText.value = 'Запрашиваю доступ к камере...'

    const formats = await globalThis.BarcodeDetector.getSupportedFormats()
    detector = new globalThis.BarcodeDetector(
      formats.length > 0 ? { formats } : undefined,
    )

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })

    if (!videoRef.value) {
      throw new Error('Видео элемент не найден')
    }

    videoRef.value.srcObject = stream
    await videoRef.value.play()

    isScanning.value = true
    statusText.value = 'Камера активна. Наведите на штрихкод'
    scanLoop()
  } catch (error) {
    console.log(`Не удалось запустить сканер: ${getErrorMessage(error)}`);
    
    statusText.value = `Не удалось запустить сканер: ${getErrorMessage(error)}`
    stopScanner()
  }
}

onBeforeUnmount(() => {
  stopScanner()
})
</script>

<template>
  <main class="mx-auto grid w-full max-w-3xl gap-4 p-4 sm:p-8">
    <h1 class="text-2xl font-bold tracking-tight text-slate-900">
      Сканер штрихкода
    </h1>

    <button
      class="w-fit rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 active:scale-[0.99]"
      type="button"
      @click="startScanner"
    >
      Открыть камеру
    </button>

    <p class="text-sm text-slate-600">{{ statusText }}</p>

    <video
      ref="videoRef"
      class="max-h-105 w-full rounded-xl bg-black object-cover shadow"
      autoplay
      playsinline
      muted
    />

    <div class="rounded-lg bg-slate-100 p-3 text-slate-900">
      <p><strong>Результат:</strong> {{ barcodeValue }}</p>
      <p v-if="barcodeFormat" class="mt-1">
        <strong>Формат:</strong> {{ barcodeFormat }}
      </p>
    </div>
  </main>
</template>
