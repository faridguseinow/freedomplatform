import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { isLegacyPlacePhotoPath, isPlaceIconPath } from '../places/placeIcons'
import { supabase } from '../../lib/supabase/client'
import { toServerError } from '../../lib/errors/serverErrors'

const organizationAssetsBucket = 'organization-assets'
const signedUrlTtlSeconds = 60 * 60
const signedUrlStaleTimeMs = 50 * 60 * 1000

const isDirectImageUrl = (imagePath: string) =>
  /^(https?:|data:|blob:)/i.test(imagePath)

const normalizeStoragePath = (imagePath: string) =>
  imagePath
    .trim()
    .replace(/^\/+/, '')
    .replace(/^organization-assets\/+/, '')

export async function resolveCatalogImageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null

  if (isDirectImageUrl(imagePath)) {
    return imagePath
  }

  const storagePath = normalizeStoragePath(imagePath)
  if (!storagePath) return null

  const { data, error } = await supabase.storage
    .from(organizationAssetsBucket)
    .createSignedUrl(storagePath, signedUrlTtlSeconds)

  if (error) {
    throw toServerError(error)
  }

  return data.signedUrl
}

const imageUrlQueryKey = (imagePath: string | null | undefined) => ['catalog-image-url', imagePath] as const

export function useCatalogImageUrl(imagePath: string | null | undefined) {
  return useQuery({
    enabled: Boolean(imagePath),
    queryKey: imageUrlQueryKey(imagePath),
    queryFn: () => resolveCatalogImageUrl(imagePath),
    staleTime: signedUrlStaleTimeMs,
    // Ссылка живёт столько же, сколько свежая: при повторном открытии окна
    // используется та же ссылка, и браузер берёт картинку из своего кэша.
    gcTime: signedUrlStaleTimeMs,
  })
}

const SIGN_BATCH_SIZE = 100
const preloadedUrls = new Set<string>()

const preloadImage = (url: string) => {
  if (preloadedUrls.has(url)) return
  preloadedUrls.add(url)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
}

/**
 * Получает ссылки на все картинки каталога одним запросом и заранее
 * загружает их в фоне, чтобы при открытии заказа каталог появлялся сразу.
 */
export async function primeCatalogImageUrls(queryClient: QueryClient, imagePaths: Array<string | null | undefined>) {
  const now = Date.now()
  const pending = new Map<string, string>()

  for (const imagePath of imagePaths) {
    if (!imagePath || isPlaceIconPath(imagePath) || isLegacyPlacePhotoPath(imagePath)) continue
    const state = queryClient.getQueryState(imageUrlQueryKey(imagePath))
    const cachedUrl = queryClient.getQueryData<string | null>(imageUrlQueryKey(imagePath))
    if (cachedUrl && state && now - state.dataUpdatedAt < signedUrlStaleTimeMs) {
      preloadImage(cachedUrl)
      continue
    }
    if (isDirectImageUrl(imagePath)) {
      queryClient.setQueryData(imageUrlQueryKey(imagePath), imagePath)
      preloadImage(imagePath)
      continue
    }
    const storagePath = normalizeStoragePath(imagePath)
    if (storagePath) pending.set(storagePath, imagePath)
  }

  const storagePaths = [...pending.keys()]
  for (let index = 0; index < storagePaths.length; index += SIGN_BATCH_SIZE) {
    const batch = storagePaths.slice(index, index + SIGN_BATCH_SIZE)
    const { data, error } = await supabase.storage
      .from(organizationAssetsBucket)
      .createSignedUrls(batch, signedUrlTtlSeconds)
    if (error || !data) continue
    for (const entry of data) {
      const imagePath = entry.path ? pending.get(entry.path) : undefined
      if (!imagePath || !entry.signedUrl || entry.error) continue
      queryClient.setQueryData(imageUrlQueryKey(imagePath), entry.signedUrl)
      preloadImage(entry.signedUrl)
    }
  }
}

/** Фоновая подготовка картинок для списка (каталог товаров, услуг, комбо). */
export function usePrimeCatalogImages(imagePaths: Array<string | null | undefined>) {
  const queryClient = useQueryClient()
  const signature = imagePaths.filter(Boolean).join('|')

  useEffect(() => {
    if (!signature) return
    const paths = signature.split('|')
    const run = () => void primeCatalogImageUrls(queryClient, paths)
    // Не мешаем первой отрисовке: запускаем, когда браузер свободен.
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(run, { timeout: 1500 })
      return () => window.cancelIdleCallback(handle)
    }
    const timeoutId = globalThis.setTimeout(run, 300)
    return () => globalThis.clearTimeout(timeoutId)
  }, [queryClient, signature])
}
