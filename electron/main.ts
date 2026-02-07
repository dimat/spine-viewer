import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import path from 'path'
import fs from 'fs/promises'

// Must run before app.ready so <img src="spine-asset://..."> works in the renderer
protocol.registerSchemesAsPrivileged([
  { scheme: 'spine-asset', privileges: { standard: true, supportFetchAPI: true } }
])

function getMainWindow(): BrowserWindow | null {
  return mainWindow ?? BrowserWindow.getFocusedWindow()
}

let mainWindow: BrowserWindow | null = null
let currentSpineFolder: string | null = null
let pendingOpenPath: string | null = null

function sendOpenWithPath(path: string) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('open-with-path', path)
  }
}

function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/preload.mjs')
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: 'Spine Viewer'
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC: set the current Spine folder so spine-asset:// can serve files from it
ipcMain.handle('set-spine-folder', (_event, folderPath: string | null) => {
  currentSpineFolder = folderPath
})

// IPC: return path passed via "Open with" or command line (consumed once)
ipcMain.handle('get-pending-open-path', () => {
  const path = pendingOpenPath
  pendingOpenPath = null
  return path ?? null
})

// IPC: open folder dialog
ipcMain.handle('open-folder', async () => {
  console.log('[Spine Viewer] open-folder IPC invoked')
  const win = getMainWindow()
  if (win) {
    win.focus()
    if (win.isMinimized()) win.restore()
  }
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile', 'openDirectory'],
    title: 'Select Spine animation folder or JSON file',
    filters: [
      { name: 'Spine JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})


// IPC: given a path (file or folder), return { folderPath, jsonFileName } so the viewer can open the specific file
ipcMain.handle('get-folder-for-path', async (_event, fileOrDirPath: string) => {
  const stat = await fs.stat(fileOrDirPath)
  const folderPath = stat.isDirectory() ? fileOrDirPath : path.dirname(fileOrDirPath)
  const jsonFileName =
    !stat.isDirectory() && fileOrDirPath.toLowerCase().endsWith('.json')
      ? path.basename(fileOrDirPath)
      : null
  return { folderPath, jsonFileName }
})

// IPC: read file as UTF-8 string
ipcMain.handle('read-file', async (_event, filePath: string) => {
  const content = await fs.readFile(filePath, 'utf-8')
  return content
})

// IPC: read file as data URL (for images)
ipcMain.handle('read-file-as-data-url', async (_event, filePath: string) => {
  const buffer = await fs.readFile(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mime =
    ext === '.png' ? 'image/png' :
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
    ext === '.webp' ? 'image/webp' :
    'application/octet-stream'
  const base64 = buffer.toString('base64')
  return `data:${mime};base64,${base64}`
})

// IPC: list files in directory recursively (relative paths from dir)
async function listFilesRecursive(dir: string, baseDir: string, acc: string[]): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const relativePath = path.relative(baseDir, fullPath)
    if (entry.isDirectory()) {
      await listFilesRecursive(fullPath, baseDir, acc)
    } else {
      acc.push(relativePath)
    }
  }
  return acc
}

ipcMain.handle('list-files', async (_event, dirPath: string) => {
  const files: string[] = []
  await listFilesRecursive(dirPath, dirPath, files)
  return files
})

// macOS: "Open with Spine Viewer" (must be before whenReady)
app.on('open-file', (event, path) => {
  event.preventDefault()
  pendingOpenPath = path
  sendOpenWithPath(path)
})

app.whenReady().then(async () => {
  // Windows/Linux: path can be passed as first argument
  if (process.platform !== 'darwin') {
    for (let i = 1; i < process.argv.length; i++) {
      const arg = process.argv[i]
      if (!arg.startsWith('-')) {
        try {
          const stat = await fs.stat(arg)
          if (stat.isFile() || stat.isDirectory()) {
            pendingOpenPath = arg
            break
          }
        } catch {
          // skip invalid paths
        }
      }
    }
  }

  // Serve images from the selected Spine folder (avoids data-URL size limits)
  protocol.handle('spine-asset', async (request) => {
    if (!currentSpineFolder) return new Response('No folder selected', { status: 404 })
    const pathname = request.url.replace(/^spine-asset:\/\/\/?/, '').replace(/^\/+/, '')
    const decoded = decodeURIComponent(pathname)
    const fullPath = path.normalize(path.join(currentSpineFolder, decoded))
    // Ensure we don't escape the folder (path traversal)
    const base = path.resolve(currentSpineFolder) + path.sep
    if (!fullPath.startsWith(base)) return new Response('Forbidden', { status: 403 })
    try {
      const buffer = await fs.readFile(fullPath)
      const ext = path.extname(fullPath).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'application/octet-stream'
      return new Response(buffer, {
        headers: {
          'Content-Type': mime,
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch (err) {
      console.error('[Spine Viewer] Failed to serve asset:', fullPath, err)
      return new Response('Not found', { status: 404 })
    }
  })
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
