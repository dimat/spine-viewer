import { Texture, ImageSource } from 'pixi.js'

export async function loadTextureFromDataUrl(dataUrl: string, forPath?: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = async () => {
      try {
        if (img.decode) try { await img.decode() } catch { /* ignore */ }
        const source = new ImageSource({ resource: img })
        const texture = new Texture({ source })
        resolve(texture)
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => reject(new Error(forPath ? `Failed to load image: ${forPath}` : 'Failed to load image'))
    img.src = dataUrl
  })
}
