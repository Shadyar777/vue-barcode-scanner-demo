const messageFromError = (error: unknown): string | null => {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return null
}

const hasName = (error: unknown, name: string): boolean => {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name: string }).name === name
}

export const toCameraError = (error: unknown): Error => {
  if (hasName(error, 'NotAllowedError') || hasName(error, 'SecurityError')) {
    return new Error('Camera permission denied. Allow camera access in browser settings and tap Start again.')
  }

  if (hasName(error, 'NotReadableError') || hasName(error, 'TrackStartError')) {
    return new Error('Camera is busy. Close other tabs/apps using the camera and try again.')
  }

  if (hasName(error, 'NotFoundError') || hasName(error, 'OverconstrainedError')) {
    return new Error('Requested camera was not found on this device.')
  }

  if (hasName(error, 'AbortError')) {
    return new Error('Camera startup was interrupted. Try again.')
  }

  return new Error(messageFromError(error) || 'Unable to access camera.')
}

export const toPlaybackError = (error: unknown): Error => {
  if (hasName(error, 'NotAllowedError')) {
    return new Error(
      'Video preview did not start. On iOS Safari tap Start from a user gesture and keep the page active.'
    )
  }

  return new Error(messageFromError(error) || 'Unable to start video preview.')
}

export const normalizeError = (error: unknown, fallbackMessage: string): Error => {
  return new Error(messageFromError(error) || fallbackMessage)
}
