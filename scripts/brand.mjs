// Export the Kitroid "K." logo in common formats into docs/brand/.  node scripts/brand.mjs
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = 'docs/brand'
mkdirSync(OUT, { recursive: true })

const GREEN = '#059669'
const MINT = '#a7f3d0'
const INK = '#0f172a'
const K = 'M168 128h56v104l96-104h70L282 244l116 140h-72l-88-108-30 32v76h-56z'
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"

const svgs = {
  // App icon (rounded square) — the main logo
  'kitroid-icon': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${GREEN}"/><path d="${K}" fill="#fff"/><circle cx="392" cy="392" r="34" fill="${MINT}"/></svg>`,
  // Full square, no corners — for places that crop to a circle/rounded shape themselves (Google, Facebook, Telegram)
  'kitroid-icon-square': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${GREEN}"/><path d="${K}" fill="#fff"/><circle cx="392" cy="392" r="34" fill="${MINT}"/></svg>`,
  // The mark alone on transparent background
  'kitroid-mark-green': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="146 106 296 336"><path d="${K}" fill="${GREEN}"/><circle cx="392" cy="392" r="34" fill="${GREEN}"/></svg>`,
  'kitroid-mark-white': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="146 106 296 336"><path d="${K}" fill="#fff"/><circle cx="392" cy="392" r="34" fill="${MINT}"/></svg>`,
  'kitroid-mark-black': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="146 106 296 336"><path d="${K}" fill="#000"/><circle cx="392" cy="392" r="34" fill="#000"/></svg>`,
  // Icon + wordmark, for light and dark backgrounds
  'kitroid-logo-light': logo(INK),
  'kitroid-logo-dark': logo('#fff'),
  // Link preview (Facebook / Telegram / LinkedIn), 1200×630
  'kitroid-social': `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="${GREEN}"/>
    <g transform="translate(96 175) scale(0.546875)"><rect width="512" height="512" rx="112" fill="#fff"/><path d="${K}" fill="${GREEN}"/><circle cx="392" cy="392" r="34" fill="${GREEN}"/></g>
    <text x="420" y="300" font-family="${FONT}" font-size="104" font-weight="700" fill="#fff">Kitroid</text>
    <text x="424" y="372" font-family="${FONT}" font-size="38" fill="${MINT}">Free offline business tools</text>
    <text x="424" y="422" font-family="${FONT}" font-size="38" fill="${MINT}">for Cambodian shops · kitroid.com</text>
  </svg>`,
}

function logo(text) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="320" viewBox="0 0 1120 320">
    <g transform="translate(16 16) scale(0.5625)"><rect width="512" height="512" rx="112" fill="${GREEN}"/><path d="${K}" fill="#fff"/><circle cx="392" cy="392" r="34" fill="${MINT}"/></g>
    <text x="340" y="214" font-family="${FONT}" font-size="168" font-weight="700" fill="${text}" letter-spacing="-2">Kitroid</text>
  </svg>`
}

const png = (name, svg, size, opts = {}) =>
  sharp(Buffer.from(svg), { density: 600 })
    .resize(size.w ?? size, size.h ?? (size.w ? undefined : size), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .flatten(opts.bg ? { background: opts.bg } : false)
    [opts.jpg ? 'jpeg' : 'png'](opts.jpg ? { quality: 92 } : { compressionLevel: 9 })
    .toFile(`${OUT}/${name}`)

for (const [n, s] of Object.entries(svgs)) writeFileSync(`${OUT}/${n}.svg`, s.replace(/\n\s*/g, ''))

const jobs = []
for (const px of [16, 32, 48, 64, 120, 128, 180, 192, 256, 512, 1024]) jobs.push(png(`kitroid-icon-${px}.png`, svgs['kitroid-icon'], px))
for (const px of [120, 512, 1024]) jobs.push(png(`kitroid-icon-square-${px}.png`, svgs['kitroid-icon-square'], px))
jobs.push(png('kitroid-icon-square-1024.jpg', svgs['kitroid-icon-square'], 1024, { jpg: true, bg: GREEN }))
for (const n of ['kitroid-mark-green', 'kitroid-mark-white', 'kitroid-mark-black']) jobs.push(png(`${n}-512.png`, svgs[n], { w: 451, h: 512 }))
jobs.push(png('kitroid-logo-light.png', svgs['kitroid-logo-light'], { w: 1120, h: 320 }))
jobs.push(png('kitroid-logo-dark.png', svgs['kitroid-logo-dark'], { w: 1120, h: 320 }))
jobs.push(png('kitroid-social-1200x630.png', svgs['kitroid-social'], { w: 1200, h: 630 }))
jobs.push(png('kitroid-social-1200x630.jpg', svgs['kitroid-social'], { w: 1200, h: 630 }, { jpg: true, bg: GREEN }))
await Promise.all(jobs)
console.log('done')
