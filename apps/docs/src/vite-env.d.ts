/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API the Run console sends to. Absent in dev → the local server. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Vite serves an imported asset as a URL string. */
declare module '*.svg' {
  const src: string
  export default src
}
