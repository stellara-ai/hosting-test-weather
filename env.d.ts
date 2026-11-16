/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_LABEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
