import { createI18n } from 'vue-i18n'
import km from './km.json'
import en from './en.json'
import { prefs } from '@/core/util/prefs'

export type Lang = 'km' | 'en'
export const LANGS: Lang[] = ['km', 'en']

/** Language is shared by the whole site (landing + every tool) via one device pref. */
export function getLang(): Lang {
  const saved = prefs.get('lang')
  if (saved === 'km' || saved === 'en') return saved
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en')) return 'en'
  return 'km'
}

export const i18n = createI18n({
  legacy: false,
  locale: getLang(),
  fallbackLocale: 'en',
  messages: { km, en },
})

export function setLang(lang: Lang) {
  prefs.set('lang', lang)
  i18n.global.locale.value = lang
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}
