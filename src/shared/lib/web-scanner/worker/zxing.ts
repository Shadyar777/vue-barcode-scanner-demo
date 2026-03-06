import {
  BarcodeFormat as ZXingBarcodeFormat,
  BinaryBitmap,
  ChecksumException,
  DecodeHintType,
  FormatException,
  HybridBinarizer,
  MultiFormatReader,
  NotFoundException,
  RGBLuminanceSource,
} from '@zxing/library'
import type { BarcodeFormat, BoundingBox } from '../types'

export interface WorkerDecodedCode {
  text: string
  format: BarcodeFormat
  rawFormat?: string
  bbox?: BoundingBox
  confidence?: number
}

const SCANNER_TO_ZXING_FORMAT: Partial<Record<BarcodeFormat, ZXingBarcodeFormat>> = {
  qr: ZXingBarcodeFormat.QR_CODE,
  ean_13: ZXingBarcodeFormat.EAN_13,
  ean_8: ZXingBarcodeFormat.EAN_8,
  upc_a: ZXingBarcodeFormat.UPC_A,
  upc_e: ZXingBarcodeFormat.UPC_E,
  code_128: ZXingBarcodeFormat.CODE_128,
  code_39: ZXingBarcodeFormat.CODE_39,
  itf: ZXingBarcodeFormat.ITF,
}

const ZXING_TO_SCANNER_FORMAT = new Map<ZXingBarcodeFormat, BarcodeFormat>([
  [ZXingBarcodeFormat.QR_CODE, 'qr'],
  [ZXingBarcodeFormat.EAN_13, 'ean_13'],
  [ZXingBarcodeFormat.EAN_8, 'ean_8'],
  [ZXingBarcodeFormat.UPC_A, 'upc_a'],
  [ZXingBarcodeFormat.UPC_E, 'upc_e'],
  [ZXingBarcodeFormat.CODE_128, 'code_128'],
  [ZXingBarcodeFormat.CODE_39, 'code_39'],
  [ZXingBarcodeFormat.ITF, 'itf'],
])

let reader: MultiFormatReader | null = null
let configuredFormatsKey = ''

const mapFormatsToZXing = (formats: BarcodeFormat[]): ZXingBarcodeFormat[] => {
  const mapped = formats
    .map((format) => SCANNER_TO_ZXING_FORMAT[format])
    .filter((format): format is ZXingBarcodeFormat => typeof format !== 'undefined')

  return mapped.length ? mapped : Object.values(SCANNER_TO_ZXING_FORMAT).filter((v): v is ZXingBarcodeFormat => !!v)
}

const createReader = (formats: BarcodeFormat[]): MultiFormatReader => {
  const nextReader = new MultiFormatReader()
  const hints = new Map<DecodeHintType, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, mapFormatsToZXing(formats))
  hints.set(DecodeHintType.TRY_HARDER, true)
  nextReader.setHints(hints)
  return nextReader
}

const getReader = (formats: BarcodeFormat[]): MultiFormatReader => {
  const key = [...formats].sort().join(',')
  if (!reader || configuredFormatsKey !== key) {
    reader = createReader(formats)
    configuredFormatsKey = key
  }

  return reader
}

const isNotFoundLike = (error: unknown): boolean => {
  if (error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException) {
    return true
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    ((error as { name: string }).name === 'NotFoundException' ||
      (error as { name: string }).name === 'ChecksumException' ||
      (error as { name: string }).name === 'FormatException')
  )
}

const toBoundingBox = (
  points: Array<{
    getX(): number
    getY(): number
  }> | null
): BoundingBox | undefined => {
  if (!points || points.length === 0) {
    return undefined
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    const x = point.getX()
    const y = point.getY()

    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return undefined
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  }
}

export const decodeWithZXing = (imageData: ImageData, formats: BarcodeFormat[]): WorkerDecodedCode | null => {
  const activeReader = getReader(formats)

  try {
    const source = new RGBLuminanceSource(imageData.data, imageData.width, imageData.height)
    const bitmap = new BinaryBitmap(new HybridBinarizer(source))
    const result = activeReader.decode(bitmap)

    const format = ZXING_TO_SCANNER_FORMAT.get(result.getBarcodeFormat()) || 'unknown'
    const text = result.getText()?.trim()
    if (!text) {
      return null
    }

    return {
      text,
      format,
      rawFormat: result.getBarcodeFormat().toString(),
      bbox: toBoundingBox(result.getResultPoints()),
    }
  } catch (error) {
    if (isNotFoundLike(error)) {
      return null
    }

    throw error
  } finally {
    activeReader.reset()
  }
}
