export interface BarcodeScanRecord {
  id: number
  value: string
  format: string
  detectDurationMs: number
  scannedAt: Date
}

export interface BarcodeDebugPayload {
  rawValue: string
  format: string
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  } | null
  cornerPoints: Array<{
    x: number
    y: number
  }>
  detectDurationMs: number
  scannedAtIso: string
}

export interface BarcodeScanMetrics {
  attempts: number
  successfulScans: number
  lastDetectDurationMs: number
  averageDetectDurationMs: number
  lastSuccessfulDetectDurationMs: number
}
