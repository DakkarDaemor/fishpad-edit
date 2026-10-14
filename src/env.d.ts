/// <reference types="vite-plugin-pwa/client" />
/// <reference types="wicg-file-system-access" />

/** Versione MAJOR.MINOR, iniettata da vite.config.ts */
declare const __APP_VERSION__: string

// Launch Handler API (file aperti dal sistema operativo con "Apri con…")
interface LaunchParams {
  readonly files: readonly FileSystemHandle[]
  readonly targetURL?: string
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void
}
interface Window {
  readonly launchQueue?: LaunchQueue
}

// Rinomina sul posto (Chromium), non ancora nei tipi
interface FileSystemHandle {
  move?(newName: string): Promise<void>
}

interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>
}
