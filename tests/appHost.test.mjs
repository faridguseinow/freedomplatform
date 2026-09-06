import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getOrganizationUrl,
  getPlatformAdminUrl,
  getPlatformRoutePath,
  getTenantRoutePath,
  isReservedOrganizationSlug,
  isValidOrganizationSlug,
  parseAppHostname,
} from '../src/lib/routing/appHost.ts'

test('resolves the platform admin host', () => {
  assert.deepEqual(parseAppHostname('admin.freedomplatform.cc'), { mode: 'platform-admin' })
})

test('resolves current and future tenant subdomains', () => {
  assert.deepEqual(parseAppHostname('demo.freedomplatform.cc'), { mode: 'tenant', slug: 'demo' })
  assert.deepEqual(parseAppHostname('theliga.freedomplatform.cc'), {
    mode: 'tenant',
    slug: 'theliga',
  })
  assert.deepEqual(parseAppHostname('testclub.freedomplatform.cc'), {
    mode: 'tenant',
    slug: 'testclub',
  })
})

test('keeps localhost and Vercel deployments in legacy mode', () => {
  assert.deepEqual(parseAppHostname('localhost'), { mode: 'legacy' })
  assert.deepEqual(parseAppHostname('127.0.0.1'), { mode: 'legacy' })
  assert.deepEqual(parseAppHostname('freedom-platform-git-main.vercel.app'), { mode: 'legacy' })
})

test('does not resolve reserved or nested subdomains as tenants', () => {
  assert.deepEqual(parseAppHostname('www.freedomplatform.cc'), { mode: 'unknown' })
  assert.deepEqual(parseAppHostname('api.freedomplatform.cc'), { mode: 'unknown' })
  assert.deepEqual(parseAppHostname('foo.bar.freedomplatform.cc'), { mode: 'unknown' })
})

test('validates organization slugs including reserved values', () => {
  assert.equal(isReservedOrganizationSlug('ADMIN'), true)
  assert.equal(isValidOrganizationSlug('theliga'), true)
  assert.equal(isValidOrganizationSlug('test-club'), true)
  assert.equal(isValidOrganizationSlug('support'), false)
  assert.equal(isValidOrganizationSlug('bad_slug'), false)
})

test('builds production organization and admin URLs', () => {
  assert.equal(
    getOrganizationUrl('theliga', '/admin/orders', { hostname: 'admin.freedomplatform.cc' }),
    'https://theliga.freedomplatform.cc/admin/orders',
  )
  assert.equal(
    getPlatformAdminUrl('/organizations', { hostname: 'theliga.freedomplatform.cc' }),
    'https://admin.freedomplatform.cc/organizations',
  )
})

test('builds legacy URLs for localhost and Vercel previews', () => {
  assert.equal(
    getOrganizationUrl('demo', '/admin', {
      hostname: 'localhost',
      origin: 'http://localhost:5173',
    }),
    'http://localhost:5173/demo/admin',
  )
  assert.equal(
    getPlatformAdminUrl('/', {
      hostname: 'freedom-platform-preview.vercel.app',
      origin: 'https://freedom-platform-preview.vercel.app',
    }),
    'https://freedom-platform-preview.vercel.app/platform',
  )
})

test('uses clean route paths on production hosts', () => {
  globalThis.window = {
    location: {
      hostname: 'theliga.freedomplatform.cc',
      origin: 'https://theliga.freedomplatform.cc',
    },
  }
  assert.equal(getTenantRoutePath('/admin/orders', 'ignored-route-slug'), '/admin/orders')

  globalThis.window = {
    location: {
      hostname: 'admin.freedomplatform.cc',
      origin: 'https://admin.freedomplatform.cc',
    },
  }
  assert.equal(getPlatformRoutePath('/platform/organizations'), '/organizations')
  delete globalThis.window
})

test('uses slug-prefixed route paths in legacy mode', () => {
  globalThis.window = {
    location: {
      hostname: 'localhost',
      origin: 'http://localhost:5173',
    },
  }
  assert.equal(getTenantRoutePath('/employee/menu', 'demo'), '/demo/employee/menu')
  assert.equal(getPlatformRoutePath('/finance'), '/platform/finance')
  delete globalThis.window
})
