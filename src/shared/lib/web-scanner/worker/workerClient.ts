import type { BarcodeFormat } from '../types'
import { normalizeError } from '../utils/errors'
import type { WorkerDecodedCode } from './zxing'

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

export interface WorkerDecodeResponse {
  result?: WorkerDecodedCode
  ms: number
}

interface PendingRequest {
  resolve: (response: WorkerDecodeResponse) => void
  reject: (error: Error) => void
}

const isImageBitmap = (value: unknown): value is ImageBitmap => {
  return typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap
}

export class WorkerClient {
  private readonly worker: Worker
  private requestId = 0
  private readonly pending = new Map<number, PendingRequest>()

  constructor() {
    this.worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), {
      type: 'module',
    })

    this.worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
      const data = event.data
      if (!data || data.type !== 'result') {
        return
      }

      const request = this.pending.get(data.id)
      if (!request) {
        return
      }

      this.pending.delete(data.id)

      if (data.error) {
        request.reject(new Error(data.error))
        return
      }

      request.resolve({
        result: data.result,
        ms: data.ms,
      })
    }

    this.worker.onerror = (event: ErrorEvent) => {
      const error = new Error(event.message || 'Decoder worker crashed')
      for (const [, request] of this.pending.entries()) {
        request.reject(error)
      }
      this.pending.clear()
    }
  }

  decode(frame: ImageBitmap | ImageData, formats: BarcodeFormat[]): Promise<WorkerDecodeResponse> {
    const id = ++this.requestId

    return new Promise<WorkerDecodeResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      const payload: DecodeRequest = {
        type: 'decode',
        id,
        frame,
        formats,
      }

      try {
        if (isImageBitmap(frame)) {
          this.worker.postMessage(payload, [frame])
        } else {
          this.worker.postMessage(payload)
        }
      } catch (error) {
        this.pending.delete(id)

        if (isImageBitmap(frame)) {
          frame.close()
        }

        reject(normalizeError(error, 'Unable to send frame to decoder worker.'))
      }
    })
  }

  destroy(): void {
    this.worker.terminate()

    for (const [, request] of this.pending.entries()) {
      request.reject(new Error('Decoder worker was terminated'))
    }
    this.pending.clear()
  }
}
