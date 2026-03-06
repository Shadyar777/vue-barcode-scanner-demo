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
    return new Error('Доступ к камере запрещён. Разрешите доступ в браузере и нажмите «Старт» ещё раз.')
  }

  if (hasName(error, 'NotReadableError') || hasName(error, 'TrackStartError')) {
    return new Error('Камера занята. Закройте другие вкладки/приложения, использующие камеру, и попробуйте снова.')
  }

  if (hasName(error, 'NotFoundError') || hasName(error, 'OverconstrainedError')) {
    return new Error('Запрошенная камера не найдена на устройстве.')
  }

  if (hasName(error, 'AbortError')) {
    return new Error('Запуск камеры был прерван. Попробуйте снова.')
  }

  return new Error(messageFromError(error) || 'Не удалось получить доступ к камере.')
}

export const toPlaybackError = (error: unknown): Error => {
  if (hasName(error, 'NotAllowedError')) {
    return new Error(
      'Видео-превью не запустилось. В iOS Safari нажмите «Старт» вручную и не сворачивайте страницу.'
    )
  }

  return new Error(messageFromError(error) || 'Не удалось запустить видео-превью.')
}

export const normalizeError = (error: unknown, fallbackMessage: string): Error => {
  return new Error(messageFromError(error) || fallbackMessage)
}
