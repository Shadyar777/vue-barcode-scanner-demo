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
  timeoutId: ReturnType<typeof setTimeout>
}

const isImageBitmap = (value: unknown): value is ImageBitmap => {
  return typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap
}

export class WorkerClient {
  private readonly worker: Worker
  private requestId = 0
  private readonly pending = new Map<number, PendingRequest>()
  private readonly decodeTimeoutMs = 2500
  private fatalError: Error | null = null
  private destroyed = false

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
      clearTimeout(request.timeoutId)

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
      this.handleFatalError(new Error(event.message || 'Worker декодера аварийно завершился'))
    }

    this.worker.onmessageerror = () => {
      this.handleFatalError(new Error('Ошибка передачи сообщения в Worker декодера'))
    }
  }

  decode(frame: ImageBitmap | ImageData, formats: BarcodeFormat[]): Promise<WorkerDecodeResponse> {
    if (this.destroyed) {
      return Promise.reject(new Error('Worker декодера уже уничтожен'))
    }

    if (this.fatalError) {
      return Promise.reject(this.fatalError)
    }

    const id = ++this.requestId

    return new Promise<WorkerDecodeResponse>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const request = this.pending.get(id)
        if (!request) {
          return
        }

        this.pending.delete(id)
        request.reject(new Error(`Таймаут ответа Worker декодера (${this.decodeTimeoutMs} мс)`))
      }, this.decodeTimeoutMs)

      this.pending.set(id, { resolve, reject, timeoutId })

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
        clearTimeout(timeoutId)

        if (isImageBitmap(frame)) {
          frame.close()
        }

        reject(normalizeError(error, 'Не удалось отправить кадр в Worker декодера.'))
      }
    })
  }

  destroy(): void {
    this.destroyed = true
    this.worker.terminate()

    this.rejectAllPending(new Error('Worker декодера остановлен'))
  }

  private handleFatalError(error: Error): void {
    this.fatalError = error
    this.rejectAllPending(error)
  }

  private rejectAllPending(error: Error): void {
    for (const [, request] of this.pending.entries()) {
      clearTimeout(request.timeoutId)
      request.reject(error)
    }
    this.pending.clear()
  }
}
