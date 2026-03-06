export type BarcodeFormat =
  | 'qr'
  | 'ean_13'
  | 'ean_8'
  | 'upc_a'
  | 'upc_e'
  | 'code_128'
  | 'code_39'
  | 'itf'
  | 'unknown'

export type PreferredCamera = 'environment' | 'user'

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface RoiRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DetectedCode {
  text: string
  format: BarcodeFormat
  rawFormat?: string
  bbox?: BoundingBox
  ts: number
}

export interface ScannerStats {
  previewFps?: number
  decodeFps: number
  avgDecodeMs: number
}

export interface ScannerOptions {
  formats?: BarcodeFormat[]
  preferredCamera?: PreferredCamera
  roi?: RoiRect
  decodeFps?: number
  maxDecodeFps?: number
  dedupeMs?: number
  debug?: boolean
  onDetected?: (code: DetectedCode) => void
  onError?: (err: Error) => void
  onStats?: (s: ScannerStats) => void
}

export interface ScannerState {
  running: boolean
  paused: boolean
  engine: 'native' | 'worker'
}

export interface Scanner {
  start(videoEl: HTMLVideoElement): Promise<void>
  stop(): void
  pause(): void
  resume(): void
  setRoi(roi: RoiRect): void
  setFormats(formats: BarcodeFormat[]): void
  setDecodeFps(fps: number): void
  toggleTorch(on: boolean): Promise<boolean>
  getState(): ScannerState
}

export interface EngineDetectedCode {
  text: string
  format: BarcodeFormat
  rawFormat?: string
  bbox?: BoundingBox
  confidence?: number
}

export interface ScannerEngineContext {
  videoEl: HTMLVideoElement
  roi: RoiRect
  formats: BarcodeFormat[]
  maxWidth: number
}

export interface ScannerEngine {
  kind: 'native' | 'worker'
  detect(ctx: ScannerEngineContext): Promise<EngineDetectedCode | null>
  destroy(): void | Promise<void>
}
