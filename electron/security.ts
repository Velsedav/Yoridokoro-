const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * External links leave Yoridokoro and are opened by the operating system.
 * Keeping this validation in the main process means a renderer bug cannot
 * invoke file:, javascript: or another privileged protocol.
 */
export function normalizeExternalUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null
  const candidate = rawUrl.trim()
  if (!candidate || candidate.length > 4096) return null

  try {
    const url = new URL(candidate)
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)) return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

const PRIVATE_IPV4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
]

/** Remote images are fetched in the main process so the renderer is not at
 * the mercy of CORS. Local/network addresses remain off limits. */
export function normalizeRemoteImageUrl(rawUrl: unknown): string | null {
  const normalized = normalizeExternalUrl(rawUrl)
  if (!normalized) return null
  const url = new URL(normalized)
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null
  if (host === '::1' || host === '::' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return null
  if (PRIVATE_IPV4.some(pattern => pattern.test(host))) return null
  return url.toString()
}
