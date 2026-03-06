import { applyRoiAndDownscale } from '../roi'
import type { ScannerEngine, ScannerEngineContext } from '../types'
import { WorkerClient } from '../worker/workerClient'

const supportsImageBitmapTransfer = (): boolean => {
  return typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined'
}

export const createZXingWorkerEngine = (): ScannerEngine => {
  const workerClient = new WorkerClient()
  const preferImageBitmap = supportsImageBitmapTransfer()

  return {
    kind: 'worker',
    async detect(ctx: ScannerEngineContext) {
      const frame = await applyRoiAndDownscale(ctx.videoEl, ctx.roi, ctx.maxWidth, preferImageBitmap)
      const response = await workerClient.decode(frame, ctx.formats)
      return response.result || null
    },
    destroy() {
      workerClient.destroy()
    },
  }
}
