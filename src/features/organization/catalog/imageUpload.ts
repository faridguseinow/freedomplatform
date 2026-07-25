import { supabase } from '../../../lib/supabase/client'

const maxSourceBytes = 5 * 1024 * 1024
const maxSide = 1200
const webpQuality = 0.8

export type CatalogAssetKind = 'categories' | 'places' | 'products' | 'services' | 'combos'

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось прочитать изображение.'))
    }
    image.src = url
  })

export async function compressImageToWebp(file: File) {
  if (file.size > maxSourceBytes) {
    throw new Error('Размер изображения не должен превышать 5 MB.')
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Выберите файл изображения.')
  }

  const image = await loadImage(file)
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Браузер не поддерживает обработку изображений.')
  }

  context.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', webpQuality)
  })

  if (!blob) {
    throw new Error('Браузер не смог создать WebP изображение.')
  }

  return blob
}

export async function uploadCatalogImage({
  file,
  itemId,
  kind,
  organizationId,
}: {
  file: File
  itemId: string
  kind: CatalogAssetKind
  organizationId: string
}) {
  const blob = await compressImageToWebp(file)
  const path = `organizations/${organizationId}/${kind}/${itemId}/main.webp`
  const { error } = await supabase.storage
    .from('organization-assets')
    .upload(path, blob, {
      contentType: 'image/webp',
      upsert: true,
    })

  if (error) {
    throw new Error(error.message)
  }

  return path
}
