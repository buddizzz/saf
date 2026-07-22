/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

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
