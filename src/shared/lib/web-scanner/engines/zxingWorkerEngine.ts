import { applyRoiAndDownscale } from '../roi'
import type { ScannerEngine, ScannerEngineContext } from '../types'
import { WorkerClient } from '../worker/workerClient'

const supportsImageBitmapTransfer = (): boolean => {
  return typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined'
}

export const createZXingWorkerEngine = (): ScannerEngine => {
  const workerClient = new WorkerClient()
  let preferImageBitmap = supportsImageBitmapTransfer()

  return {
    kind: 'worker',
    async detect(ctx: ScannerEngineContext) {
      const decodeOnce = async () => {
        const frame = await applyRoiAndDownscale(ctx.videoEl, ctx.roi, ctx.maxWidth, preferImageBitmap)
        const response = await workerClient.decode(frame, ctx.formats)
        return response.result || null
      }

      try {
        return await decodeOnce()
      } catch (error) {
        console.log('error', error)
        if (
          preferImageBitmap &&
          error instanceof Error &&
          error.message.toLowerCase().includes('offscreencanvas')
        ) {
          preferImageBitmap = false
          return decodeOnce()
        }

        throw error
      }
    },
    destroy() {
      workerClient.destroy()
    },
  }
}
