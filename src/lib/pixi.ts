import type { Application } from 'pixi.js'
import type { Spine } from '@esotericsoftware/spine-pixi-v8'

export function getPixiOptions(width: number, height: number): Parameters<Application['init']>[0] {
  return {
    width,
    height,
    backgroundColor: 0x1a1a2e,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    antialias: true
  }
}

export function centerAndScaleSpine(spine: Spine, width: number, height: number): void {
  spine.scale.set(1)
  spine.x = 0
  spine.y = 0
  const bounds = spine.getBounds()
  const padding = 0.85
  const scaleX = (width * padding) / bounds.width
  const scaleY = (height * padding) / bounds.height
  const scale = Math.min(scaleX, scaleY)
  spine.scale.set(scale)
  const scaledWidth = bounds.width * scale
  const scaledHeight = bounds.height * scale
  const scaledBoundsX = bounds.x * scale
  const scaledBoundsY = bounds.y * scale
  spine.x = width / 2 - (scaledBoundsX + scaledWidth / 2)
  spine.y = height / 2 - (scaledBoundsY + scaledHeight / 2)
}
