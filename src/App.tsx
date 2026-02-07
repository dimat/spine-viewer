import { useState, useCallback, useEffect, Component, type ReactNode } from 'react'
import { SpineViewer } from './SpineViewer'

class ViewerErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }> {
  state = { hasError: false, error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

export default function App() {
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [folderName, setFolderName] = useState<string>('')
  const [initialSkeletonJson, setInitialSkeletonJson] = useState<string | null>(null)
  const [skeletonFiles, setSkeletonFiles] = useState<string[]>([])
  const [animations, setAnimations] = useState<string[]>([])
  const [skins, setSkins] = useState<string[]>([])
  const [selectedAnimation, setSelectedAnimation] = useState<string>('')
  const [selectedSkin, setSelectedSkin] = useState<string>('')
  const [isPlaying, setIsPlaying] = useState(true)
  const [loop, setLoop] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  const setFolder = useCallback((dirPath: string, jsonFileName: string | null = null) => {
    setFolderPath(dirPath)
    setFolderName(dirPath.split(/[/\\]/).filter(Boolean).pop() ?? dirPath)
    setInitialSkeletonJson(jsonFileName)
    setSkeletonFiles([])
    setAnimations([])
    setSkins([])
    setSelectedAnimation('')
    setSelectedSkin('')
  }, [])

  const handleOpenFolder = useCallback(async () => {
    setOpenError(null)
    if (typeof window.electronAPI?.openFolder !== 'function') {
      setOpenError('Electron API not available (preload may not have loaded)')
      return
    }
    try {
      const path = await window.electronAPI.openFolder()
      if (!path) return
      const { folderPath: dirPath, jsonFileName } = await window.electronAPI.getFolderForPath(path)
      setFolder(dirPath, jsonFileName)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setOpenError(msg)
      console.error('Open folder failed:', err)
    }
  }, [setFolder])

  const handleLoaded = useCallback((meta: { skins: string[]; animations: string[]; skeletonFiles?: string[]; currentSkeletonFile?: string }) => {
    if (meta.skeletonFiles?.length) setSkeletonFiles(meta.skeletonFiles)
    if (meta.currentSkeletonFile != null) setInitialSkeletonJson(meta.currentSkeletonFile)
    setAnimations(meta.animations)
    setSkins(meta.skins)
    setSelectedAnimation(meta.animations[0] ?? '')
    setSelectedSkin(meta.skins[0] ?? '')
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const item = e.dataTransfer.files[0]
    if (!item) return
    const path = (item as FileWithPath).path
    if (!path) return
    try {
      const { folderPath: dirPath, jsonFileName } = await window.electronAPI.getFolderForPath(path)
      setFolder(dirPath, jsonFileName)
    } catch (err) {
      console.error('Drop failed:', err)
    }
  }, [setFolder])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const openPathAsFolder = useCallback(
    async (fileOrDirPath: string) => {
      if (!window.electronAPI?.getFolderForPath) return
      try {
        const { folderPath: dirPath, jsonFileName } = await window.electronAPI.getFolderForPath(fileOrDirPath)
        setFolder(dirPath, jsonFileName)
      } catch (err) {
        console.error('Open path failed:', err)
      }
    },
    [setFolder]
  )

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.getPendingOpenPath || !api?.onOpenWithPath) return
    api.getPendingOpenPath().then((path) => {
      if (path) openPathAsFolder(path)
    })
    api.onOpenWithPath((p: string) => openPathAsFolder(p))
  }, [openPathAsFolder])

  return (
    <div
      className="flex flex-col h-screen bg-[#1a1a2e] text-white overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <header className="flex-shrink-0 flex items-center gap-3 px-3 py-2 bg-[#16162a] border-b border-white/10">
        <button
          type="button"
          onClick={handleOpenFolder}
          className="px-3 py-1.5 rounded bg-[#2d2d44] hover:bg-[#3d3d54] text-sm font-medium"
        >
          Open
        </button>
        <span className="text-gray-500 text-sm">|</span>
        {skeletonFiles.length > 0 && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">File</span>
              <select
                value={initialSkeletonJson ?? skeletonFiles[0] ?? ''}
                onChange={(e) => setInitialSkeletonJson(e.target.value || null)}
                className="bg-[#2d2d44] border border-white/10 rounded px-2 py-1 text-sm min-w-[140px] disabled:opacity-50"
              >
                {skeletonFiles.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <span className="text-gray-500 text-sm">|</span>
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">Animation</span>
          <select
            value={selectedAnimation}
            onChange={e => setSelectedAnimation(e.target.value)}
            disabled={animations.length === 0}
            className="bg-[#2d2d44] border border-white/10 rounded px-2 py-1 text-sm min-w-[120px] disabled:opacity-50"
          >
            {animations.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
            {animations.length === 0 && <option value="">—</option>}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">Skin</span>
          <select
            value={selectedSkin}
            onChange={e => setSelectedSkin(e.target.value)}
            disabled={skins.length === 0}
            className="bg-[#2d2d44] border border-white/10 rounded px-2 py-1 text-sm min-w-[120px] disabled:opacity-50"
          >
            {skins.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
            {skins.length === 0 && <option value="">—</option>}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setIsPlaying(p => !p)}
          className="px-3 py-1.5 rounded bg-[#2d2d44] hover:bg-[#3d3d54] text-sm font-medium"
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={loop}
            onChange={e => setLoop(e.target.checked)}
            className="rounded"
          />
          <span>Loop</span>
        </label>
        {folderName && (
          <span className="ml-auto text-gray-500 text-sm truncate max-w-[200px]" title={folderPath ?? ''}>
            {folderName}
          </span>
        )}
      </header>

      <main className="flex-1 min-h-0 flex flex-col">
        {openError && (
          <div className="flex-shrink-0 px-3 py-2 bg-red-900/50 text-red-200 text-sm">
            {openError}
          </div>
        )}
        {!folderPath ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
            <p>Open a folder or a Spine .json file (same folder as textures)</p>
            <p className="text-sm">or drag a folder or .json file here</p>
          </div>
        ) : (
          <ViewerErrorBoundary
            key={`${folderPath}:${initialSkeletonJson ?? ''}`}
            fallback={
              <div className="flex-1 flex flex-col items-center justify-center text-red-400 gap-2 p-4">
                <p className="text-sm">Viewer crashed. Try opening another folder.</p>
              </div>
            }
          >
            <SpineViewer
              folderPath={folderPath}
              initialSkeletonJson={initialSkeletonJson}
              animationName={selectedAnimation || undefined}
              skinName={selectedSkin || undefined}
              isPlaying={isPlaying}
              loop={loop}
              onLoaded={handleLoaded}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="flex-1"
            />
          </ViewerErrorBoundary>
        )}
      </main>
    </div>
  )
}
