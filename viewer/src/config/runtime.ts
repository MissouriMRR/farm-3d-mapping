/**
 * Settings read at page load from `config.json` beside index.html, so a deployment can set them
 * without rebuilding. The file is optional; see deploy/DEPLOY.md.
 */
export interface RuntimeConfig {
  /** Cesium ion access token for world terrain and satellite imagery. */
  cesiumIonToken?: string
}

export async function loadRuntimeConfig(signal: AbortSignal): Promise<RuntimeConfig> {
  try {
    const response = await fetch('config.json', { signal, cache: 'no-cache' })
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !type.includes('json')) return {}
    return (await response.json()) as RuntimeConfig
  } catch {
    return {}
  }
}

/** Phones and tablets: lighter detail levels, and the mesh opens before the heavier splat. */
export const isHandheld = () =>
  typeof matchMedia === 'function' && matchMedia('(max-width: 720px), (pointer: coarse)').matches
