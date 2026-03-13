import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Point } from 'pixi.js'
import { applySpineScale, getSpineFitScale } from './lib/pixi'
import { useSpineLoad } from './hooks/useSpineLoad'

export type SpineViewerLoadedMeta = {
  skins: string[]
  animations: string[]
  skeletonFiles?: string[]
  currentSkeletonFile?: string
}

export type SpineViewerHandle = {
  zoomIn: () => void
  zoomOut: () => void
  zoomFit: () => void
  zoomActual: () => void
}

export interface SpineViewerProps {
  folderPath: string | null
  animationName?: string
  skinName?: string
  isPlaying: boolean
  loop?: boolean
  showRulers?: boolean
  onLoaded?: (meta: SpineViewerLoadedMeta) => void
  onError?: (error: string) => void
  onDrop?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  initialSkeletonJson?: string | null
  className?: string
}

export const SpineViewer = React.forwardRef<SpineViewerHandle, SpineViewerProps>(function SpineViewer({
  folderPath,
  animationName,
  skinName,
  isPlaying,
  loop = false,
  showRulers = false,
  onLoaded,
  onError,
  onDrop,
  onDragOver,
  initialSkeletonJson,
  className
}: SpineViewerProps, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [manualScale, setManualScale] = useState<number | null>(null)
  const [hoverPoint, setHoverPoint] = useState<{ screenX: number; screenY: number; worldX: number; worldY: number } | null>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

  const {
    isLoading,
    error,
    appRef,
    spineRef,
    skeletonDataRef,
    currentAnimationRef
  } = useSpineLoad({
    containerRef,
    folderPath,
    initialSkeletonJson,
    skinName,
    animationName,
    isPlaying,
    loop,
    onLoaded,
    onError,
    onDrop,
    onDragOver
  })

  const clampScale = useCallback((scale: number) => Math.min(Math.max(scale, 0.05), 20), [])

  const getReferenceScale = useCallback(() => {
    const container = containerRef.current
    const spine = spineRef.current
    if (!container || !spine) return null
    const width = container.clientWidth
    const height = container.clientHeight
    if (width <= 0 || height <= 0) return null
    return manualScale ?? getSpineFitScale(spine, width, height)
  }, [manualScale, spineRef])

  const applyCurrentView = useCallback((overrideScale?: number | null) => {
    const container = containerRef.current
    if (!container) return
    const width = container.clientWidth
    const height = container.clientHeight
    setViewportSize({ width, height })

    const app = appRef.current
    const spine = spineRef.current
    if (!app || !spine?.parent) return

    try {
      app.renderer.resize(width, height)
      const scale = overrideScale === undefined
        ? (manualScale ?? getSpineFitScale(spine, width, height))
        : (overrideScale ?? getSpineFitScale(spine, width, height))
      applySpineScale(spine, width, height, scale)
    } catch { /* ignore */ }
  }, [manualScale, spineRef, appRef])

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const baseScale = getReferenceScale()
      if (baseScale == null) return
      setManualScale(clampScale(baseScale * 1.2))
    },
    zoomOut: () => {
      const baseScale = getReferenceScale()
      if (baseScale == null) return
      setManualScale(clampScale(baseScale / 1.2))
    },
    zoomFit: () => {
      setManualScale(null)
    },
    zoomActual: () => {
      setManualScale(1)
    }
  }), [clampScale, getReferenceScale])

  useEffect(() => {
    setManualScale(null)
  }, [folderPath, initialSkeletonJson])

  useEffect(() => {
    const spine = spineRef.current
    const anim = currentAnimationRef.current
    if (!spine || !anim) return
    try {
      spine.state.setAnimation(0, anim, loop)
      if (!isPlaying) spine.update(0)
    } catch { /* ignore */ }
  }, [isPlaying])

  useEffect(() => {
    const spine = spineRef.current
    const data = skeletonDataRef.current
    if (!spine || !data || !animationName) return
    try {
      if (data.animations.find((a) => a.name === animationName)) {
        currentAnimationRef.current = animationName
        spine.state.setAnimation(0, animationName, loop)
        spine.update(0)
      }
    } catch { /* ignore */ }
  }, [animationName])

  useEffect(() => {
    const spine = spineRef.current
    const data = skeletonDataRef.current
    if (!spine || !data || !skinName) return
    try {
      if (data.skins.find((s) => s.name === skinName)) {
        spine.skeleton.setSkinByName(skinName)
        spine.skeleton.setSlotsToSetupPose()
        spine.update(0)
      }
    } catch { /* ignore */ }
  }, [skinName])

  useEffect(() => {
    const spine = spineRef.current
    const anim = currentAnimationRef.current
    if (!spine || !anim || !isPlaying) return
    try {
      spine.state.setAnimation(0, anim, loop)
    } catch { /* ignore */ }
  }, [loop])

  useEffect(() => {
    const handleResize = () => {
      applyCurrentView()
    }
    const ro = new ResizeObserver(handleResize)
    if (containerRef.current) ro.observe(containerRef.current)
    handleResize()
    return () => ro.disconnect()
  }, [applyCurrentView])

  useEffect(() => {
    if (!isLoading) applyCurrentView()
  }, [applyCurrentView, isLoading, manualScale, skinName])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !showRulers) {
      setHoverPoint(null)
      return
    }

    const updateHover = (event: PointerEvent) => {
      const spine = spineRef.current
      const rect = container.getBoundingClientRect()
      const screenX = event.clientX - rect.left
      const screenY = event.clientY - rect.top
      if (!spine) {
        setHoverPoint({ screenX, screenY, worldX: 0, worldY: 0 })
        return
      }
      try {
        const local = spine.toLocal(new Point(screenX, screenY))
        setHoverPoint({
          screenX,
          screenY,
          worldX: local.x,
          worldY: local.y
})
      } catch {
        setHoverPoint({ screenX, screenY, worldX: 0, worldY: 0 })
      }
    }

    const clearHover = () => setHoverPoint(null)

    container.addEventListener('pointermove', updateHover)
    container.addEventListener('pointerleave', clearHover)
    return () => {
      container.removeEventListener('pointermove', updateHover)
      container.removeEventListener('pointerleave', clearHover)
    }
  }, [showRulers])

  const rulerTicks = useMemo(() => {
    if (!showRulers || viewportSize.width === 0 || viewportSize.height === 0) {
      return { xTicks: [] as Array<{ screen: number; world: number }>, yTicks: [] as Array<{ screen: number; world: number }> }
    }
    const spine = spineRef.current
    if (!spine) return { xTicks: [] as Array<{ screen: number; world: number }>, yTicks: [] as Array<{ screen: number; world: number }> }

    const xTicks: Array<{ screen: number; world: number }> = []
    const yTicks: Array<{ screen: number; world: number }> = []
    for (let screen = 0; screen <= viewportSize.width; screen += 100) {
      try {
        const local = spine.toLocal(new Point(screen, 0))
        xTicks.push({ screen, world: local.x })
      } catch { /* ignore */ }
    }
    for (let screen = 0; screen <= viewportSize.height; screen += 100) {
      try {
        const local = spine.toLocal(new Point(0, screen))
        yTicks.push({ screen, world: local.y })
      } catch { /* ignore */ }
    }
    return { xTicks, yTicks }
  }, [folderPath, hoverPoint, initialSkeletonJson, isLoading, showRulers, viewportSize.height, viewportSize.width])

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center text-red-400 ${className ?? ''}`}>
        <span className="text-sm">{error}</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`relative flex-1 min-h-0 ${className ?? ''}`}>
      {showRulers && (
        <>
          <div className="absolute left-6 right-0 top-0 h-6 bg-[#16162a]/90 border-b border-white/10 pointer-events-none z-10 overflow-hidden">
            {rulerTicks.xTicks.map((tick) => (
              <div key={`x-${tick.screen}`} className="absolute top-0 bottom-0" style={{ left: `${tick.screen}px` }}>
                <div className="w-px h-3 bg-white/30" />
                <div className="mt-0.5 -translate-x-1/2 text-[10px] leading-none text-white/60">
                  {Math.round(tick.world)}
                </div>
              </div>
            ))}
          </div>
          <div className="absolute left-0 top-6 bottom-0 w-6 bg-[#16162a]/90 border-r border-white/10 pointer-events-none z-10 overflow-hidden">
            {rulerTicks.yTicks.map((tick) => (
              <div key={`y-${tick.screen}`} className="absolute left-0 right-0" style={{ top: `${tick.screen}px` }}>
                <div className="h-px w-3 bg-white/30" />
                <div className="-translate-y-1/2 origin-top-left -rotate-90 text-[10px] leading-none text-white/60">
                  {Math.round(tick.world)}
                </div>
              </div>
            ))}
          </div>
          <div className="absolute left-0 top-0 h-6 w-6 bg-[#16162a] border-r border-b border-white/10 pointer-events-none z-10" />
          {hoverPoint && (
            <>
              <div className="absolute top-6 bottom-0 w-px bg-cyan-300/50 pointer-events-none z-10" style={{ left: `${hoverPoint.screenX}px` }} />
              <div className="absolute left-6 right-0 h-px bg-cyan-300/50 pointer-events-none z-10" style={{ top: `${hoverPoint.screenY}px` }} />
              <div className="absolute top-0 h-6 w-px bg-cyan-300/80 pointer-events-none z-10" style={{ left: `${hoverPoint.screenX}px` }} />
              <div className="absolute left-0 w-6 h-px bg-cyan-300/80 pointer-events-none z-10" style={{ top: `${hoverPoint.screenY}px` }} />
              <div
                className="absolute pointer-events-none z-20 rounded bg-black/75 px-2 py-1 text-[11px] text-cyan-100 border border-cyan-300/20"
                style={{
                  left: `${Math.min(hoverPoint.screenX + 12, Math.max(viewportSize.width - 110, 12))}px`,
                  top: `${Math.max(hoverPoint.screenY + 12, 28)}px`
                }}
              >
                {`x ${Math.round(hoverPoint.worldX)}, y ${Math.round(hoverPoint.worldY)}`}
              </div>
            </>
          )}
        </>
      )}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
})
