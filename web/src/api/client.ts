/**
 * Backend integration stub. Point `VITE_API_BASE_URL` at the orchestration server when available.
 */
const base = import.meta.env.VITE_API_BASE_URL ?? ''

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${base}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text || res.statusText}`)
  }
  return res.json() as Promise<T>
}
