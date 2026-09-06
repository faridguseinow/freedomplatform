import i18n from './i18n'
import sourceMap from './locales/source-map.json'
import manualSourceMap from './locales/manual-source-map.json'
import {
  localeByLanguage,
  getStoredSystemLanguage,
  type SystemLanguage,
} from './translations'

type TranslationOptions = Record<string, unknown>

const sources: Record<string, string> = { ...sourceMap, ...manualSourceMap }
const ignoredTags = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE'])
const translatableAttributes = ['aria-label', 'placeholder', 'title', 'alt'] as const
const originalText = new WeakMap<Text, string>()
const renderedText = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()
const renderedAttributes = new WeakMap<Element, Map<string, string>>()

const hasDom = () => typeof window !== 'undefined' && typeof document !== 'undefined'

function preserveOuterWhitespace(source: string, translatedTrimmed: string) {
  const prefix = source.match(/^\s*/)?.[0] ?? ''
  const suffix = source.match(/\s*$/)?.[0] ?? ''
  return `${prefix}${translatedTrimmed}${suffix}`
}

export function resolveTranslationKey(value: string) {
  return sources[value] ?? value
}

export function translateText(
  value: string,
  language: SystemLanguage = getStoredSystemLanguage(),
  options?: TranslationOptions,
) {
  const trimmed = value.trim()
  if (!trimmed) return value

  const key = resolveTranslationKey(trimmed)
  if (key === trimmed && !i18n.exists(key, { lng: language })) return value
  const translated = i18n.t(key, { ...options, lng: language, defaultValue: trimmed })
  return translated === trimmed ? value : preserveOuterWhitespace(value, String(translated))
}

export function translateByCurrentLanguage(value: string, options?: TranslationOptions) {
  return translateText(value, getStoredSystemLanguage(), options)
}

export function getCurrentLocale(language: SystemLanguage = getStoredSystemLanguage()) {
  return localeByLanguage[language]
}

function translateTextNode(node: Text, language: SystemLanguage) {
  if (node.parentElement && ignoredTags.has(node.parentElement.tagName)) return
  const current = node.nodeValue ?? ''
  if (renderedText.get(node) !== current) originalText.set(node, current)
  const source = originalText.get(node) ?? current
  const translated = translateText(source, language)
  renderedText.set(node, translated)
  if (translated !== current) node.nodeValue = translated
}

function translateElementAttributes(element: Element, language: SystemLanguage) {
  const originals = originalAttributes.get(element) ?? new Map<string, string>()
  const rendered = renderedAttributes.get(element) ?? new Map<string, string>()

  for (const attributeName of translatableAttributes) {
    const current = element.getAttribute(attributeName)
    if (!current) continue
    if (rendered.get(attributeName) !== current) originals.set(attributeName, current)
    const source = originals.get(attributeName) ?? current
    const translated = translateText(source, language)
    rendered.set(attributeName, translated)
    if (translated !== current) element.setAttribute(attributeName, translated)
  }

  originalAttributes.set(element, originals)
  renderedAttributes.set(element, rendered)
}

export function translateDom(root: ParentNode = document.body, language = getStoredSystemLanguage()) {
  if (!hasDom()) return
  if (root instanceof Element) {
    if (ignoredTags.has(root.tagName)) return
    translateElementAttributes(root, language)
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      return node instanceof Element && ignoredTags.has(node.tagName)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    },
  })

  let current: Node | null = walker.currentNode
  while (current) {
    if (current instanceof Text) translateTextNode(current, language)
    else if (current instanceof Element) translateElementAttributes(current, language)
    current = walker.nextNode()
  }
}
