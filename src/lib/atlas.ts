import type { Texture } from 'pixi.js'
import {
  SpineTexture,
  TextureAtlas,
  TextureAtlasPage,
  TextureAtlasRegion
} from '@esotericsoftware/spine-pixi-v8'
import { loadTextureFromDataUrl } from './texture'

export type PackedAtlasJson = {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number }; rotated?: boolean }>
  meta: { image?: string; size?: { w: number; h: number }; related_multi_packs?: string[] }
}

/** Collect all region names the skeleton may request: attachment names, paths, sequence frame names, and skin-prefixed variants. */
export function collectSkeletonRegionNames(skeleton: Record<string, unknown>): Set<string> {
  const names = new Set<string>()
  const skins = skeleton.skins as Array<Record<string, unknown>> | undefined
  if (!skins) return names
  for (const skin of skins) {
    const skinName = (skin.name as string) || 'default'
    const attachments = skin.attachments as Record<string, Record<string, Record<string, unknown>>> | undefined
    if (!attachments) continue
    for (const slotName in attachments) {
      for (const attachmentName in attachments[slotName]) {
        const att = attachments[slotName][attachmentName]
        const add = (n: string) => {
          names.add(n)
          names.add(skinName + '/' + n)
        }
        add(attachmentName)
        if (att.path) add(String(att.path))
        if (att.name) add(String(att.name))
        const seq = att.sequence as { count?: number; digits?: number; start?: number } | undefined
        if (seq && typeof seq.count === 'number') {
          const digits = typeof seq.digits === 'number' ? seq.digits : 4
          const start = typeof seq.start === 'number' ? seq.start : 0
          const base = attachmentName.replace(/\d+$/, '')
          for (let i = 0; i < seq.count; i++) {
            const frame = String(start + i).padStart(digits, '0')
            const frameName = base + frame
            add(frameName)
          }
        }
      }
    }
  }
  return names
}

/** TexturePacker / Phaser / Pixi Asset Pack: one page from packed JSON + texture. */
export function createAtlasFromPackedJson(
  packedJson: PackedAtlasJson,
  texture: Texture,
  pageWidth: number,
  pageHeight: number
): TextureAtlas {
  const atlas = new TextureAtlas('')
  addPackedPageToAtlas(atlas, packedJson, texture, pageWidth, pageHeight)
  return atlas
}

/** Append one packed JSON page to an existing atlas (for related_multi_packs). */
export function addPackedPageToAtlas(
  atlas: TextureAtlas,
  packedJson: PackedAtlasJson,
  texture: Texture,
  pageWidth: number,
  pageHeight: number
): void {
  const page = new TextureAtlasPage(packedJson.meta?.image ?? '')
  page.width = pageWidth
  page.height = pageHeight
  page.setTexture(SpineTexture.from(texture.source))
  atlas.pages.push(page)
  const spineTexture = SpineTexture.from(texture.source)
  for (const [name, entry] of Object.entries(packedJson.frames)) {
    const { frame, rotated } = entry
    const w = frame.w
    const h = frame.h
    const u = frame.x / pageWidth
    const v = frame.y / pageHeight
    const u2 = (frame.x + w) / pageWidth
    const v2 = (frame.y + h) / pageHeight
    const region = new TextureAtlasRegion(page, name)
    region.x = frame.x
    region.y = frame.y
    region.width = w
    region.height = h
    region.originalWidth = entry.frame.w
    region.originalHeight = entry.frame.h
    region.offsetX = 0
    region.offsetY = 0
    region.degrees = rotated ? 90 : 0
    region.u = u
    region.v = v
    region.u2 = u2
    region.v2 = v2
    region.texture = spineTexture
    atlas.regions.push(region)
    page.regions.push(region)
  }
}

/** Add placeholder regions for skeleton attachment names not present in the atlas so the loader does not throw. */
export async function addPlaceholderRegionsForMissing(atlas: TextureAtlas, jsonData: string): Promise<void> {
  const skeleton = JSON.parse(jsonData) as Record<string, unknown>
  const wanted = collectSkeletonRegionNames(skeleton)
  const existing = new Set(atlas.regions.map((r) => r.name))
  const missing = [...wanted].filter((n) => !existing.has(n))
  if (missing.length === 0) return
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#ff00ff'
    ctx.fillRect(0, 0, size, size)
  }
  const dataUrl = canvas.toDataURL('image/png')
  const texture = await loadTextureFromDataUrl(dataUrl, 'placeholder')
  const page = new TextureAtlasPage('placeholder')
  page.width = size
  page.height = size
  page.setTexture(SpineTexture.from(texture.source))
  atlas.pages.push(page)
  const spineTexture = SpineTexture.from(texture.source)
  for (const name of missing) {
    const region = new TextureAtlasRegion(page, name)
    region.x = 0
    region.y = 0
    region.width = size
    region.height = size
    region.originalWidth = size
    region.originalHeight = size
    region.offsetX = 0
    region.offsetY = 0
    region.degrees = 0
    region.u = 0
    region.v = 0
    region.u2 = 1
    region.v2 = 1
    region.texture = spineTexture
    atlas.regions.push(region)
    page.regions.push(region)
  }
  console.log('[SpineViewer] added placeholder regions for missing', missing.length, missing.slice(0, 5).join(', ') + (missing.length > 5 ? '...' : ''))
}

/** Build a Spine TextureAtlas from loose textures + skeleton JSON (synthetic regions). */
export function createSyntheticAtlas(
  pixiTextures: Map<string, Texture>,
  textureDimensions: Map<string, { width: number; height: number }>,
  jsonData: string
): TextureAtlas {
  const skeleton = JSON.parse(jsonData) as Record<string, unknown>
  const skeletonRegionNames = collectSkeletonRegionNames(skeleton)
  const atlas = new TextureAtlas('')
  const createRegion = (
    page: TextureAtlasPage,
    regionName: string,
    dims: { width: number; height: number },
    spineTexture: SpineTexture
  ) => {
    const region = new TextureAtlasRegion(page, regionName)
    region.x = 0
    region.y = 0
    region.width = dims.width
    region.height = dims.height
    region.originalWidth = dims.width
    region.originalHeight = dims.height
    region.offsetX = 0
    region.offsetY = 0
    region.degrees = 0
    region.u = 0
    region.v = 0
    region.u2 = 1
    region.v2 = 1
    region.texture = spineTexture
    atlas.regions.push(region)
    page.regions.push(region)
    return region
  }
  const createdRegions = new Set<string>()
  for (const [texturePath, texture] of pixiTextures) {
    const dims = textureDimensions.get(texturePath) || { width: texture.width, height: texture.height }
    const pathWithoutExt = texturePath.replace(/\.(png|jpg|jpeg|webp)$/i, '')
    const fileName = texturePath.split(/[/\\]/).pop() || texturePath
    const fileNameWithoutExt = fileName.replace(/\.(png|jpg|jpeg|webp)$/i, '')
    const page = new TextureAtlasPage(texturePath)
    page.width = dims.width
    page.height = dims.height
    page.setTexture(SpineTexture.from(texture.source))
    atlas.pages.push(page)
    const spineTexture = SpineTexture.from(texture.source)
    const regionNames = new Set<string>([
      pathWithoutExt,
      fileNameWithoutExt,
      pathWithoutExt.toLowerCase(),
      fileNameWithoutExt.toLowerCase()
    ])
    const prefixes = ['Textures/', 'textures/', 'images/', 'Images/', '']
    for (const prefix of prefixes) {
      regionNames.add(prefix + fileNameWithoutExt)
      regionNames.add(prefix + pathWithoutExt)
    }
    for (const name of skeletonRegionNames) {
      const lastSegment = name.split(/[/\\]/).pop() || ''
      if (
        name === fileNameWithoutExt ||
        name === pathWithoutExt ||
        lastSegment === fileNameWithoutExt ||
        name.endsWith('/' + fileNameWithoutExt) ||
        name.endsWith('\\' + fileNameWithoutExt) ||
        name.endsWith('_' + fileNameWithoutExt)
      ) {
        regionNames.add(name)
      }
    }
    for (const regionName of regionNames) {
      if (!createdRegions.has(regionName)) {
        createRegion(page, regionName, dims, spineTexture)
        createdRegions.add(regionName)
      }
    }
  }
  return atlas
}
