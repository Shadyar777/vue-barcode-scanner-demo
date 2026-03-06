import { drawRoiToCanvas } from '../roi'
import type { BarcodeFormat, BoundingBox, ScannerEngine, ScannerEngineContext } from '../types'
import { normalizeError } from '../utils/errors'

type NativeBarcodeFormat =
  | 'qr_code'
  | 'ean_13'
  | 'ean_8'
  | 'upc_a'
  | 'upc_e'
  | 'code_128'
  | 'code_39'
  | 'itf'
  | 'unknown'

const SCANNER_TO_NATIVE_FORMAT: Record<Exclude<BarcodeFormat, 'unknown'>, NativeBarcodeFormat> = {
  qr: 'qr_code',
  ean_13: 'ean_13',
  ean_8: 'ean_8',
  upc_a: 'upc_a',
  upc_e: 'upc_e',
  code_128: 'code_128',
  code_39: 'code_39',
  itf: 'itf',
}

const NATIVE_TO_SCANNER_FORMAT: Partial<Record<NativeBarcodeFormat, BarcodeFormat>> = {
  qr_code: 'qr',
  ean_13: 'ean_13',
  ean_8: 'ean_8',
  upc_a: 'upc_a',
  upc_e: 'upc_e',
  code_128: 'code_128',
  code_39: 'code_39',
  itf: 'itf',
  unknown: 'unknown',
}

const toNativeFormat = (format: BarcodeFormat): NativeBarcodeFormat | null => {
  if (format === 'unknown') {
    return null
  }

  return SCANNER_TO_NATIVE_FORMAT[format]
}

const toScannerFormat = (nativeFormat: string | undefined): BarcodeFormat => {
  if (!nativeFormat) {
    return 'unknown'
  }

  const mapped = NATIVE_TO_SCANNER_FORMAT[nativeFormat as NativeBarcodeFormat]
  return mapped || 'unknown'
}

const toBoundingBox = (rect: DOMRectReadOnly | undefined): BoundingBox | undefined => {
  if (!rect) {
    return undefined
  }

  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }
}

export const isNativeBarcodeDetectorAvailable = (): boolean => {
  return typeof globalThis !== 'undefined' && 'BarcodeDetector' in globalThis
}

const getSupportedNativeFormats = async (): Promise<Set<string>> => {
  if (!isNativeBarcodeDetectorAvailable()) {
    return new Set()
  }

  try {
    const supported = await globalThis.BarcodeDetector.getSupportedFormats()
    return new Set(supported)
  } catch {
    return new Set()
  }
}

export const canUseNativeBarcodeDetector = async (requestedFormats: BarcodeFormat[]): Promise<boolean> => {
  if (!isNativeBarcodeDetectorAvailable()) {
    return false
  }

  const requestedNativeFormats = requestedFormats
    .map((format) => toNativeFormat(format))
    .filter((format): format is NativeBarcodeFormat => !!format)

  if (requestedNativeFormats.length === 0) {
    return true
  }

  const supportedNativeFormats = await getSupportedNativeFormats()
  if (supportedNativeFormats.size === 0) {
    return false
  }

  return requestedNativeFormats.every((format) => supportedNativeFormats.has(format))
}

export const createNativeBarcodeDetectorEngine = async (): Promise<ScannerEngine> => {
  if (!isNativeBarcodeDetectorAvailable()) {
    throw new Error('Нативный BarcodeDetector недоступен.')
  }

  let detector: BarcodeDetector
  try {
    detector = new globalThis.BarcodeDetector()
  } catch (error) {
    throw normalizeError(error, 'Не удалось инициализировать нативный BarcodeDetector.')
  }

  return {
    kind: 'native',
    async detect(ctx: ScannerEngineContext) {
      const roiCanvas = drawRoiToCanvas(ctx.videoEl, ctx.roi, ctx.maxWidth)
      const detections = await detector.detect(roiCanvas)
      if (detections.length === 0) {
        return null
      }

      const allowedFormats = new Set(ctx.formats)
      for (const detection of detections) {
        const text = detection.rawValue?.trim()
        if (!text) {
          continue
        }

        const format = toScannerFormat(detection.format)
        if (allowedFormats.size > 0 && !allowedFormats.has(format)) {
          continue
        }

        return {
          text,
          format,
          rawFormat: detection.format,
          bbox: toBoundingBox(detection.boundingBox),
        }
      }

      return null
    },
    destroy() {
      // Native detector does not hold disposable resources.
    },
  }
}
