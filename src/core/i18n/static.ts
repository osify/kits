import km from './km.json'
import en from './en.json'
import type { Lang } from './index'

const dict = { km, en } as const

/** Translation for Astro (build-time) pages: tr('en', 'landing.hero'). */
export function tr(lang: Lang, key: string): string {
  const pick = (root: unknown) =>
    key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), root)
  const v = pick(dict[lang]) ?? pick(dict.en)
  return typeof v === 'string' ? v : key
}
