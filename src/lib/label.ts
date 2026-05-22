import QRCode from 'qrcode'
import type { Spool } from '../types/spoolman'

export interface LabelSettings {
  widthMm: number
  heightMm: number
  dpi: number // dots per mm
  spoolUrlBase: string
  /** QR code size as % of label width (capped at label height). Default 60. */
  qrSizePct: number
  /** Text block width as % of label width. Block is centred in remaining space. Default 50. */
  textSizePct: number
}

export async function renderLabel(spool: Spool, settings: LabelSettings): Promise<HTMLCanvasElement> {
  const widthPx = Math.round(settings.widthMm * settings.dpi)
  const heightPx = Math.round(settings.heightMm * settings.dpi)

  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, widthPx, heightPx)

  // Layout constants (in px)
  const pad = 2  // hard outer margin
  const gap = 4  // gap between QR and text area
  const qrMaxFromWidth = Math.round(widthPx * (settings.qrSizePct / 100))
  const qrSize = Math.min(heightPx - pad * 2, qrMaxFromWidth)
  const qrX = pad
  const qrY = Math.round((heightPx - qrSize) / 2) // centre QR vertically

  // QR code
  const qrUrl = `${settings.spoolUrlBase}/spool/show/${spool.id}`
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: qrSize,
    margin: 0,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
  const qrImg = await loadImage(qrDataUrl)
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

  // Text block to the right of QR — centre it both axes within available space
  const textAreaLeft = qrX + qrSize + gap
  const textAreaRight = widthPx - pad
  const textAreaW = Math.max(0, textAreaRight - textAreaLeft)

  if (textAreaW < 20) return canvas // no room for text

  const textBlockW = Math.min(textAreaW, Math.round(widthPx * (settings.textSizePct / 100)))
  const textX = textAreaLeft + Math.round((textAreaW - textBlockW) / 2)

  const vendorName = spool.filament.vendor?.name ?? ''
  const colorName = (() => {
    const raw = spool.filament.extra?.color_name
    if (!raw) return ''
    try { return JSON.parse(raw) as string } catch { return raw }
  })()
  const productLine = spool.filament.name ?? ''
  const extruderTemp =
    spool.filament.settings_extruder_temp != null
      ? `${spool.filament.settings_extruder_temp} °C`
      : ''

  const lines: Array<{ text: string; bold: boolean }> = [
    { text: vendorName,   bold: true  },
    { text: colorName,    bold: true  },
    { text: productLine,  bold: false },
    { text: extruderTemp, bold: false },
  ].filter(l => l.text !== '')

  // Auto-fit font size: scale to fill height first, then shrink if any line is too wide.
  // No maxWidth is passed to fillText so the aspect ratio of glyphs is always preserved.
  const LINE_SPACING = 1.3
  const maxFontFromHeight = Math.floor((heightPx - pad * 2) / (lines.length * LINE_SPACING))
  let fontSize = Math.max(4, maxFontFromHeight)

  let maxTextW = 0
  for (const line of lines) {
    if (!line.text) continue
    ctx.font = `${line.bold ? 'bold ' : ''}${fontSize}px Arial, sans-serif`
    maxTextW = Math.max(maxTextW, ctx.measureText(line.text).width)
  }
  if (maxTextW > textBlockW && maxTextW > 0) {
    fontSize = Math.max(4, Math.floor(fontSize * (textBlockW / maxTextW)))
  }

  const lineHeight = Math.round(fontSize * LINE_SPACING)

  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'

  // Centre the whole block vertically
  const textBlockH = lines.length * lineHeight
  let y = Math.round((heightPx - textBlockH) / 2)
  for (const line of lines) {
    if (line.text) {
      ctx.font = `${line.bold ? 'bold ' : ''}${fontSize}px Arial, sans-serif`
      ctx.fillText(line.text, textX, y) // no maxWidth → glyphs keep aspect ratio
    }
    y += lineHeight
  }

  return canvas
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
