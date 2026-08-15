import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { resolveCatalogImageUrl } from '../../features/catalog/catalogImages'
import { useAuth } from '../../hooks/useAuth'
import { USER_ROLES } from '../../types/roles'

const defaultThemeColor = '#047857'
const defaultBackgroundColor = '#f8fafc'
const freedomIcon = '/pwa/freedom-platform-512.png'
const freedomAppleIcon = '/pwa/freedom-platform-180.png'
const organizationFallbackIcon = '/pwa/the-league.svg'

type PwaConfig = {
  name: string
  shortName: string
  description: string
  startUrl: string
  scope: string
  iconUrl: string
  appleIconUrl?: string
  staticManifestUrl?: string
}

function upsertMeta(name: string, content: string, attribute: 'name' | 'property' = 'name') {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`)

  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute(attribute, name)
    document.head.append(meta)
  }

  meta.content = content
}

function upsertLink(rel: string, href: string, type?: string) {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)

  if (!link) {
    link = document.createElement('link')
    link.rel = rel
    document.head.append(link)
  }

  link.href = href
  if (type) link.type = type
}

function toAbsoluteUrl(value: string) {
  return new URL(value, window.location.origin).toString()
}

function buildManifest(config: PwaConfig) {
  return {
    name: config.name,
    short_name: config.shortName,
    description: config.description,
    id: toAbsoluteUrl(config.startUrl),
    start_url: toAbsoluteUrl(config.startUrl),
    scope: toAbsoluteUrl(config.scope),
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    orientation: 'portrait',
    theme_color: defaultThemeColor,
    background_color: defaultBackgroundColor,
    categories: ['business', 'productivity'],
    icons: [
      {
        src: toAbsoluteUrl(config.iconUrl),
        sizes: config.iconUrl.endsWith('.svg') ? 'any' : '512x512',
        type: config.iconUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
        purpose: 'any maskable',
      },
    ],
  }
}

function getDocumentTitle(config: PwaConfig) {
  return `${config.name} | Freedom Platform`
}

export function PwaManager() {
  const { currentOrganization, role } = useAuth()
  const organizationLogo = useQuery({
    enabled: role === USER_ROLES.organizationAdmin && Boolean(currentOrganization?.logo_path),
    queryKey: ['pwa-organization-logo', currentOrganization?.logo_path],
    queryFn: () => resolveCatalogImageUrl(currentOrganization?.logo_path),
    staleTime: 50 * 60 * 1000,
  })

  const config = useMemo<PwaConfig>(() => {
    if (role === USER_ROLES.organizationAdmin && currentOrganization) {
      const organizationName = currentOrganization.name || 'The League'

      return {
        name: organizationName,
        shortName: organizationName.length > 12 ? organizationName.slice(0, 12) : organizationName,
        description: `${organizationName} admin workspace`,
        startUrl: `/${currentOrganization.slug}/admin`,
        scope: `/${currentOrganization.slug}/`,
        iconUrl: organizationLogo.data ?? organizationFallbackIcon,
      }
    }

    return {
      name: 'Freedom Platform',
      shortName: 'Freedom',
      description: 'Freedom Platform owner workspace',
      startUrl: '/platform',
      scope: '/',
      iconUrl: freedomIcon,
      appleIconUrl: freedomAppleIcon,
      staticManifestUrl: '/manifest.webmanifest',
    }
  }, [currentOrganization, organizationLogo.data, role])

  useEffect(() => {
    const manifestUrl = config.staticManifestUrl
      ? config.staticManifestUrl
      : URL.createObjectURL(
          new Blob([JSON.stringify(buildManifest(config))], { type: 'application/manifest+json' }),
        )

    document.documentElement.lang = 'ru'
    document.title = getDocumentTitle(config)

    upsertLink('manifest', manifestUrl, 'application/manifest+json')
    upsertLink('icon', config.iconUrl)
    upsertLink('apple-touch-icon', config.appleIconUrl ?? config.iconUrl)

    upsertMeta('application-name', config.name)
    upsertMeta('apple-mobile-web-app-title', config.name)
    upsertMeta('apple-mobile-web-app-capable', 'yes')
    upsertMeta('mobile-web-app-capable', 'yes')
    upsertMeta('apple-mobile-web-app-status-bar-style', 'default')
    upsertMeta('theme-color', defaultThemeColor)
    upsertMeta('description', config.description)
    upsertMeta('og:title', config.name, 'property')
    upsertMeta('og:description', config.description, 'property')
    upsertMeta('og:image', config.iconUrl, 'property')

    return () => {
      if (!config.staticManifestUrl) URL.revokeObjectURL(manifestUrl)
    }
  }, [config])

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        void registration.update()
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
      })
      .catch(() => undefined)
  }, [])

  return null
}
