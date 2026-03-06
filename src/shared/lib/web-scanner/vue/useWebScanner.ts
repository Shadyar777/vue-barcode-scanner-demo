import { onBeforeUnmount, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import { createScanner } from '../createScanner'
import type { DetectedCode, Scanner, ScannerOptions, ScannerState, ScannerStats } from '../types'

interface UseWebScannerResult {
  videoElRef: Ref<HTMLVideoElement | null>
  state: Ref<ScannerState>
  detectedCode: ShallowRef<DetectedCode | null>
  error: ShallowRef<Error | null>
  stats: Ref<ScannerStats>
  start: () => Promise<void>
  stop: () => void
  pause: () => void
  resume: () => void
  toggleTorch: (on: boolean) => Promise<boolean>
}

const DEFAULT_STATE: ScannerState = {
  running: false,
  paused: false,
  engine: 'worker',
}

export const useWebScanner = (options: ScannerOptions = {}): UseWebScannerResult => {
  const videoElRef = ref<HTMLVideoElement | null>(null)
  const state = ref<ScannerState>({ ...DEFAULT_STATE })
  const detectedCode = shallowRef<DetectedCode | null>(null)
  const error = shallowRef<Error | null>(null)
  const stats = ref<ScannerStats>({
    decodeFps: options.decodeFps ?? 15,
    avgDecodeMs: 0,
  })

  let scanner: Scanner | null = null

  const syncState = () => {
    state.value = scanner ? scanner.getState() : { ...DEFAULT_STATE }
  }

  const ensureScanner = () => {
    if (scanner) {
      return scanner
    }

    scanner = createScanner({
      ...options,
      onDetected(code) {
        detectedCode.value = code
        options.onDetected?.(code)
      },
      onError(nextError) {
        error.value = nextError
        options.onError?.(nextError)
      },
      onStats(nextStats) {
        stats.value = nextStats
        options.onStats?.(nextStats)
      },
    })

    syncState()
    return scanner
  }

  const start = async () => {
    error.value = null

    const videoEl = videoElRef.value
    if (!videoEl) {
      const videoError = new Error('Видео-элемент ещё не привязан.')
      error.value = videoError
      throw videoError
    }

    const instance = ensureScanner()
    await instance.start(videoEl)
    syncState()
  }

  const stop = () => {
    if (!scanner) {
      return
    }

    scanner.stop()
    syncState()
  }

  const pause = () => {
    if (!scanner) {
      return
    }

    scanner.pause()
    syncState()
  }

  const resume = () => {
    if (!scanner) {
      return
    }

    scanner.resume()
    syncState()
  }

  const toggleTorch = async (on: boolean) => {
    if (!scanner) {
      return false
    }

    return scanner.toggleTorch(on)
  }

  onBeforeUnmount(() => {
    scanner?.stop()
    syncState()
  })

  return {
    videoElRef,
    state,
    detectedCode,
    error,
    stats,
    start,
    stop,
    pause,
    resume,
    toggleTorch,
  }
}
