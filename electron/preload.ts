import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: () => ipcRenderer.invoke('open-folder'),
  setSpineFolder: (folderPath: string | null) => ipcRenderer.invoke('set-spine-folder', folderPath),
  getFolderForPath: (fileOrDirPath: string) => ipcRenderer.invoke('get-folder-for-path', fileOrDirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  readFileAsDataURL: (filePath: string) => ipcRenderer.invoke('read-file-as-data-url', filePath),
  listFiles: (dirPath: string) => ipcRenderer.invoke('list-files', dirPath),
  getPendingOpenPath: () => ipcRenderer.invoke('get-pending-open-path') as Promise<string | null>,
  onOpenWithPath: (callback: (path: string) => void) => {
    ipcRenderer.on('open-with-path', (_event, path: string) => callback(path))
  }
})
