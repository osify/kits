import { reactive } from 'vue'
import { prefs } from '@/core/util/prefs'
import { formatMoney } from '@/core/util/money'
import { imageUrl } from '@/core/files/images'
import {
  bluetoothSupported,
  canvasToEscPos,
  connectBluetooth,
  connectSerial,
  paperDots,
  renderBlocks,
  serialSupported,
  type Block,
  type Transport,
} from '@/core/print/escpos'
import { parseMods, type SaleWithLines } from '../db/sales'
import type { Shop } from '../db/shop'
import type { Summary, TopItem } from '../db/reports'

/**
 * Printer choice is per device (a phone may have a Bluetooth printer, a PC uses the system dialog).
 *  - system:    browser print dialog (any printer the OS knows; default)
 *  - bluetooth: direct ESC/POS over Web Bluetooth
 *  - serial:    direct ESC/POS over Web Serial (USB / paired Bluetooth COM port)
 */
export type PrinterMode = 'system' | 'bluetooth' | 'serial'

export const printer = reactive({
  mode: (prefs.get('pos.printer') as PrinterMode) || 'system',
  baud: Number(prefs.get('pos.printerBaud') || 9600),
  connected: '' as string,
  busy: false,
})

let transport: Transport | null = null

export function setPrinterMode(m: PrinterMode) {
  printer.mode = m
  prefs.set('pos.printer', m)
  disconnectPrinter()
}
export function setBaud(b: number) {
  printer.baud = b
  prefs.set('pos.printerBaud', String(b))
}
export const directPrinting = () => printer.mode !== 'system'
export const supportFor = (m: PrinterMode) => (m === 'bluetooth' ? bluetoothSupported() : m === 'serial' ? serialSupported() : true)

export async function disconnectPrinter() {
  try {
    await transport?.close()
  } catch {
    /* ignore */
  }
  transport = null
  printer.connected = ''
}

/** Connect if needed. Call from a tap: the browser shows its device picker the first time. */
export async function ensurePrinter(): Promise<Transport> {
  if (transport) return transport
  transport = printer.mode === 'bluetooth' ? await connectBluetooth() : await connectSerial(printer.baud)
  printer.connected = transport.name
  return transport
}

export async function printBlocks(blocks: Block[], paperMm: number) {
  printer.busy = true
  try {
    const t = await ensurePrinter()
    const canvas = await renderBlocks(blocks, paperDots(paperMm))
    try {
      await t.write(canvasToEscPos(canvas))
    } catch (e) {
      // connection dropped (printer turned off / out of range): reconnect once
      await disconnectPrinter()
      throw e
    }
  } finally {
    printer.busy = false
  }
}

async function loadImg(path: string | null | undefined): Promise<HTMLImageElement | null> {
  const url = await imageUrl('pos', path)
  if (!url) return null
  const img = new Image()
  img.src = url
  try {
    await img.decode()
    return img
  } catch {
    return null
  }
}

type T = (key: string, args?: Record<string, unknown>) => string

export async function receiptBlocks(sale: SaleWithLines, shop: Shop, t: T, licensee?: string | null): Promise<Block[]> {
  const m = (v: number) => formatMoney(v, sale.currency)
  const b: Block[] = []
  const logo = await loadImg(shop.logo_image)
  if (logo) b.push({ t: 'image', src: logo, maxW: 160 })
  b.push({ t: 'text', text: shop.name, align: 'center', size: 28, bold: true })
  if (shop.address) b.push({ t: 'text', text: shop.address, align: 'center', size: 18 })
  if (shop.phone) b.push({ t: 'text', text: shop.phone, align: 'center', size: 18 })
  if (shop.receipt_header) b.push({ t: 'text', text: shop.receipt_header, align: 'center', size: 18 })
  b.push({ t: 'rule' })
  b.push({ t: 'row', left: `#${sale.number}`, right: new Date(sale.updated_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }), size: 18 })
  if (sale.status === 'VOID') b.push({ t: 'text', text: '*** VOID ***', align: 'center', size: 26, bold: true })
  b.push({ t: 'rule' })
  for (const l of sale.lines) {
    b.push({ t: 'row', left: l.name, right: l.internal ? t('pos.quick.free') : m(l.line_total) })
    const mods = parseMods(l.modifiers)
      .map((x) => x.name_km || x.name)
      .join(', ')
    b.push({ t: 'text', text: `  ${l.qty} × ${m(l.unit_price)}${mods ? ` · ${mods}` : ''}`, size: 18 })
  }
  b.push({ t: 'rule' })
  if (sale.discount) {
    b.push({ t: 'row', left: t('pos.c.subtotal'), right: m(sale.subtotal) })
    b.push({ t: 'row', left: t('pos.c.discount'), right: `-${m(sale.discount)}` })
  }
  b.push({ t: 'row', left: t('pos.c.total'), right: m(sale.total), size: 28, bold: true })
  if (shop.show_dual) {
    const alt = sale.currency === 'KHR' ? formatMoney(Math.round((sale.total / sale.khr_per_usd) * 100), 'USD') : formatMoney(Math.round((sale.total / 100) * sale.khr_per_usd / 100) * 100, 'KHR')
    b.push({ t: 'row', left: '', right: `≈ ${alt}`, size: 18 })
  }
  const p = sale.payments[0]
  if (p) {
    b.push({ t: 'row', left: t(`pos.sell.method.${p.method.toLowerCase()}`), right: p.tendered ? formatMoney(p.tendered, p.currency) : '', size: 20 })
    if (p.change_due) b.push({ t: 'row', left: t('pos.sell.change'), right: m(p.change_due), size: 20 })
  }
  b.push({ t: 'rule' })
  b.push({ t: 'text', text: shop.receipt_footer || t('pos.sell.thanks'), align: 'center', size: 20 })
  if (licensee) b.push({ t: 'text', text: licensee, align: 'center', size: 14 })
  b.push({ t: 'text', text: 'kitroid.com', align: 'center', size: 14 })
  return b
}

export function zBlocks(opts: { title: string; from: string; to: string; sum: Summary; top: TopItem[]; closedAt?: number | null }, shop: Shop, t: T, fmt: (v: number) => string): Block[] {
  const { sum } = opts
  const b: Block[] = [
    { t: 'text', text: shop.name, align: 'center', size: 26, bold: true },
    { t: 'text', text: opts.title, align: 'center', size: 22, bold: true },
    { t: 'text', text: opts.from === opts.to ? opts.from : `${opts.from} → ${opts.to}`, align: 'center', size: 20 },
  ]
  if (opts.closedAt) b.push({ t: 'text', text: `${t('pos.sum.closedAt')} ${new Date(opts.closedAt).toLocaleString('en-GB')}`, align: 'center', size: 18 })
  b.push(
    { t: 'rule' },
    { t: 'row', left: t('pos.sum.net'), right: fmt(sum.net), bold: true, size: 26 },
    { t: 'row', left: t('pos.sum.gross'), right: fmt(sum.gross) },
    { t: 'row', left: t('pos.c.discount'), right: `-${fmt(sum.discount)}` },
    { t: 'rule' },
    { t: 'row', left: t('pos.sell.method.cash'), right: fmt(sum.cash) },
    { t: 'row', left: 'KHQR', right: fmt(sum.khqr) },
    { t: 'row', left: t('pos.sum.otherPay'), right: fmt(sum.other) },
    { t: 'row', left: t('pos.sum.quick'), right: fmt(sum.quick) },
    { t: 'row', left: t('pos.sum.debt'), right: fmt(sum.debt) },
    { t: 'row', left: t('pos.sum.collected'), right: fmt(sum.collected) },
    { t: 'row', left: t('pos.sum.cashDrawer'), right: fmt(sum.cash + sum.collectedCash), bold: true },
    { t: 'rule' },
    { t: 'row', left: t('pos.sum.tickets'), right: String(sum.posCount) },
    { t: 'row', left: t('pos.sum.items'), right: String(sum.items) },
  )
  if (sum.internalItems) b.push({ t: 'row', left: t('pos.sum.free'), right: String(sum.internalItems) })
  b.push({ t: 'rule' })
  for (const i of opts.top) b.push({ t: 'row', left: `${i.name} × ${i.qty}${i.internal ? ` (+${i.internal})` : ''}`, right: fmt(i.amount), size: 18 })
  b.push({ t: 'rule' }, { t: 'text', text: `${new Date().toLocaleString('en-GB')} · kitroid.com`, align: 'center', size: 14 })
  return b
}

export function testBlocks(shopName: string, paperMm: number): Block[] {
  return [
    { t: 'text', text: shopName || 'Kitroid', align: 'center', size: 28, bold: true },
    { t: 'text', text: 'សួស្តី! ការបោះពុម្ពសាកល្បង', align: 'center', size: 24 },
    { t: 'text', text: `Test print · ${paperMm} mm`, align: 'center', size: 20 },
    { t: 'rule' },
    { t: 'row', left: 'កាហ្វេទឹកដោះគោទឹកកក', right: '5,000 ៛' },
    { t: 'row', left: 'Iced latte', right: '$1.50' },
    { t: 'rule' },
    { t: 'text', text: 'kitroid.com', align: 'center', size: 16 },
  ]
}
