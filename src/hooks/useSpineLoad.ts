import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Application, Texture } from 'pixi.js'
import {
  Spine,
  AtlasAttachmentLoader,
  SkeletonJson,
  SkeletonData,
  TextureAtlas,
  SpineTexture
} from '@esotericsoftware/spine-pixi-v8'
import {
  type PackedAtlasJson,
  createAtlasFromPackedJson,
  addPackedPageToAtlas,
  addPlaceholderRegionsForMissing,
  createSyntheticAtlas
} from '../lib/atlas'
import { loadTextureFromDataUrl } from '../lib/texture'
import { joinPath } from '../lib/path'
import { getPixiOptions, centerAndScaleSpine } from '../lib/pixi'

const api = window.electronAPI

export type LoadedMeta = {
  skins: string[]
  animations: string[]
  skeletonFiles?: string[]
  currentSkeletonFile?: string
}

export type UseSpineLoadParams = {
  containerRef: React.RefObject<HTMLDivElement | null>
  folderPath: string | null
  initialSkeletonJson?: string | null
  skinName?: string
  animationName?: string
  isPlaying: boolean
  loop: boolean
  onLoaded?: (meta: LoadedMeta) => void
  onError?: (error: string) => void
  onDrop?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
}

export function useSpineLoad({
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
}: UseSpineLoadParams) {
  const loadIdRef = useRef(0)
  const appRef = useRef<Application | null>(null)
  const spineRef = useRef<Spine | null>(null)
  const skeletonDataRef = useRef<SkeletonData | null>(null)
  const currentAnimationRef = useRef<string | null>(null)
  const isPlayingRef = useRef(isPlaying)
  const loopRef = useRef(loop)
  const onLoadedRef = useRef(onLoaded)
  const onDropRef = useRef(onDrop)
  const onDragOverRef = useRef(onDragOver)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  onLoadedRef.current = onLoaded
  onDropRef.current = onDrop
  onDragOverRef.current = onDragOver
  isPlayingRef.current = isPlaying
  loopRef.current = loop

  const notifyLoaded = useCallback((meta: LoadedMeta) => {
    const cb = onLoadedRef.current
    if (cb) queueMicrotask(() => cb(meta))
  }, [])

  const loadFromFolder = useCallback(async () => {
    if (!folderPath || !containerRef.current) return
    const container = containerRef.current
    const myLoadId = loadIdRef.current

    const applyError = (err: unknown) => {
      if (loadIdRef.current !== myLoadId) return
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Failed to load animation')
      onError?.(msg || 'Failed to load animation')
      setIsLoading(false)
    }

    try {
      setIsLoading(true)
      setError(null)
      console.log('[SpineViewer] loadFromFolder start', { folderPath, myLoadId })

      const allFiles = await api.listFiles(folderPath)
      const lowerFiles = allFiles.map((f: string) => f.toLowerCase())

      let jsonPath: string | null = null
      let atlasPath: string | null = null
      const texturePaths: string[] = []
      const skeletonPaths: string[] = []

      for (let i = 0; i < allFiles.length; i++) {
        const p = allFiles[i]
        const low = lowerFiles[i]
        if (!low.endsWith('.json') || low.includes('package')) continue
        try {
          const content = await api.readFile(joinPath(folderPath, p))
          if (content.includes('"skeleton"') && content.includes('"bones"')) skeletonPaths.push(p)
        } catch { /* skip */ }
      }
      if (skeletonPaths.length === 0) throw new Error('No Spine skeleton JSON found in folder')

      const preferred = initialSkeletonJson?.trim()?.toLowerCase()
      if (preferred) {
        const found = skeletonPaths.find((fp) => (fp.split(/[/\\]/).pop() ?? '').toLowerCase() === preferred)
        if (found) jsonPath = found
      }
      if (!jsonPath) jsonPath = skeletonPaths[0]
      const currentSkeletonFile = jsonPath.split(/[/\\]/).pop() ?? jsonPath
      const skeletonFiles = skeletonPaths.map((fp) => fp.split(/[/\\]/).pop() ?? fp)

      const skeletonBase = jsonPath.replace(/\.(json)$/i, '').split(/[/\\]/).pop() ?? ''
      const skeletonBaseLower = skeletonBase.toLowerCase()
      let packedAtlasPath: string | null = null

      for (let i = 0; i < allFiles.length; i++) {
        const p = allFiles[i]
        const low = lowerFiles[i]
        if (low.endsWith('.atlas') || low.endsWith('.atlas.txt')) atlasPath = atlasPath ?? p
        else if (low.endsWith('.json') && !low.includes('package')) {
          try {
            const content = await api.readFile(joinPath(folderPath, p))
            const parsed = JSON.parse(content) as Record<string, unknown>
            if (parsed.frames && parsed.meta && typeof parsed.frames === 'object') {
              const nameLower = (p.split(/[/\\]/).pop() ?? '').replace(/\.json$/i, '').toLowerCase()
              const matchesSkeleton = nameLower === skeletonBaseLower || nameLower === 'atlas-' + skeletonBaseLower
              if (!packedAtlasPath || matchesSkeleton) packedAtlasPath = p
            }
          } catch { /* skip */ }
        } else if (low.endsWith('.png') || low.endsWith('.jpg') || low.endsWith('.jpeg') || low.endsWith('.webp')) {
          texturePaths.push(p)
        }
      }

      const jsonData = await api.readFile(joinPath(folderPath, jsonPath))
      let atlasData: string | null = null
      let packedAtlasJson: PackedAtlasJson | null = null
      if (atlasPath) atlasData = await api.readFile(joinPath(folderPath, atlasPath))
      if (packedAtlasPath) {
        const content = await api.readFile(joinPath(folderPath, packedAtlasPath))
        packedAtlasJson = JSON.parse(content)
      }

      try {
        const raw = JSON.parse(jsonData) as { skins?: Array<{ name?: string }>; animations?: Record<string, unknown> }
        const skinNames = (raw.skins || []).map((s) => s.name || '').filter(Boolean)
        const animNames = raw.animations && typeof raw.animations === 'object' && !Array.isArray(raw.animations)
          ? Object.keys(raw.animations)
          : []
        notifyLoaded({ skins: skinNames, animations: animNames })
      } catch { /* ignore */ }

      const pixiTextures = new Map<string, Texture>()
      const textureDimensions = new Map<string, { width: number; height: number }>()
      let packedAtlasTexture: Texture | null = null
      let packedAtlasSize = { w: 0, h: 0 }

      if (packedAtlasJson?.meta?.image) {
        const imageName = packedAtlasJson.meta.image
        const baseName = imageName.replace(/\.[^.]+$/, '')
        const fallbackNames = [imageName]
        if (/-[0-9]+$/.test(baseName)) fallbackNames.push(imageName.replace(/-[0-9]+(\.[^.]+)$/, '$1'))
        let packedImagePath: string | null = null
        for (const name of fallbackNames) {
          const nameLower = name.toLowerCase()
          packedImagePath = allFiles.find((f: string) => f === name || f.endsWith('/' + name) || f.endsWith('\\' + name) || f.toLowerCase() === nameLower || f.toLowerCase().endsWith('/' + nameLower) || f.toLowerCase().endsWith('\\' + nameLower)) ?? null
          if (packedImagePath) break
        }
        if (packedImagePath) {
          const dataUrl = await api.readFileAsDataURL(joinPath(folderPath, packedImagePath))
          const tex = await loadTextureFromDataUrl(dataUrl, packedImagePath)
          packedAtlasTexture = tex
          packedAtlasSize = packedAtlasJson.meta.size ?? { w: tex.width, h: tex.height }
        }
      }

      const relatedPacks: { json: PackedAtlasJson; texture: Texture; w: number; h: number }[] = []
      const relatedNames = (packedAtlasJson?.meta?.related_multi_packs as string[] | undefined) ?? []
      for (const relatedEntry of relatedNames) {
        const entryLower = relatedEntry.toLowerCase()
        let relatedJsonPath: string | null = allFiles.find(
          (f: string) => f === relatedEntry || f.endsWith('/' + relatedEntry) || f.endsWith('\\' + relatedEntry) || f.toLowerCase() === entryLower || f.toLowerCase().endsWith('/' + entryLower)
        ) ?? null
        if (!relatedJsonPath && relatedEntry.endsWith('.webp.json')) {
          const altName = relatedEntry.replace(/\.webp\.json$/i, '.json')
          relatedJsonPath = allFiles.find((f: string) => f === altName || f.endsWith('/' + altName) || f.endsWith('\\' + altName) || f.toLowerCase().endsWith(altName.toLowerCase())) ?? null
        }
        if (!relatedJsonPath) continue
        try {
          const content = await api.readFile(joinPath(folderPath, relatedJsonPath))
          const relatedJson = JSON.parse(content) as PackedAtlasJson
          if (!relatedJson.frames || !relatedJson.meta?.image) continue
          const imageName = relatedJson.meta.image
          const baseName = imageName.replace(/\.[^.]+$/, '')
          const fallbackNames = [imageName]
          if (/-[0-9]+$/.test(baseName)) fallbackNames.push(imageName.replace(/-[0-9]+(\.[^.]+)$/, '$1'))
          let relatedImagePath: string | null = null
          for (const name of fallbackNames) {
            const nameLower = name.toLowerCase()
            relatedImagePath = allFiles.find((f: string) => f === name || f.endsWith('/' + name) || f.endsWith('\\' + name) || f.toLowerCase() === nameLower || f.toLowerCase().endsWith('/' + nameLower)) ?? null
            if (relatedImagePath) break
          }
          if (!relatedImagePath) continue
          const dataUrl = await api.readFileAsDataURL(joinPath(folderPath, relatedImagePath))
          const tex = await loadTextureFromDataUrl(dataUrl, relatedImagePath)
          const size = relatedJson.meta.size ?? { w: tex.width, h: tex.height }
          relatedPacks.push({ json: relatedJson, texture: tex, w: size.w, h: size.h })
        } catch { /* skip */ }
      }

      if (atlasData) {
        const firstLine = atlasData.split('\n')[0]?.trim()
        const atlasTextureName = firstLine && !firstLine.startsWith(' ') ? firstLine : null
        if (atlasTextureName) {
          const atlasTexturePath = allFiles.find((f: string) => f === atlasTextureName || f.endsWith('/' + atlasTextureName) || f.endsWith('\\' + atlasTextureName))
          if (atlasTexturePath) {
            const dataUrl = await api.readFileAsDataURL(joinPath(folderPath, atlasTexturePath))
            const tex = await loadTextureFromDataUrl(dataUrl, atlasTexturePath)
            pixiTextures.set(atlasTexturePath, tex)
            textureDimensions.set(atlasTexturePath, { width: tex.width, height: tex.height })
          }
        }
      }

      if (!packedAtlasTexture) {
        for (const relPath of texturePaths) {
          const dataUrl = await api.readFileAsDataURL(joinPath(folderPath, relPath))
          const tex = await loadTextureFromDataUrl(dataUrl, relPath)
          pixiTextures.set(relPath, tex)
          const fileName = relPath.split(/[/\\]/).pop() || relPath
          if (fileName !== relPath) pixiTextures.set(fileName, tex)
          textureDimensions.set(relPath, { width: tex.width, height: tex.height })
        }
      }

      if (loadIdRef.current !== myLoadId) return

      const app = new Application()
      await app.init(getPixiOptions(container.clientWidth || 300, container.clientHeight || 300))
      if (loadIdRef.current !== myLoadId) {
        app.destroy()
        return
      }
      for (const el of Array.from(container.children)) {
        if (el instanceof HTMLCanvasElement) el.remove()
      }
      container.appendChild(app.canvas)
      appRef.current = app

      const canvas = app.canvas
      canvas.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
        onDragOverRef.current?.(e as unknown as React.DragEvent)
      })
      canvas.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onDropRef.current?.(e as unknown as React.DragEvent)
      })

      let atlas: TextureAtlas
      if (packedAtlasJson && packedAtlasTexture) {
        const w = packedAtlasSize.w || packedAtlasTexture.width
        const h = packedAtlasSize.h || packedAtlasTexture.height
        atlas = createAtlasFromPackedJson(packedAtlasJson, packedAtlasTexture, w, h)
        for (const r of relatedPacks) addPackedPageToAtlas(atlas, r.json, r.texture, r.w, r.h)
      } else if (atlasData && pixiTextures.size > 0) {
        atlas = new TextureAtlas(atlasData)
        for (const page of atlas.pages) {
          const textureName = page.name
          let pixiTexture = pixiTextures.get(textureName)
          if (!pixiTexture) pixiTexture = pixiTextures.get(textureName.split('/').pop() || textureName)
          if (!pixiTexture && pixiTextures.size > 0) pixiTexture = pixiTextures.values().next().value
          if (pixiTexture) page.setTexture(SpineTexture.from(pixiTexture.source))
        }
      } else {
        if (packedAtlasTexture && packedAtlasJson?.meta?.image) {
          pixiTextures.set(packedAtlasJson.meta.image, packedAtlasTexture)
          textureDimensions.set(packedAtlasJson.meta.image, { width: packedAtlasTexture.width, height: packedAtlasTexture.height })
        }
        atlas = createSyntheticAtlas(pixiTextures, textureDimensions, jsonData)
      }

      await addPlaceholderRegionsForMissing(atlas, jsonData)
      if (loadIdRef.current !== myLoadId) {
        app.destroy()
        return
      }

      const atlasLoader = new AtlasAttachmentLoader(atlas)
      const skeletonJson = new SkeletonJson(atlasLoader)
      const skeletonData: SkeletonData = skeletonJson.readSkeletonData(JSON.parse(jsonData))
      skeletonDataRef.current = skeletonData

      const skins = skeletonData.skins.map((s) => s.name)
      const animations = skeletonData.animations.map((a) => a.name)
      notifyLoaded({ skins, animations, skeletonFiles, currentSkeletonFile })

      const spine = new Spine({ skeletonData, autoUpdate: false })
      app.stage.addChild(spine)
      centerAndScaleSpine(spine, app.screen.width, app.screen.height)
      spineRef.current = spine

      const skinToUse = skinName && skeletonData.skins.find((s) => s.name === skinName)
        ? skinName
        : (skeletonData.defaultSkin?.name ?? skeletonData.skins[0]?.name ?? '')
      if (skinToUse) {
        spine.skeleton.setSkinByName(skinToUse)
        spine.skeleton.setSlotsToSetupPose()
      }

      const targetAnim = animationName && skeletonData.animations.find((a) => a.name === animationName)
        ? animationName
        : skeletonData.animations[0]?.name
      if (targetAnim) {
        currentAnimationRef.current = targetAnim
        spine.state.setAnimation(0, targetAnim, loopRef.current)
        spine.update(0)
      }

      app.ticker.add((ticker) => {
        try {
          const s = spineRef.current
          if (s && isPlayingRef.current) s.update(ticker.deltaMS / 1000)
        } catch { /* ignore */ }
      })

      if (loadIdRef.current !== myLoadId) {
        app.destroy()
        return
      }
      setIsLoading(false)
    } catch (err) {
      console.error('[SpineViewer] load failed', err)
      applyError(err)
    }
  }, [folderPath, initialSkeletonJson, skinName, animationName, notifyLoaded, onError])

  useEffect(() => {
    setError(null)
    setIsLoading(true)
  }, [folderPath])

  useEffect(() => {
    loadIdRef.current = loadIdRef.current + 1
    const rafId = requestAnimationFrame(() => loadFromFolder())
    return () => {
      cancelAnimationFrame(rafId)
      loadIdRef.current = loadIdRef.current + 1
      spineRef.current = null
      skeletonDataRef.current = null
      currentAnimationRef.current = null
      if (appRef.current) {
        try {
          appRef.current.destroy(true)
        } catch { /* ignore */ }
        appRef.current = null
      }
    }
  }, [loadFromFolder])

  return {
    isLoading,
    error,
    appRef,
    spineRef,
    skeletonDataRef,
    currentAnimationRef
  }
}
