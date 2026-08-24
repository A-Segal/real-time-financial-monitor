export function apiBaseUrl(): string {
  if (
    typeof window !== 'undefined' &&
    window.__RUNTIME_CONFIG__?.apiUrl &&
    window.__RUNTIME_CONFIG__.apiUrl !== '$VITE_API_URL'
  ) {
    return window.__RUNTIME_CONFIG__.apiUrl
  }
  return import.meta.env.VITE_API_URL ?? ''
}
