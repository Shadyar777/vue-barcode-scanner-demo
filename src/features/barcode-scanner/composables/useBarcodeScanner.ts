import { computed, ref } from 'vue'
import type { BarcodeScanRecord } from '../types'

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' } },
  audio: false,
}

const READY_STATE_WITH_DATA = HTMLMediaElement.HAVE_CURRENT_DATA

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Неизвестная ошибка'
}

export const useBarcodeScanner = () => {
  const videoRef = ref<HTMLVideoElement | null>(null)
  const statusText = ref('Нажмите кнопку, чтобы открыть камеру')
  const lastBarcodeValue = ref('Пока ничего не найдено')
  const lastBarcodeFormat = ref('')
  const history = ref<BarcodeScanRecord[]>([])
  const isScanning = ref(false)
  const autoPauseAfterFirstScan = ref(true)

  const hasBarcodeSupport = computed(
    () =>
      typeof window !== 'undefined' &&
      'BarcodeDetector' in window &&
      !!navigator.mediaDevices?.getUserMedia,
  )

  const stream = ref<MediaStream | null>(null)
  const isCameraActive = computed(() => stream.value !== null)
  let detector: BarcodeDetector | null = null
  let rafId: number | null = null
  let nextRecordId = 1
  let lastRecordedSignature: string | null = null

  const cancelLoop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  const pauseScanning = (message?: string) => {
    isScanning.value = false
    cancelLoop()

    if (message) {
      statusText.value = message
    }
  }

  const stopCamera = (message = 'Камера остановлена') => {
    pauseScanning(message)
    lastRecordedSignature = null

    if (stream.value) {
      stream.value.getTracks().forEach((track) => track.stop())
      stream.value = null
    }

    if (videoRef.value) {
      videoRef.value.srcObject = null
    }
  }

  const appendToHistory = (barcode: DetectedBarcode) => {
    const signature = `${barcode.format}:${barcode.rawValue}`
    if (lastRecordedSignature === signature) {
      return
    }

    lastRecordedSignature = signature

    history.value.unshift({
      id: nextRecordId++,
      value: barcode.rawValue || 'Значение пустое',
      format: barcode.format || 'unknown',
      scannedAt: new Date(),
    })
  }

  const handleDetectedBarcode = (barcode: DetectedBarcode) => {
    lastBarcodeValue.value = barcode.rawValue || 'Значение пустое'
    lastBarcodeFormat.value = barcode.format || ''
    appendToHistory(barcode)

    if (autoPauseAfterFirstScan.value) {
      pauseScanning('Штрихкод найден. Сканирование на паузе')
      return
    }

    statusText.value = 'Штрихкод найден'
  }

  const scanLoop = async (): Promise<void> => {
    if (!isScanning.value || !detector || !videoRef.value) {
      return
    }

    try {
      if (videoRef.value.readyState >= READY_STATE_WITH_DATA) {
        const barcodes = await detector.detect(videoRef.value)

        if (barcodes.length > 0) {
          handleDetectedBarcode(barcodes[0])
        }
      }
    } catch (error) {
      pauseScanning(`Ошибка распознавания: ${getErrorMessage(error)}`)
      return
    }

    if (!isScanning.value) {
      return
    }

    rafId = requestAnimationFrame(() => {
      void scanLoop()
    })
  }

  const ensureCamera = async () => {
    if (stream.value) {
      return
    }

    if (!videoRef.value) {
      throw new Error('Видео элемент не найден')
    }

    stream.value = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)
    videoRef.value.srcObject = stream.value
    await videoRef.value.play()
  }

  const ensureDetector = async () => {
    if (detector) {
      return
    }

    const formats = await globalThis.BarcodeDetector.getSupportedFormats()
    detector = new globalThis.BarcodeDetector(
      formats.length > 0 ? { formats } : undefined,
    )
  }

  const startScanning = async () => {
    if (isScanning.value) {
      return
    }

    if (!hasBarcodeSupport.value) {
      statusText.value = 'Barcode Detection API не поддерживается в этом браузере'
      return
    }

    try {
      statusText.value = stream.value
        ? 'Возобновляю сканирование...'
        : 'Запрашиваю доступ к камере...'

      lastRecordedSignature = null
      await ensureDetector()
      await ensureCamera()

      isScanning.value = true
      statusText.value = 'Камера активна. Наведите на штрихкод'
      void scanLoop()
    } catch (error) {
      stopCamera(`Не удалось запустить сканер: ${getErrorMessage(error)}`)
    }
  }

  const clearHistory = () => {
    history.value = []
    lastRecordedSignature = null
  }

  return {
    autoPauseAfterFirstScan,
    clearHistory,
    hasBarcodeSupport,
    history,
    isCameraActive,
    isScanning,
    lastBarcodeFormat,
    lastBarcodeValue,
    pauseScanning,
    startScanning,
    statusText,
    stopCamera,
    videoRef,
  }
}
