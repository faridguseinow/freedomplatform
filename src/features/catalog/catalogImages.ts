import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'

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
    throw new Error(error.message)
  }

  return data.signedUrl
}

export function useCatalogImageUrl(imagePath: string | null | undefined) {
  return useQuery({
    enabled: Boolean(imagePath),
    queryKey: ['catalog-image-url', imagePath],
    queryFn: () => resolveCatalogImageUrl(imagePath),
    staleTime: signedUrlStaleTimeMs,
  })
}
