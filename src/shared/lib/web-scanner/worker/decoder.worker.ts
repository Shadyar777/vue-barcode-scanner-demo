import type { BarcodeFormat } from '../types'
import { decodeWithZXing, type WorkerDecodedCode } from './zxing'

export {}

interface DecodeRequest {
  type: 'decode'
  id: number
  frame: ImageBitmap | ImageData
  formats: BarcodeFormat[]
}

interface DecodeResponse {
  type: 'result'
  id: number
  result?: WorkerDecodedCode
  ms: number
  error?: string
}

interface WorkerLike {
  onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null
  postMessage: (message: DecodeResponse) => void
}

let offscreenCanvas: OffscreenCanvas | null = null
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null

const isImageBitmap = (value: unknown): value is ImageBitmap => {
  return typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap
}

const ensureOffscreenCanvas = (
  width: number,
  height: number
): {
  canvas: OffscreenCanvas
  ctx: OffscreenCanvasRenderingContext2D
} => {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('OffscreenCanvas не поддерживается в этом Worker-окружении браузера.')
  }

  if (!offscreenCanvas || !offscreenCtx) {
    offscreenCanvas = new OffscreenCanvas(width, height)
    const nextCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true, alpha: false })
    if (!nextCtx) {
      throw new Error('Не удалось создать контекст OffscreenCanvas в Worker.')
    }

    offscreenCtx = nextCtx
  }

  if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
    offscreenCanvas.width = width
    offscreenCanvas.height = height
  }

  return {
    canvas: offscreenCanvas,
    ctx: offscreenCtx,
  }
}

const frameToImageData = (frame: ImageBitmap | ImageData): ImageData => {
  if (!isImageBitmap(frame)) {
    return frame
  }

  const width = frame.width
  const height = frame.height

  try {
    const { ctx } = ensureOffscreenCanvas(width, height)
    ctx.drawImage(frame, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height)
  } finally {
    frame.close()
  }
}

const workerScope = globalThis as unknown as WorkerLike

workerScope.onmessage = (event: MessageEvent<DecodeRequest>) => {
  const message = event.data
  if (!message || message.type !== 'decode') {
    return
  }

  const startedAt = performance.now()

  try {
    const imageData = frameToImageData(message.frame)
    const result = decodeWithZXing(imageData, message.formats)

    const response: DecodeResponse = {
      type: 'result',
      id: message.id,
      result: result || undefined,
      ms: performance.now() - startedAt,
    }

    workerScope.postMessage(response)
  } catch (error) {
    const response: DecodeResponse = {
      type: 'result',
      id: message.id,
      ms: performance.now() - startedAt,
      error: error instanceof Error ? error.message : 'Ошибка декодирования в Worker',
    }

    workerScope.postMessage(response)
  }
}
