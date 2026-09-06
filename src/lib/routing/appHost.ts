export const DEFAULT_PLATFORM_BASE_DOMAIN = 'freedomplatform.cc'

const configuredBaseDomain = import.meta.env?.VITE_PLATFORM_BASE_DOMAIN?.trim().toLowerCase()

export const PLATFORM_BASE_DOMAIN = configuredBaseDomain || DEFAULT_PLATFORM_BASE_DOMAIN

export const RESERVED_SUBDOMAINS = [
  'admin',
  'www',
  'platform',
  'app',
  'api',
  'mail',
  'support',
  'status',
  'static',
  'assets',
] as const

const reservedSubdomains = new Set<string>(RESERVED_SUBDOMAINS)
const organizationSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type AppHostContext =
  | { mode: 'platform-admin' }
  | { mode: 'tenant'; slug: string }
  | { mode: 'legacy' }
  | { mode: 'unknown' }

type UrlOptions = {
  baseDomain?: string
  hostname?: string
  origin?: string
}

const normalizeHostname = (hostname: string) => hostname.trim().toLowerCase().replace(/\.$/, '')

const normalizeBaseDomain = (baseDomain: string) =>
  normalizeHostname(baseDomain).replace(/^\.+|\.+$/g, '')

const normalizePath = (path: string) => {
  if (!path || path === '/') return '/'
  return `/${path.replace(/^\/+|\/+$/g, '')}`
}

const getBrowserLocation = () => {
  if (typeof window === 'undefined') return null
  return window.location
}

export const isReservedOrganizationSlug = (slug: string) =>
  reservedSubdomains.has(slug.trim().toLowerCase())

export const isValidOrganizationSlug = (slug: string) => {
  const normalizedSlug = slug.trim().toLowerCase()
  return organizationSlugPattern.test(normalizedSlug) && !isReservedOrganizationSlug(normalizedSlug)
}

export function parseAppHostname(
  hostname: string,
  baseDomain = PLATFORM_BASE_DOMAIN,
): AppHostContext {
  const normalizedHostname = normalizeHostname(hostname)
  const normalizedBaseDomain = normalizeBaseDomain(baseDomain)

  if (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1' ||
    normalizedHostname.endsWith('.localhost') ||
    normalizedHostname === 'vercel.app' ||
    normalizedHostname.endsWith('.vercel.app')
  ) {
    return { mode: 'legacy' }
  }

  if (normalizedHostname === `admin.${normalizedBaseDomain}`) {
    return { mode: 'platform-admin' }
  }

  const tenantSuffix = `.${normalizedBaseDomain}`
  if (normalizedHostname.endsWith(tenantSuffix)) {
    const subdomain = normalizedHostname.slice(0, -tenantSuffix.length)

    if (
      !subdomain.includes('.') &&
      organizationSlugPattern.test(subdomain) &&
      !isReservedOrganizationSlug(subdomain)
    ) {
      return { mode: 'tenant', slug: subdomain }
    }
  }

  return { mode: 'unknown' }
}

export const getCurrentAppHost = (): AppHostContext => {
  const location = getBrowserLocation()
  return location ? parseAppHostname(location.hostname) : { mode: 'unknown' }
}

export const getRouteOrganizationSlug = (routeSlug?: string | null): string | null => {
  const host = getCurrentAppHost()
  return host.mode === 'tenant' ? host.slug : routeSlug ?? null
}

export const getTenantRoutePath = (path: string, slug?: string | null): string => {
  const normalizedPath = normalizePath(path)
  const host = getCurrentAppHost()

  if (host.mode === 'tenant') return normalizedPath
  if (!slug) return normalizedPath
  return normalizedPath === '/' ? `/${slug}` : `/${slug}${normalizedPath}`
}

export const getPlatformRoutePath = (path = '/'): string => {
  const normalizedPath = normalizePath(path)
  const host = getCurrentAppHost()

  if (host.mode === 'platform-admin') {
    if (normalizedPath === '/platform') return '/'
    return normalizedPath.startsWith('/platform/')
      ? normalizedPath.slice('/platform'.length)
      : normalizedPath
  }

  if (normalizedPath === '/' || normalizedPath === '/platform') return '/platform'
  return normalizedPath.startsWith('/platform/') ? normalizedPath : `/platform${normalizedPath}`
}

export function getOrganizationUrl(slug: string, path = '/', options: UrlOptions = {}): string {
  const normalizedSlug = slug.trim().toLowerCase()
  const normalizedPath = normalizePath(path)
  const location = getBrowserLocation()
  const hostname = options.hostname ?? location?.hostname ?? ''
  const origin = options.origin ?? location?.origin
  const baseDomain = options.baseDomain ?? PLATFORM_BASE_DOMAIN
  const host = parseAppHostname(hostname, baseDomain)

  if (host.mode === 'legacy' && origin) {
    const legacyPath = normalizedPath === '/' ? `/${normalizedSlug}` : `/${normalizedSlug}${normalizedPath}`
    return new URL(legacyPath, origin).toString()
  }

  return `https://${normalizedSlug}.${normalizeBaseDomain(baseDomain)}${
    normalizedPath === '/' ? '' : normalizedPath
  }`
}

export function getPlatformAdminUrl(path = '/', options: UrlOptions = {}): string {
  const normalizedPath = normalizePath(path)
  const location = getBrowserLocation()
  const hostname = options.hostname ?? location?.hostname ?? ''
  const origin = options.origin ?? location?.origin
  const baseDomain = options.baseDomain ?? PLATFORM_BASE_DOMAIN
  const host = parseAppHostname(hostname, baseDomain)

  if (host.mode === 'legacy' && origin) {
    const legacyPath = normalizedPath === '/' ? '/platform' : `/platform${normalizedPath}`
    return new URL(legacyPath, origin).toString()
  }

  return `https://admin.${normalizeBaseDomain(baseDomain)}${
    normalizedPath === '/' ? '' : normalizedPath
  }`
}
