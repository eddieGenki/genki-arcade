// Injected at build time by vite.config.ts via `define`. ISO timestamp of
// when this bundle was built — surfaces on the idle screen for verification.
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  /** Vercel shared-analytics URL — destination of the Konami chord. */
  readonly VITE_ANALYTICS_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
