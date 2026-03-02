<script setup>
import { onBeforeUnmount, ref } from 'vue'

const videoRef = ref(null)
const statusText = ref('Нажмите кнопку, чтобы открыть камеру')
const barcodeValue = ref('Пока ничего не найдено')
const barcodeFormat = ref('')
const isScanning = ref(false)

const hasBarcodeSupport =
  typeof window !== 'undefined' &&
  'BarcodeDetector' in window &&
  !!navigator.mediaDevices?.getUserMedia

let stream = null
let detector = null
let rafId = null

const stopScanner = () => {
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
    statusText.value = `Ошибка распознавания: ${error.message}`
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

    const formats = await window.BarcodeDetector.getSupportedFormats()
    detector = new window.BarcodeDetector(
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
    statusText.value = `Не удалось запустить сканер: ${error.message}`
    stopScanner()
  }
}

onBeforeUnmount(() => {
  stopScanner()
})
</script>

<template>
  <main class="scanner">
    <h1>Сканер штрихкода</h1>

    <button class="scanner__button" type="button" @click="startScanner">
      Открыть камеру
    </button>

    <p class="scanner__status">{{ statusText }}</p>

    <video ref="videoRef" class="scanner__video" autoplay playsinline muted />

    <div class="scanner__result">
      <p><strong>Результат:</strong> {{ barcodeValue }}</p>
      <p v-if="barcodeFormat"><strong>Формат:</strong> {{ barcodeFormat }}</p>
    </div>
  </main>
</template>

<style scoped>
.scanner {
  display: grid;
  gap: 1rem;
  width: min(720px, 100%);
  margin: 0 auto;
}

h1 {
  font-size: 1.5rem;
  font-weight: 700;
}

.scanner__button {
  width: fit-content;
  padding: 0.65rem 1rem;
  border: 0;
  border-radius: 0.6rem;
  background: #1867c0;
  color: #fff;
  cursor: pointer;
}

.scanner__button:hover {
  background: #1459a8;
}

.scanner__status {
  color: #555;
}

.scanner__video {
  width: 100%;
  max-height: 420px;
  border-radius: 0.8rem;
  background: #000;
  object-fit: cover;
}

.scanner__result {
  padding: 0.75rem;
  border-radius: 0.6rem;
  background: #f5f6f8;
}
</style>
