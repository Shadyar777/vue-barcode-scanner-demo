import type { BarcodeFormat } from '../types'

export interface DedupeFilter {
  shouldEmit(format: BarcodeFormat, text: string): boolean
  reset(): void
  setTtl(ttlMs: number): void
}

export const createDedupeFilter = (ttlMs: number): DedupeFilter => {
  const lastSeen = new Map<string, number>()
  let ttl = Math.max(0, ttlMs)

  const sweep = (nowTs: number) => {
    for (const [key, ts] of lastSeen.entries()) {
      if (nowTs - ts > ttl * 2) {
        lastSeen.delete(key)
      }
    }
  }

  return {
    shouldEmit(format, text) {
      const nowTs = Date.now()
      sweep(nowTs)

      const key = `${format}:${text}`
      const lastTs = lastSeen.get(key)
      if (typeof lastTs === 'number' && nowTs - lastTs < ttl) {
        return false
      }

      lastSeen.set(key, nowTs)
      return true
    },
    reset() {
      lastSeen.clear()
    },
    setTtl(nextTtlMs) {
      ttl = Math.max(0, nextTtlMs)
      sweep(Date.now())
    },
  }
}
