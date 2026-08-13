import {
  azTranslations,
  supportedLanguages,
  SYSTEM_LANGUAGE_STORAGE_KEY,
  translationEntries,
  type SystemLanguage,
} from './translations'

const reverseAzTranslations = Object.fromEntries(
  Object.entries(azTranslations).map(([source, translated]) => [translated, source]),
)

const reverseTranslationEntries = Object.entries(reverseAzTranslations).sort(
  ([left], [right]) => right.length - left.length,
)

const cyrillicPattern = /[А-Яа-яЁё]/

const hasDom = () => typeof window !== 'undefined' && typeof document !== 'undefined'

function translateDynamicTextToAz(value: string) {
  return value
    .replace(/(\d+)\s*ч(?=\s|$)/g, '$1 saat')
    .replace(/(\d+)\s*мин\.?(?=\s|$)/g, '$1 dəq')
    .replace(/(\d+)\s*поз\.(?=\s|$)/g, '$1 mövqe')
    .replace(/Сейчас:/g, 'İndi:')
}

function translateDynamicTextToRu(value: string) {
  return value
    .replace(/(\d+)\s*saat(?=\s|$)/gi, '$1 ч')
    .replace(/(\d+)\s*dəq\.?(?=\s|$)/gi, '$1 мин')
    .replace(/(\d+)\s*mövqe(?=\s|$)/gi, '$1 поз.')
    .replace(/İndi:/g, 'Сейчас:')
}

export function isSystemLanguage(value: unknown): value is SystemLanguage {
  return typeof value === 'string' && supportedLanguages.includes(value as SystemLanguage)
}

export function getStoredSystemLanguage(): SystemLanguage {
  if (!hasDom()) return 'ru'
  const stored = window.localStorage.getItem(SYSTEM_LANGUAGE_STORAGE_KEY)
  return isSystemLanguage(stored) ? stored : 'ru'
}

export function saveStoredSystemLanguage(language: SystemLanguage) {
  if (!hasDom()) return
  window.localStorage.setItem(SYSTEM_LANGUAGE_STORAGE_KEY, language)
  window.dispatchEvent(new CustomEvent('freedom-platform:system-language-change', { detail: language }))
}

function translateTrimmedToAz(value: string) {
  const exact = azTranslations[value]
  if (exact) return exact

  if (!cyrillicPattern.test(value)) return value

  const translated = translationEntries.reduce((current, [source, translated]) => {
    if (!current.includes(source)) return current
    return current.replaceAll(source, translated)
  }, value)

  return translateDynamicTextToAz(translated)
}

function translateTrimmedToRu(value: string) {
  const exact = reverseAzTranslations[value]
  if (exact) return exact

  const translated = reverseTranslationEntries.reduce((current, [source, translated]) => {
    if (!current.includes(source)) return current
    return current.replaceAll(source, translated)
  }, value)

  return translateDynamicTextToRu(translated)
}

function preserveOuterWhitespace(source: string, translatedTrimmed: string) {
  const prefix = source.match(/^\s*/)?.[0] ?? ''
  const suffix = source.match(/\s*$/)?.[0] ?? ''
  return `${prefix}${translatedTrimmed}${suffix}`
}

export function translateText(value: string, language: SystemLanguage = getStoredSystemLanguage()) {
  const trimmed = value.trim()
  if (!trimmed) return value

  const translated = language === 'az' ? translateTrimmedToAz(trimmed) : translateTrimmedToRu(trimmed)
  return translated === trimmed ? value : preserveOuterWhitespace(value, translated)
}

export function translateByCurrentLanguage(value: string) {
  return translateText(value, getStoredSystemLanguage())
}

const ignoredTags = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE'])
const translatableAttributes = ['aria-label', 'placeholder', 'title', 'alt']

function translateTextNode(node: Text, language: SystemLanguage) {
  const currentValue = node.nodeValue
  if (!currentValue) return

  const translated = translateText(currentValue, language)
  if (translated !== currentValue) {
    node.nodeValue = translated
  }
}

function translateElementAttributes(element: Element, language: SystemLanguage) {
  for (const attributeName of translatableAttributes) {
    const currentValue = element.getAttribute(attributeName)
    if (!currentValue) continue

    const translated = translateText(currentValue, language)
    if (translated !== currentValue) {
      element.setAttribute(attributeName, translated)
    }
  }
}

export function translateDom(root: ParentNode = document.body, language = getStoredSystemLanguage()) {
  if (!hasDom()) return

  if (root instanceof Element) {
    if (ignoredTags.has(root.tagName)) return
    translateElementAttributes(root, language)
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node instanceof Element && ignoredTags.has(node.tagName)) {
        return NodeFilter.FILTER_REJECT
      }

      return NodeFilter.FILTER_ACCEPT
    },
  })

  let current: Node | null = walker.currentNode
  while (current) {
    if (current instanceof Text) {
      translateTextNode(current, language)
    } else if (current instanceof Element) {
      translateElementAttributes(current, language)
    }
    current = walker.nextNode()
  }
}
