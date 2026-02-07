/// <reference types="vite/client" />

interface ElectronAPI {
  openFolder: () => Promise<string | null>
  setSpineFolder: (folderPath: string | null) => Promise<void>
  getFolderForPath: (fileOrDirPath: string) => Promise<{ folderPath: string; jsonFileName: string | null }>
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

// Electron renderer: File from drag-and-drop has path
interface FileWithPath extends File {
  path?: string
}
