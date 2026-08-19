export const TRANSFORMERS_CACHE_KEY = 'transformers-cache'

export async function isModelCached(needle: string): Promise<boolean> {
  try {
    const cache = await caches.open(TRANSFORMERS_CACHE_KEY)
    const keys = await cache.keys()
    const n = needle.toLowerCase()
    return keys.some((r) => r.url.toLowerCase().includes(n))
  } catch {
    return false
  }
}

export async function deleteModelFromCache(needle: string): Promise<void> {
  try {
    const cache = await caches.open(TRANSFORMERS_CACHE_KEY)
    const keys = await cache.keys()
    const n = needle.toLowerCase()
    await Promise.all(
      keys.filter((r) => r.url.toLowerCase().includes(n)).map((r) => cache.delete(r)),
    )
  } catch {
    // Cache nicht verfügbar — ignorieren
  }
}
