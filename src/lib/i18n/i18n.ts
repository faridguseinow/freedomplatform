import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import az from './locales/az.json'
import manualAz from './locales/manual.az.json'
import manualRu from './locales/manual.ru.json'
import ru from './locales/ru.json'
import { getStoredSystemLanguage } from './translations'

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: { ...ru, ...manualRu } },
    az: { translation: { ...az, ...manualAz } },
  },
  lng: getStoredSystemLanguage(),
  fallbackLng: 'ru',
  supportedLngs: ['ru', 'az'],
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
})

export default i18n
