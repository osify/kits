/**
 * Direct printing to 58/80 mm ESC/POS thermal printers, without the browser print dialog.
 *
 * Cheap thermal printers have no Khmer font, so the receipt is drawn on a <canvas> with the
 * app's own font (Khmer shaping handled by the browser) and sent as a 1-bit raster image
 * (GS v 0). Works for any language.
 *
 * Transports (Chrome / Edge / Android Chrome; not iOS Safari or Firefox):
 *  - Web Bluetooth: BLE printers (most cheap portable 58 mm printers)
 *  - Web Serial: USB printers that show up as a COM port, and Bluetooth Classic printers
 *    paired in Windows (they get a COM port)
 */
export type Align = 'left' | 'center' | 'right'
export type Block =
  | { t: 'text'; text: string; align?: Align; size?: number; bold?: boolean }
  | { t: 'row'; left: string; right: string; size?: number; bold?: boolean }
  | { t: 'rule' }
  | { t: 'gap'; px: number }
  | { t: 'image'; src: CanvasImageSource & { width: number; height: number }; maxW?: number }

export const FONT = '"Kantumruy Pro Variable", "Khmer OS Siemreap", sans-serif'
const DOTS: Record<number, number> = { 58: 384, 80: 576 }

export function paperDots(mm: number) {
  return DOTS[mm] ?? 384
}

/** Break text into lines that fit `width`, using word boundaries (Khmer has no spaces). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const seg = (Intl as any).Segmenter ? new (Intl as any).Segmenter('km', { granularity: 'word' }) : null
    const words: string[] = seg ? [...seg.segment(para)].map((s: any) => s.segment) : para.split(/(\s+)/)
    let line = ''
    for (const w of words) {
      if (ctx.measureText(line + w).width <= width || !line) {
        line += w
        // a single word wider than the line: hard-split by characters
        while (ctx.measureText(line).width > width && line.length > 1) {
          let cut = line.length - 1
          while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > width) cut--
          out.push(line.slice(0, cut))
          line = line.slice(cut)
        }
      } else {
        out.push(line.trimEnd())
        line = w.trimStart()
      }
    }
    out.push(line.trimEnd())
  }
  return out
}

export async function renderBlocks(blocks: Block[], widthDots: number): Promise<HTMLCanvasElement> {
  try {
    await document.fonts.load(`20px "Kantumruy Pro Variable"`, 'កខគ abc')
  } catch {
    /* fall back to whatever font is available */
  }
  const pad = 4
  const inner = widthDots - pad * 2
  const canvas = document.createElement('canvas')
  canvas.width = widthDots
  canvas.height = 6000
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'
  let y = pad
  const font = (size = 22, bold = false) => (ctx.font = `${bold ? 700 : 400} ${size}px ${FONT}`)
  const lh = (size: number) => Math.round(size * 1.55) // Khmer needs room above and below

  for (const b of blocks) {
    if (b.t === 'gap') y += b.px
    else if (b.t === 'rule') {
      ctx.fillRect(pad, y + 6, inner, 2)
      y += 14
    } else if (b.t === 'image') {
      const w = Math.min(b.maxW ?? inner * 0.5, b.src.width)
      const h = (b.src.height * w) / b.src.width
      ctx.drawImage(b.src, (widthDots - w) / 2, y, w, h)
      y += h + 6
    } else if (b.t === 'text') {
      const size = b.size ?? 22
      font(size, b.bold)
      for (const line of wrap(ctx, b.text, inner)) {
        const w = ctx.measureText(line).width
        const x = b.align === 'center' ? (widthDots - w) / 2 : b.align === 'right' ? widthDots - pad - w : pad
        ctx.fillText(line, x, y)
        y += lh(size)
      }
    } else if (b.t === 'row') {
      const size = b.size ?? 22
      font(size, b.bold)
      const rw = ctx.measureText(b.right).width
      const lines = wrap(ctx, b.left, inner - rw - 12)
      lines.forEach((line, i) => {
        ctx.fillText(line, pad, y)
        if (i === 0) ctx.fillText(b.right, widthDots - pad - rw, y)
        y += lh(size)
      })
    }
  }
  const out = document.createElement('canvas')
  out.width = widthDots
  out.height = Math.ceil(y + pad)
  out.getContext('2d')!.drawImage(canvas, 0, 0)
  return out
}

/** Canvas → ESC/POS bytes: init, raster image in bands, feed, partial cut. */
export function canvasToEscPos(canvas: HTMLCanvasElement, opts: { cut?: boolean; feed?: number } = {}): Uint8Array {
  const { width, height } = canvas
  const px = canvas.getContext('2d')!.getImageData(0, 0, width, height).data
  const bytesPerRow = Math.ceil(width / 8)
  const parts: number[] = [0x1b, 0x40] // ESC @ init
  const BAND = 128
  for (let top = 0; top < height; top += BAND) {
    const rows = Math.min(BAND, height - top)
    parts.push(0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, rows & 0xff, rows >> 8) // GS v 0
    for (let r = 0; r < rows; r++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let byte = 0
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit
          if (x >= width) continue
          const i = ((top + r) * width + x) * 4
          const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
          if (px[i + 3] > 128 && lum < 150) byte |= 0x80 >> bit
        }
        parts.push(byte)
      }
    }
  }
  parts.push(0x1b, 0x64, opts.feed ?? 4) // ESC d n: feed
  if (opts.cut !== false) parts.push(0x1d, 0x56, 0x42, 0x00) // GS V B: partial cut (ignored by printers without cutter)
  return new Uint8Array(parts)
}

// ── transports ───────────────────────────────────────────────────────────────
export interface Transport {
  kind: 'bluetooth' | 'serial'
  name: string
  write(data: Uint8Array): Promise<void>
  close(): Promise<void>
}

export const bluetoothSupported = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator
export const serialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator

/** Services used by common BLE receipt printers. */
const BLE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
]

/** Must be called from a tap/click (browser shows its device picker). */
export async function connectBluetooth(): Promise<Transport> {
  const device = await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES })
  const server = await device.gatt.connect()
  let ch: any = null
  for (const svc of await server.getPrimaryServices()) {
    for (const c of await svc.getCharacteristics()) {
      if (c.properties.writeWithoutResponse || c.properties.write) {
        ch = c
        break
      }
    }
    if (ch) break
  }
  if (!ch) throw new Error('This Bluetooth device has no printer channel.')
  const noResp = !!ch.properties.writeWithoutResponse
  return {
    kind: 'bluetooth',
    name: device.name || 'Bluetooth printer',
    async write(data) {
      if (!device.gatt.connected) await device.gatt.connect()
      const CHUNK = 180
      for (let i = 0; i < data.length; i += CHUNK) {
        const part = data.slice(i, i + CHUNK)
        if (noResp) {
          await ch.writeValueWithoutResponse(part)
          await new Promise((r) => setTimeout(r, 8)) // let slow printers keep up
        } else await ch.writeValue(part)
      }
    },
    async close() {
      device.gatt.disconnect()
    },
  }
}

/** Must be called from a tap/click (browser shows its port picker). */
export async function connectSerial(baudRate = 9600): Promise<Transport> {
  const port = await (navigator as any).serial.requestPort()
  await port.open({ baudRate })
  const info = port.getInfo?.() ?? {}
  return {
    kind: 'serial',
    name: info.usbProductId ? `USB ${info.usbVendorId?.toString(16)}:${info.usbProductId.toString(16)}` : 'Serial printer',
    async write(data) {
      const w = port.writable.getWriter()
      try {
        await w.write(data)
      } finally {
        w.releaseLock()
      }
    },
    async close() {
      await port.close()
    },
  }
}
