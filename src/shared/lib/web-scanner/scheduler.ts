import type { ScannerStats } from './types'
import { nowMs } from './utils/time'

interface SchedulerOptions {
  decodeFps: number
  maxDecodeFps: number
  minDecodeFps?: number
  debug?: boolean
  onDecode: () => Promise<boolean>
  onStats?: (stats: ScannerStats) => void
}

type VideoFrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: VideoFrameCallbackMetadata) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

export interface ScannerScheduler {
  start(videoEl: HTMLVideoElement): void
  stop(): void
  pause(): void
  resume(): void
  setDecodeFps(fps: number): void
  getDecodeFps(): number
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

export const createScheduler = (options: SchedulerOptions): ScannerScheduler => {
  const minDecodeFps = options.minDecodeFps ?? 8
  const maxDecodeFps = Math.max(minDecodeFps, options.maxDecodeFps)

  let decodeFps = clamp(options.decodeFps, minDecodeFps, maxDecodeFps)
  let running = false
  let paused = false
  let decodeInFlight = false

  let videoEl: VideoFrameCallbackVideo | null = null
  let rafId: number | null = null
  let vfcId: number | null = null

  let nextDecodeAt = 0
  let avgDecodeMs = 0
  let decodeSamples = 0
  let lastDetectedAt = 0

  let previewFrames = 0
  let previewWindowStart = 0
  let previewFps: number | undefined
  let lastStatsAt = 0

  const cleanupScheduledFrame = () => {
    if (videoEl?.cancelVideoFrameCallback && vfcId !== null) {
      videoEl.cancelVideoFrameCallback(vfcId)
      vfcId = null
    }

    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  const emitStats = (now: number) => {
    if (!options.onStats || now - lastStatsAt < 500) {
      return
    }

    lastStatsAt = now
    options.onStats({
      previewFps,
      decodeFps,
      avgDecodeMs,
    })
  }

  const adaptDecodeRate = (decodeMs: number, detected: boolean, now: number) => {
    const currentInterval = 1000 / Math.max(decodeFps, 1)

    if (avgDecodeMs > currentInterval * 0.9 && decodeFps > minDecodeFps) {
      decodeFps = Math.max(minDecodeFps, decodeFps - 1)
      return
    }

    const noHitForMs = now - lastDetectedAt
    if (!detected && noHitForMs > 3000 && decodeFps < maxDecodeFps && decodeMs < currentInterval * 0.75) {
      decodeFps = Math.min(maxDecodeFps, decodeFps + 1)
    }
  }

  const runDecode = async () => {
    if (!running || paused || decodeInFlight) {
      return
    }

    decodeInFlight = true
    const startedAt = nowMs()

    let detected = false
    try {
      detected = await options.onDecode()
    } catch {
      detected = false
    }

    const finishedAt = nowMs()
    const decodeMs = Math.max(0, finishedAt - startedAt)

    decodeSamples += 1
    avgDecodeMs = avgDecodeMs === 0 ? decodeMs : avgDecodeMs * 0.8 + decodeMs * 0.2

    if (detected) {
      lastDetectedAt = finishedAt
    }

    adaptDecodeRate(decodeMs, detected, finishedAt)
    nextDecodeAt = finishedAt + 1000 / Math.max(decodeFps, 1)

    decodeInFlight = false
  }

  const updatePreviewFps = (now: number) => {
    if (!previewWindowStart) {
      previewWindowStart = now
    }

    previewFrames += 1
    const elapsed = now - previewWindowStart
    if (elapsed >= 1000) {
      previewFps = (previewFrames * 1000) / elapsed
      previewFrames = 0
      previewWindowStart = now
    }
  }

  const scheduleNextFrame = () => {
    if (!running || !videoEl) {
      return
    }

    if (videoEl.requestVideoFrameCallback) {
      vfcId = videoEl.requestVideoFrameCallback((now) => {
        onFrame(now)
      })
      return
    }

    rafId = requestAnimationFrame((now) => {
      onFrame(now)
    })
  }

  const onFrame = (now: number) => {
    if (!running) {
      return
    }

    updatePreviewFps(now)
    emitStats(now)

    if (!paused && now >= nextDecodeAt) {
      void runDecode()
    }

    scheduleNextFrame()
  }

  return {
    start(nextVideoEl) {
      videoEl = nextVideoEl
      running = true
      paused = false
      decodeInFlight = false
      avgDecodeMs = 0
      decodeSamples = 0
      lastDetectedAt = nowMs()
      nextDecodeAt = nowMs()
      previewFrames = 0
      previewWindowStart = 0
      previewFps = undefined
      lastStatsAt = 0

      cleanupScheduledFrame()
      scheduleNextFrame()
    },
    stop() {
      running = false
      paused = false
      decodeInFlight = false
      cleanupScheduledFrame()
      videoEl = null
    },
    pause() {
      paused = true
    },
    resume() {
      if (!running) {
        return
      }

      paused = false
      nextDecodeAt = nowMs()
    },
    setDecodeFps(nextFps) {
      decodeFps = clamp(nextFps, minDecodeFps, maxDecodeFps)
      nextDecodeAt = nowMs()
    },
    getDecodeFps() {
      return decodeFps
    },
  }
}
