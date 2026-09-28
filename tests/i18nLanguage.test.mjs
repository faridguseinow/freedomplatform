import assert from 'node:assert/strict'
import test from 'node:test'
import { getStoredSystemLanguage } from '../src/lib/i18n/translations.ts'

const withBrowserLanguage = (search, storedLanguage, callback) => {
  globalThis.window = {
    location: { search },
    localStorage: { getItem: () => storedLanguage },
  }
  globalThis.document = {}

  try {
    callback()
  } finally {
    delete globalThis.window
    delete globalThis.document
  }
}

test('URL language takes priority when opening the demo from marketing', () => {
  withBrowserLanguage('?lang=az', 'ru', () => {
    assert.equal(getStoredSystemLanguage(), 'az')
  })
})

test('unsupported URL language falls back to the saved application language', () => {
  withBrowserLanguage('?lang=de', 'az', () => {
    assert.equal(getStoredSystemLanguage(), 'az')
  })
})

test('English URL language is supported', () => {
  withBrowserLanguage('?lang=en', 'az', () => {
    assert.equal(getStoredSystemLanguage(), 'en')
  })
})
