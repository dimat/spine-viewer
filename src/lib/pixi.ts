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

export function getSpineFitScale(spine: Spine, width: number, height: number): number {
  spine.scale.set(1)
  spine.x = 0
  spine.y = 0
  const bounds = spine.getBounds()
  const padding = 0.85
  const scaleX = (width * padding) / bounds.width
  const scaleY = (height * padding) / bounds.height
  return Math.min(scaleX, scaleY)
}

export function applySpineScale(spine: Spine, width: number, height: number, scale: number): void {
  spine.scale.set(scale)
  spine.x = 0
  spine.y = 0
  const bounds = spine.getBounds()
  spine.x = width / 2 - (bounds.x + bounds.width / 2)
  spine.y = height / 2 - (bounds.y + bounds.height / 2)
}

export function centerAndScaleSpine(spine: Spine, width: number, height: number): void {
  const scale = getSpineFitScale(spine, width, height)
  applySpineScale(spine, width, height, scale)
}
