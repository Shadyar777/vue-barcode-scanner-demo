import type { PreferredCamera } from './types'
import { toCameraError } from './utils/errors'

const createVideoConstraints = (preferredCamera: PreferredCamera): MediaTrackConstraints => ({
  facingMode: preferredCamera === 'environment' ? { ideal: 'environment' } : { ideal: 'user' },
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 60 },
})

export const startCamera = async (preferredCamera: PreferredCamera): Promise<MediaStream> => {
  const mediaDevices = navigator.mediaDevices
  if (!mediaDevices?.getUserMedia) {
    throw new Error('API камеры недоступен в этом браузере.')
  }

  const initialConstraints: MediaStreamConstraints = {
    video: createVideoConstraints(preferredCamera),
    audio: false,
  }

  try {
    return await mediaDevices.getUserMedia(initialConstraints)
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      ((error as { name: string }).name === 'OverconstrainedError' ||
        (error as { name: string }).name === 'NotFoundError')
    ) {
      try {
        return await mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })
      } catch (fallbackError) {
        throw toCameraError(fallbackError)
      }
    }

    throw toCameraError(error)
  }
}

export const stopCamera = (stream: MediaStream | null): void => {
  if (!stream) {
    return
  }

  for (const track of stream.getTracks()) {
    track.stop()
  }
}

export const toggleTorch = async (stream: MediaStream | null, on: boolean): Promise<boolean> => {
  if (!stream) {
    return false
  }

  const [videoTrack] = stream.getVideoTracks()
  if (!videoTrack) {
    return false
  }

  const capabilities = videoTrack.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean }
  if (!capabilities?.torch) {
    return false
  }

  try {
    await videoTrack.applyConstraints({
      advanced: [{ torch: on } as MediaTrackConstraintSet],
    })
    return true
  } catch {
    return false
  }
}
