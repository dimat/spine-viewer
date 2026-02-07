import React, { useEffect, useRef } from 'react'
import { centerAndScaleSpine } from './lib/pixi'
import { useSpineLoad } from './hooks/useSpineLoad'

export type SpineViewerLoadedMeta = {
  skins: string[]
  animations: string[]
  skeletonFiles?: string[]
  currentSkeletonFile?: string
}

export interface SpineViewerProps {
  folderPath: string | null
  animationName?: string
  skinName?: string
  isPlaying: boolean
  loop?: boolean
  onLoaded?: (meta: SpineViewerLoadedMeta) => void
  onError?: (error: string) => void
  onDrop?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  initialSkeletonJson?: string | null
  className?: string
}

export function SpineViewer({
  folderPath,
  animationName,
  skinName,
  isPlaying,
  loop = false,
  onLoaded,
  onError,
  onDrop,
  onDragOver,
  initialSkeletonJson,
  className
}: SpineViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

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
      const app = appRef.current
      const container = containerRef.current
      const spine = spineRef.current
      if (!app || !container || !spine?.parent) return
      try {
        const w = container.clientWidth
        const h = container.clientHeight
        app.renderer.resize(w, h)
        centerAndScaleSpine(spine, w, h)
      } catch { /* ignore */ }
    }
    const ro = new ResizeObserver(handleResize)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center text-red-400 ${className ?? ''}`}>
        <span className="text-sm">{error}</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`relative flex-1 min-h-0 ${className ?? ''}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
