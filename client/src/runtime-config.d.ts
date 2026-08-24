/// <reference types="vite/client" />

interface RuntimeConfig {
  apiUrl: string
}

interface Window {
  __RUNTIME_CONFIG__?: RuntimeConfig
}
