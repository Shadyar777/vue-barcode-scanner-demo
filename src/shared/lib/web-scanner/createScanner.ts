import { startCamera, stopCamera, toggleTorch as toggleCameraTorch } from './camera'
import {
  canUseNativeBarcodeDetector,
  createNativeBarcodeDetectorEngine,
} from './engines/nativeBarcodeDetector'
import { createZXingWorkerEngine } from './engines/zxingWorkerEngine'
import { DEFAULT_ROI, normalizeRoi } from './roi'
import { createScheduler } from './scheduler'
import type {
  BarcodeFormat,
  DetectedCode,
  EngineDetectedCode,
  RoiRect,
  Scanner,
  ScannerEngine,
  ScannerOptions,
} from './types'
import { createDedupeFilter } from './utils/dedupe'
import { normalizeError, toPlaybackError } from './utils/errors'
import { unixTsMs } from './utils/time'

const MIN_DECODE_FPS = 8
const HARD_MAX_DECODE_FPS = 30
const MAX_FRAME_WIDTH = 640
const STABILIZATION_WINDOW_MS = 900
const HIGH_CONFIDENCE_THRESHOLD = 0.92

export const DEFAULT_SCANNER_FORMATS: BarcodeFormat[] = [
  'qr',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
]

export const DEFAULT_SCANNER_ROI: RoiRect = { ...DEFAULT_ROI }

const FORMAT_ALIASES: Record<string, BarcodeFormat> = {
  qr: 'qr',
  qr_code: 'qr',
  ean_13: 'ean_13',
  ean13: 'ean_13',
  ean_8: 'ean_8',
  ean8: 'ean_8',
  upc_a: 'upc_a',
  upca: 'upc_a',
  upc_e: 'upc_e',
  upce: 'upc_e',
  code_128: 'code_128',
  code128: 'code_128',
  code_123: 'code_128',
  code123: 'code_128',
  code_39: 'code_39',
  code39: 'code_39',
  itf: 'itf',
  unknown: 'unknown',
}

interface StableCandidate {
  key: string
  count: number
  ts: number
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

const normalizeFormats = (formats?: BarcodeFormat[]): BarcodeFormat[] => {
  if (!formats || formats.length === 0) {
    return [...DEFAULT_SCANNER_FORMATS]
  }

  const normalized = new Set<BarcodeFormat>()
  for (const rawFormat of formats as unknown[]) {
    if (typeof rawFormat !== 'string') {
      continue
    }

    const key = rawFormat.trim().toLowerCase()
    const canonical = FORMAT_ALIASES[key]
    if (canonical) {
      normalized.add(canonical)
    }
  }

  return normalized.size > 0 ? [...normalized] : [...DEFAULT_SCANNER_FORMATS]
}

const isThenable = <T>(value: unknown): value is Promise<T> => {
  return typeof value === 'object' && value !== null && 'then' in value
}

const destroyEngine = (engine: ScannerEngine | null): void => {
  if (!engine) {
    return
  }

  try {
    const result = engine.destroy()
    if (isThenable<void>(result)) {
      void result.catch(() => undefined)
    }
  } catch {
    // Ignore teardown errors.
  }
}

const applyVideoAttributes = (videoEl: HTMLVideoElement): void => {
  videoEl.playsInline = true
  videoEl.muted = true
  videoEl.autoplay = true
  videoEl.setAttribute('playsinline', 'true')
  videoEl.setAttribute('muted', 'true')
}

const shouldEmitByStability = (
  detection: EngineDetectedCode,
  lastCandidate: StableCandidate | null
): {
  stable: boolean
  candidate: StableCandidate | null
} => {
  const key = `${detection.format}:${detection.text}`
  const nowTs = Date.now()

  if ((detection.confidence || 0) >= HIGH_CONFIDENCE_THRESHOLD) {
    return {
      stable: true,
      candidate: null,
    }
  }

  if (lastCandidate && lastCandidate.key === key && nowTs - lastCandidate.ts <= STABILIZATION_WINDOW_MS) {
    const nextCount = lastCandidate.count + 1

    if (nextCount >= 2) {
      return {
        stable: true,
        candidate: null,
      }
    }

    return {
      stable: false,
      candidate: {
        key,
        count: nextCount,
        ts: nowTs,
      },
    }
  }

  return {
    stable: false,
    candidate: {
      key,
      count: 1,
      ts: nowTs,
    },
  }
}

export const createScanner = (options: ScannerOptions = {}): Scanner => {
  const maxDecodeFps = clamp(options.maxDecodeFps ?? HARD_MAX_DECODE_FPS, MIN_DECODE_FPS, HARD_MAX_DECODE_FPS)

  let formats = normalizeFormats(options.formats)
  let preferredCamera = options.preferredCamera ?? 'environment'
  let roi = normalizeRoi(options.roi ?? DEFAULT_SCANNER_ROI)
  let decodeFps = clamp(options.decodeFps ?? 15, MIN_DECODE_FPS, maxDecodeFps)
  let dedupeMs = clamp(options.dedupeMs ?? 1200, 200, 5000)

  const dedupeFilter = createDedupeFilter(dedupeMs)

  let videoEl: HTMLVideoElement | null = null
  let stream: MediaStream | null = null
  let engine: ScannerEngine | null = null
  let engineKind: 'native' | 'worker' = 'worker'

  let running = false
  let paused = false
  let stableCandidate: StableCandidate | null = null
  let lastDecodeErrorTs = 0
  let switchingEngine = false

  const scheduler = createScheduler({
    decodeFps,
    maxDecodeFps,
    minDecodeFps: MIN_DECODE_FPS,
    debug: options.debug,
    onDecode: async () => {
      if (!running || paused || !videoEl || !engine) {
        return false
      }

      const readyState =
        typeof HTMLMediaElement !== 'undefined'
          ? HTMLMediaElement.HAVE_CURRENT_DATA
          : 2

      if (videoEl.readyState < readyState) {
        return false
      }

      try {
        const detection = await engine.detect({
          videoEl,
          roi,
          formats,
          maxWidth: MAX_FRAME_WIDTH,
        })

        if (!detection) {
          if (stableCandidate && Date.now() - stableCandidate.ts > STABILIZATION_WINDOW_MS) {
            stableCandidate = null
          }
          return false
        }

        const stability = shouldEmitByStability(detection, stableCandidate)
        stableCandidate = stability.candidate
        if (!stability.stable) {
          return false
        }

        const code: DetectedCode = {
          text: detection.text,
          format: detection.format,
          rawFormat: detection.rawFormat,
          bbox: detection.bbox,
          ts: unixTsMs(),
        }

        if (!dedupeFilter.shouldEmit(code.format, code.text)) {
          return true
        }

        options.onDetected?.(code)
        return true
      } catch (error) {
        const nowTs = Date.now()
        if (nowTs - lastDecodeErrorTs > 1000) {
          lastDecodeErrorTs = nowTs
          options.onError?.(normalizeError(error, 'Scanner decode failed.'))
        }

        return false
      }
    },
    onStats: (stats) => {
      options.onStats?.(stats)
    },
  })

  const cleanupVideo = () => {
    if (!videoEl) {
      return
    }

    try {
      videoEl.pause()
    } catch {
      // Ignore pause errors.
    }

    videoEl.srcObject = null
  }

  const cleanup = () => {
    scheduler.stop()
    destroyEngine(engine)
    engine = null
    running = false
    paused = false
    stableCandidate = null

    stopCamera(stream)
    stream = null

    cleanupVideo()
    dedupeFilter.reset()
  }

  const chooseEngine = async (): Promise<ScannerEngine> => {
    const supportsRequestedFormats = await canUseNativeBarcodeDetector(formats)
    if (supportsRequestedFormats) {
      try {
        return await createNativeBarcodeDetectorEngine()
      } catch (error) {
        options.onError?.(normalizeError(error, 'Native scanner engine failed, switching to worker.'))
      }
    }

    return createZXingWorkerEngine()
  }

  const ensureEngineMatchesFormats = async () => {
    if (!running || switchingEngine) {
      return
    }

    switchingEngine = true
    try {
      const shouldUseNative = await canUseNativeBarcodeDetector(formats)
      const requiredKind: 'native' | 'worker' = shouldUseNative ? 'native' : 'worker'

      if (engine && engine.kind === requiredKind) {
        return
      }

      const nextEngine = shouldUseNative
        ? await createNativeBarcodeDetectorEngine()
        : createZXingWorkerEngine()

      const previousEngine = engine
      engine = nextEngine
      engineKind = nextEngine.kind
      destroyEngine(previousEngine)
    } catch (error) {
      options.onError?.(normalizeError(error, 'Failed to switch scanner engine.'))
    } finally {
      switchingEngine = false
    }
  }

  return {
    async start(nextVideoEl) {
      if (running) {
        return
      }

      videoEl = nextVideoEl
      stableCandidate = null
      dedupeFilter.reset()

      try {
        applyVideoAttributes(nextVideoEl)

        stream = await startCamera(preferredCamera)
        nextVideoEl.srcObject = stream

        try {
          await nextVideoEl.play()
        } catch (error) {
          throw toPlaybackError(error)
        }

        engine = await chooseEngine()
        engineKind = engine.kind

        running = true
        paused = false

        scheduler.start(nextVideoEl)
      } catch (error) {
        cleanup()

        const mappedError =
          error instanceof Error ? error : normalizeError(error, 'Failed to start scanner engine.')

        options.onError?.(mappedError)
        throw mappedError
      }
    },
    stop() {
      cleanup()
    },
    pause() {
      if (!running) {
        return
      }

      paused = true
      scheduler.pause()
    },
    resume() {
      if (!running) {
        return
      }

      paused = false
      scheduler.resume()
    },
    setRoi(nextRoi) {
      roi = normalizeRoi(nextRoi)
    },
    setFormats(nextFormats) {
      formats = normalizeFormats(nextFormats)
      stableCandidate = null
      dedupeFilter.reset()
      void ensureEngineMatchesFormats()
    },
    setDecodeFps(nextFps) {
      decodeFps = clamp(nextFps, MIN_DECODE_FPS, maxDecodeFps)
      scheduler.setDecodeFps(decodeFps)
    },
    async toggleTorch(on: boolean) {
      return toggleCameraTorch(stream, on)
    },
    getState() {
      return {
        running,
        paused,
        engine: engine?.kind || engineKind,
      }
    },
  }
}
