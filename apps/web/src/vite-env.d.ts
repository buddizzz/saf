/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** رابط الـ Worker الكامل في الإنتاج (مثل https://api.safapp.net). فارغ = بروكسي /api للتطوير. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

interface WakeLockSentinel extends EventTarget {
  released: boolean;
  release: () => Promise<void>;
}

interface WakeLock {
  request: (type: "screen") => Promise<WakeLockSentinel>;
}

interface Navigator {
  wakeLock?: WakeLock;
}
