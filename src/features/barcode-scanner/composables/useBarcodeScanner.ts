import { computed, ref, type Ref } from 'vue'
import type { BarcodeDebugPayload, BarcodeScanMetrics, BarcodeScanRecord } from '../types'

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' } },
  audio: false,
}

const DEFAULT_SCAN_INTERVAL_MS = 120
const MAX_HISTORY_RECORDS = 100
const FALLBACK_READY_STATE_WITH_DATA = 2

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Неизвестная ошибка'
}

const toDebugPayload = (
  barcode: DetectedBarcode,
  detectDurationMs: number
): BarcodeDebugPayload => ({
  rawValue: barcode.rawValue || 'Значение пустое',
  format: barcode.format || 'unknown',
  boundingBox: barcode.boundingBox
    ? {
        x: barcode.boundingBox.x,
        y: barcode.boundingBox.y,
        width: barcode.boundingBox.width,
        height: barcode.boundingBox.height,
      }
    : null,
  cornerPoints: (barcode.cornerPoints || []).map((point) => ({
    x: point.x,
    y: point.y,
  })),
  detectDurationMs,
  scannedAtIso: new Date().toISOString(),
})

export const useBarcodeScanner = (videoRef: Readonly<Ref<HTMLVideoElement | null>>) => {
  const readyStateWithData =
    typeof HTMLMediaElement !== 'undefined'
      ? HTMLMediaElement.HAVE_CURRENT_DATA
      : FALLBACK_READY_STATE_WITH_DATA

  const statusText = ref('Нажмите кнопку, чтобы открыть камеру')
  const lastBarcodeValue = ref('Пока ничего не найдено')
  const lastBarcodeFormat = ref('')
  const history = ref<BarcodeScanRecord[]>([])
  const lastDebugPayload = ref<BarcodeDebugPayload | null>(null)
  const scanMetrics = ref<BarcodeScanMetrics>({
    attempts: 0,
    successfulScans: 0,
    lastDetectDurationMs: 0,
    averageDetectDurationMs: 0,
    lastSuccessfulDetectDurationMs: 0,
  })
  const isScanning = ref(false)
  const autoPauseAfterFirstScan = ref(true)

  const hasBarcodeSupport = computed(
    () =>
      typeof window !== 'undefined' &&
      'BarcodeDetector' in window &&
      !!navigator.mediaDevices?.getUserMedia
  )

  const stream = ref<MediaStream | null>(null)
  const isCameraActive = computed(() => stream.value !== null)

  let detector: BarcodeDetector | null = null
  let scanTimeoutId: ReturnType<typeof setTimeout> | null = null
  let scanSessionId = 0
  let nextRecordId = 1
  let lastRecordedSignature: string | null = null
  let totalDetectDurationMs = 0

  const invalidateScanSession = () => {
    scanSessionId += 1
  }

  const cancelScheduledScan = () => {
    if (scanTimeoutId !== null) {
      clearTimeout(scanTimeoutId)
      scanTimeoutId = null
    }
  }

  const pauseScanning = (message?: string) => {
    invalidateScanSession()
    isScanning.value = false
    cancelScheduledScan()

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

  const appendToHistory = (barcode: DetectedBarcode, detectDurationMs: number) => {
    const signature = `${barcode.format}:${barcode.rawValue}`
    if (lastRecordedSignature === signature) {
      return
    }

    lastRecordedSignature = signature

    history.value.push({
      id: nextRecordId++,
      value: barcode.rawValue || 'Значение пустое',
      format: barcode.format || 'unknown',
      detectDurationMs,
      scannedAt: new Date(),
    })

    if (history.value.length > MAX_HISTORY_RECORDS) {
      history.value.splice(0, history.value.length - MAX_HISTORY_RECORDS)
    }
  }

  const handleDetectedBarcode = (barcode: DetectedBarcode, detectDurationMs: number) => {
    lastBarcodeValue.value = barcode.rawValue || 'Значение пустое'
    lastBarcodeFormat.value = barcode.format || ''
    lastDebugPayload.value = toDebugPayload(barcode, detectDurationMs)
    appendToHistory(barcode, detectDurationMs)

    if (autoPauseAfterFirstScan.value) {
      pauseScanning('Штрихкод найден. Сканирование на паузе')
      return
    }

    statusText.value = 'Штрихкод найден'
  }

  const updateMetrics = (detectDurationMs: number) => {
    totalDetectDurationMs += detectDurationMs
    scanMetrics.value.attempts += 1
    scanMetrics.value.lastDetectDurationMs = detectDurationMs
    scanMetrics.value.averageDetectDurationMs = totalDetectDurationMs / scanMetrics.value.attempts
  }

  const scheduleNextScan = (sessionId: number, delayMs: number) => {
    if (!isScanning.value || sessionId !== scanSessionId) {
      return
    }

    cancelScheduledScan()
    scanTimeoutId = setTimeout(() => {
      void scanLoop(sessionId)
    }, delayMs)
  }

  const scanLoop = async (sessionId: number): Promise<void> => {
    if (!isScanning.value || sessionId !== scanSessionId || !detector || !videoRef.value) {
      return
    }

    let detectDurationMs = 0

    try {
      if (videoRef.value.readyState >= readyStateWithData) {
        const detectStartedAt = performance.now()
        const barcodes = await detector.detect(videoRef.value)
        detectDurationMs = performance.now() - detectStartedAt

        if (!isScanning.value || sessionId !== scanSessionId) {
          return
        }

        updateMetrics(detectDurationMs)

        if (barcodes.length > 0) {
          scanMetrics.value.successfulScans += 1
          scanMetrics.value.lastSuccessfulDetectDurationMs = detectDurationMs
          handleDetectedBarcode(barcodes[0], detectDurationMs)
        }
      }
    } catch (error) {
      if (sessionId === scanSessionId) {
        pauseScanning(`Ошибка распознавания: ${getErrorMessage(error)}`)
      }
      return
    }

    if (!isScanning.value || sessionId !== scanSessionId) {
      return
    }

    const nextDelayMs = Math.max(0, DEFAULT_SCAN_INTERVAL_MS - detectDurationMs)
    scheduleNextScan(sessionId, nextDelayMs)
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
    detector = new globalThis.BarcodeDetector(formats.length > 0 ? { formats } : undefined)
  }

  const startScanning = async () => {
    if (isScanning.value) {
      return
    }

    if (!hasBarcodeSupport.value) {
      statusText.value = 'Barcode Detection API не поддерживается в этом браузере'
      return
    }

    const sessionId = scanSessionId + 1
    scanSessionId = sessionId

    try {
      statusText.value = stream.value
        ? 'Возобновляю сканирование...'
        : 'Запрашиваю доступ к камере...'

      lastRecordedSignature = null
      await ensureDetector()
      if (sessionId !== scanSessionId) {
        return
      }

      await ensureCamera()
      if (sessionId !== scanSessionId) {
        return
      }

      isScanning.value = true
      statusText.value = 'Камера активна. Наведите на штрихкод'
      scheduleNextScan(sessionId, 0)
    } catch (error) {
      if (sessionId === scanSessionId) {
        stopCamera(`Не удалось запустить сканер: ${getErrorMessage(error)}`)
      }
    }
  }

  const clearHistory = () => {
    history.value = []
    lastRecordedSignature = null
  }

  const resetDebugStats = () => {
    totalDetectDurationMs = 0
    scanMetrics.value = {
      attempts: 0,
      successfulScans: 0,
      lastDetectDurationMs: 0,
      averageDetectDurationMs: 0,
      lastSuccessfulDetectDurationMs: 0,
    }
    lastDebugPayload.value = null
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
    lastDebugPayload,
    pauseScanning,
    resetDebugStats,
    scanMetrics,
    startScanning,
    statusText,
    stopCamera,
  }
}
