/// <reference types="vite/client" />

interface ElectronAPI {
  openFolder: () => Promise<string | null>
  setSpineFolder: (folderPath: string | null) => Promise<void>
  getFolderForPath: (fileOrDirPath: string) => Promise<{ folderPath: string; jsonFileName: string | null }>
  getPathForFile: (file: File) => string
  readFile: (path: string) => Promise<string>
  readFileAsDataURL: (path: string) => Promise<string>
  listFiles: (dir: string) => Promise<string[]>
  getPendingOpenPath: () => Promise<string | null>
  onOpenWithPath: (callback: (path: string) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

