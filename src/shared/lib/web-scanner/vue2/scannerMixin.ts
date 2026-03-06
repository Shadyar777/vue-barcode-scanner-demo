import { createScanner } from '../createScanner'
import type { DetectedCode, Scanner, ScannerOptions, ScannerState, ScannerStats } from '../types'

const DEFAULT_STATE: ScannerState = {
  running: false,
  paused: false,
  engine: 'worker',
}

const createInitialStats = (options: ScannerOptions): ScannerStats => ({
  decodeFps: options.decodeFps ?? 15,
  avgDecodeMs: 0,
})

const ensureScanner = (ctx: any, options: ScannerOptions): Scanner => {
  if (ctx._scanner) {
    return ctx._scanner as Scanner
  }

  const scanner = createScanner({
    ...options,
    onDetected(code) {
      ctx.detectedCode = code
      options.onDetected?.(code)
    },
    onError(error) {
      ctx.error = error
      options.onError?.(error)
    },
    onStats(stats) {
      ctx.stats = stats
      options.onStats?.(stats)
    },
  })

  ctx._scanner = scanner
  ctx.state = scanner.getState()
  return scanner
}

export const createScannerMixin = (options: ScannerOptions = {}) => ({
  data() {
    return {
      videoEl: null as HTMLVideoElement | null,
      _scanner: null as Scanner | null,
      state: { ...DEFAULT_STATE } as ScannerState,
      detectedCode: null as DetectedCode | null,
      error: null as Error | null,
      stats: createInitialStats(options) as ScannerStats,
    }
  },
  methods: {
    bindVideoEl(this: any, el: HTMLVideoElement | null) {
      this.videoEl = el
    },
    syncScannerState(this: any) {
      this.state = this._scanner ? this._scanner.getState() : { ...DEFAULT_STATE }
    },
    async start(this: any) {
      this.error = null

      if (!this.videoEl) {
        const videoError = new Error('Видео-элемент ещё не привязан.')
        this.error = videoError
        throw videoError
      }

      const scanner = ensureScanner(this, options)
      await scanner.start(this.videoEl)
      this.syncScannerState()
    },
    stop(this: any) {
      if (!this._scanner) {
        return
      }

      this._scanner.stop()
      this.syncScannerState()
    },
    pause(this: any) {
      if (!this._scanner) {
        return
      }

      this._scanner.pause()
      this.syncScannerState()
    },
    resume(this: any) {
      if (!this._scanner) {
        return
      }

      this._scanner.resume()
      this.syncScannerState()
    },
    async toggleTorch(this: any, on: boolean): Promise<boolean> {
      if (!this._scanner) {
        return false
      }

      return this._scanner.toggleTorch(on)
    },
  },
  beforeDestroy(this: any) {
    if (this._scanner) {
      this._scanner.stop()
      this.syncScannerState()
    }
  },
  unmounted(this: any) {
    if (this._scanner) {
      this._scanner.stop()
      this.syncScannerState()
    }
  },
})

export const scannerMixin = createScannerMixin()
