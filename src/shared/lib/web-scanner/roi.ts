import type { RoiRect } from './types'

export const DEFAULT_ROI: RoiRect = {
  x: 0.15,
  y: 0.15,
  width: 0.7,
  height: 0.7,
}

interface CanvasRefs {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

const canvasPool = new WeakMap<HTMLVideoElement, CanvasRefs>()

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

export const normalizeRoi = (roi: RoiRect): RoiRect => {
  const x = clamp(roi.x, 0, 1)
  const y = clamp(roi.y, 0, 1)
  const width = clamp(roi.width, 0.05, 1 - x)
  const height = clamp(roi.height, 0.05, 1 - y)

  return { x, y, width, height }
}

const getCanvasRefs = (video: HTMLVideoElement): CanvasRefs => {
  const cached = canvasPool.get(video)
  if (cached) {
    return cached
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })
  if (!ctx) {
    throw new Error('Unable to create 2D canvas context for ROI extraction.')
  }

  const refs = { canvas, ctx }
  canvasPool.set(video, refs)
  return refs
}

interface DrawResult {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

const drawVideoRoi = (video: HTMLVideoElement, roi: RoiRect, maxWidth: number): DrawResult => {
  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  if (!sourceWidth || !sourceHeight) {
    throw new Error('Video is not ready yet. Tap Start and try again.')
  }

  const normalized = normalizeRoi(roi)

  const cropX = Math.round(sourceWidth * normalized.x)
  const cropY = Math.round(sourceHeight * normalized.y)
  const cropWidth = Math.max(1, Math.round(sourceWidth * normalized.width))
  const cropHeight = Math.max(1, Math.round(sourceHeight * normalized.height))

  const limitWidth = Math.max(64, Math.floor(maxWidth))
  const scale = cropWidth > limitWidth ? limitWidth / cropWidth : 1
  const outputWidth = Math.max(1, Math.round(cropWidth * scale))
  const outputHeight = Math.max(1, Math.round(cropHeight * scale))

  const { canvas, ctx } = getCanvasRefs(video)
  if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
    canvas.width = outputWidth
    canvas.height = outputHeight
  }

  ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight)

  return {
    canvas,
    width: outputWidth,
    height: outputHeight,
  }
}

export const drawRoiToCanvas = (video: HTMLVideoElement, roi: RoiRect, maxWidth = 640): HTMLCanvasElement => {
  return drawVideoRoi(video, roi, maxWidth).canvas
}

export const applyRoiAndDownscale = async (
  video: HTMLVideoElement,
  roi: RoiRect,
  maxWidth = 640,
  preferImageBitmap = true
): Promise<ImageBitmap | ImageData> => {
  const { canvas, width, height } = drawVideoRoi(video, roi, maxWidth)

  if (preferImageBitmap && typeof createImageBitmap === 'function') {
    return createImageBitmap(canvas)
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })
  if (!ctx) {
    throw new Error('Unable to read canvas frame for decoding.')
  }

  return ctx.getImageData(0, 0, width, height)
}
