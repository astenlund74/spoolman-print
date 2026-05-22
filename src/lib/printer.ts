// WebHID printer driver for SUPVAN T50M Pro.
// Ported from supvan-t50-pro-webhid/t50pro-webhid.js with DOM coupling removed.

// Augment Window with LZMA (loaded via vendor/lzma.js <script> tag).
declare global {
  interface Window {
    LZMA?: {
      compress(
        data: number[],
        mode: number | object,
        callback: (result: number[], error: Error | null) => void
      ): void
    }
    process?: { env: Record<string, string> }
  }
}

const VENDOR_ID = 0x1820
const PRODUCT_ID = 0x2076
const CMD_BUF_FULL = 16
const CMD_INQUIRY_STA = 17
const CMD_STATR_PRINT = 19
const CMD_CHECK_DEVICE = 18
const CMD_SET_MATERIAL = 93
const CMD_SEND_DATA = 92
const HID_OUT_PAYLOAD = 64
const HID_IN_SKIP = 1

export interface PrinterSettings {
  widthMm: number
  heightMm: number
  dpi: number
  paperType: number
  gap: number
  speed: number
  deepness: number
  maxDotValue: number
  offsetH: number
  offsetV: number
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  widthMm: 40,
  heightMm: 30,
  dpi: 8,
  paperType: 1,
  gap: 3,
  speed: 40,
  deepness: 4,
  maxDotValue: 384,
  offsetH: 0,
  offsetV: 0,
}

export class Printer {
  private device: HIDDevice | null = null
  private reportIdOut = 0
  private readQueue: Uint8Array[] = []
  private readWaiters: Array<(data: Uint8Array) => void> = []
  private lzma: Window['LZMA'] | null = null

  get connected(): boolean {
    return this.device !== null
  }

  async connect(onDisconnect?: () => void): Promise<void> {
    if (!navigator.hid) {
      throw new Error('WebHID is not supported in this browser (Chrome/Edge required).')
    }
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }],
    })
    if (!devices || devices.length === 0) {
      throw new Error('No device selected.')
    }
    const device = devices[0]
    await device.open()

    device.addEventListener('inputreport', (event: HIDInputReportEvent) => {
      const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
      this.enqueueReport(data)
    })

    if (onDisconnect) {
      navigator.hid.addEventListener('disconnect', (event: HIDConnectionEvent) => {
        if (event.device === device) {
          this.device = null
          onDisconnect()
        }
      })
    }

    this.device = device
    this.reportIdOut = this.findReportId(device, 'output')
  }

  disconnect(): void {
    if (this.device) {
      this.device.close().catch(console.error)
      this.device = null
    }
  }

  async print(
    labelCanvas: HTMLCanvasElement,
    settings: PrinterSettings,
    onStatus: (msg: string) => void
  ): Promise<void> {
    if (!this.device) throw new Error('Not connected.')

    onStatus('Sending material config…')
    const material = this.buildMaterialConfig(settings)
    await this.vendorReq(CMD_SET_MATERIAL, material.length)
    await this.bulkWrite(material)
    await this.bulkRead(4)

    onStatus('Building print buffers…')
    const buffers = this.buildPrintBuffers(labelCanvas, settings)

    onStatus('Checking device…')
    await this.vendorReq(CMD_CHECK_DEVICE, 0)
    await this.waitComOk()

    onStatus('Starting print…')
    await this.vendorReq(CMD_STATR_PRINT, 1)

    const speed = Math.max(20, Math.min(60, settings.speed))
    const bufferQueue = buffers.slice()
    const bufferMaxCount = 8
    let sent = 0

    while (bufferQueue.length > 0) {
      let status = await this.vendorReq(CMD_INQUIRY_STA, 0)
      let flags = this.parsePrinterFlags(status)
      while (flags.bufFull) {
        await delay(20)
        status = await this.vendorReq(CMD_INQUIRY_STA, 0)
        flags = this.parsePrinterFlags(status)
      }

      let chunkCount = Math.min(bufferMaxCount, bufferQueue.length)
      let compressed: Uint8Array | undefined
      while (chunkCount > 0) {
        const merged = this.mergeBuffers(bufferQueue, chunkCount)
        compressed = await this.lzmaCompress(merged)
        if (compressed.length <= 4096) break
        chunkCount -= 1
      }
      if (!compressed || chunkCount === 0) {
        throw new Error('Unable to compress buffers within 4096 bytes.')
      }
      if (compressed.length > 4096) {
        throw new Error(`Compressed buffer too large: ${compressed.length}`)
      }

      sent += chunkCount
      onStatus(`Sending… ${sent}/${buffers.length} buffers`)
      await this.vendorReq(CMD_SEND_DATA, compressed.length)
      await this.bulkWrite(compressed)
      await this.bulkRead(4)
      await this.vendorReq2(CMD_BUF_FULL, compressed.length, speed)
      bufferQueue.splice(0, chunkCount)
    }

    onStatus('Print complete.')
  }

  // ── protocol internals ─────────────────────────────────────────────────────

  private buildMaterialConfig(settings: PrinterSettings): Uint8Array {
    const data = [
      48, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 121, 1, 1, 91,
      235, 93, 155, 179, 48, 117, 1, 50, 50, 1,
      3, 0, 224, 1, 0, 0, 164, 6, 176, 4,
      23, 8, 17, 11, 48, 57, 0, 0, 135, 220,
      151, 205, 1, 224, 159, 64, 149, 68, 77, 133,
      236, 167, 205, 0, 0, 0, 0, 0, 0, 2,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]
    data[26] = [1, 2, 4, 5].includes(settings.paperType) ? settings.paperType : 1
    data[28] = Math.min(settings.heightMm, 120)
    data[30] = Math.max(2, Math.min(8, settings.gap))
    return Uint8Array.from(data)
  }

  private buildPageRegBits(opts: {
    pageStart: boolean
    pageEnd: boolean
    printEnd: boolean
    deepness: number
    paperType: number
  }): Uint8Array {
    const buf = new Uint8Array(2)
    if (opts.pageStart) buf[0] |= 2
    if (opts.pageEnd) buf[0] |= 4
    if (opts.printEnd) buf[0] |= 8
    buf[0] &= 0x0f
    buf[1] = ((opts.paperType & 0x03) << 6) | ((opts.deepness & 0x0f) << 2)
    return buf
  }

  private computeChecksum(buffer: Uint8Array, dataLength: number): number {
    let sum = 0
    for (let i = 2; i < 14; i++) sum += buffer[i]
    const blocks = Math.floor(dataLength / 256)
    for (let i = 0; i < blocks; i++) sum += buffer[(i + 1) * 256 - 1]
    return sum & 0xffff
  }

  private imageDataToMonoBytes(
    imageData: ImageData,
    width: number,
    height: number,
    threshold: number
  ): { bytes: Uint8Array; bytesPerRow: number } {
    const bytesPerRow = Math.ceil(width / 8)
    const bytes = new Uint8Array(bytesPerRow * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        // Correct RGB grayscale (R=idx, G=idx+1, B=idx+2)
        const luma =
          0.3 * imageData.data[idx] +
          0.59 * imageData.data[idx + 1] +
          0.11 * imageData.data[idx + 2]
        if (luma < threshold) {
          bytes[y * bytesPerRow + Math.floor(x / 8)] |= 1 << (x % 8)
        }
      }
    }
    return { bytes, bytesPerRow }
  }

  private buildPrintBuffers(labelCanvas: HTMLCanvasElement, settings: PrinterSettings): Uint8Array[] {
    // Place label canvas centered in raw dot space (maxDotValue wide)
    const rawCanvas = document.createElement('canvas')
    rawCanvas.width = settings.maxDotValue
    rawCanvas.height = labelCanvas.height
    const rawCtx = rawCanvas.getContext('2d')!
    rawCtx.fillStyle = '#ffffff'
    rawCtx.fillRect(0, 0, rawCanvas.width, rawCanvas.height)
    const offsetX = Math.round((rawCanvas.width - labelCanvas.width) / 2 + settings.offsetH)
    const offsetY = Math.round((rawCanvas.height - labelCanvas.height) / 2 + settings.offsetV)
    rawCtx.drawImage(labelCanvas, offsetX, offsetY)

    // Flip horizontally — printer scans right-to-left
    const flippedCanvas = document.createElement('canvas')
    flippedCanvas.width = rawCanvas.width
    flippedCanvas.height = rawCanvas.height
    const flippedCtx = flippedCanvas.getContext('2d')!
    flippedCtx.save()
    flippedCtx.scale(-1, 1)
    flippedCtx.drawImage(rawCanvas, -rawCanvas.width, 0)
    flippedCtx.restore()

    const imageData = flippedCtx.getImageData(0, 0, flippedCanvas.width, flippedCanvas.height)
    const { bytes, bytesPerRow } = this.imageDataToMonoBytes(
      imageData,
      flippedCanvas.width,
      flippedCanvas.height,
      240
    )

    const rowsPerChunk = Math.floor(4074 / bytesPerRow)
    const bufferCount = Math.ceil(flippedCanvas.height / rowsPerChunk)
    const buffers: Uint8Array[] = []

    for (let idx = 0; idx < bufferCount; idx++) {
      const rows =
        idx === bufferCount - 1
          ? flippedCanvas.height - rowsPerChunk * idx
          : rowsPerChunk
      const buf = new Uint8Array(4096)
      const pageReg = this.buildPageRegBits({
        pageStart: idx === 0,
        pageEnd: idx === bufferCount - 1,
        printEnd: idx === bufferCount - 1,
        deepness: settings.deepness,
        paperType: settings.paperType,
      })
      buf[2] = pageReg[0]
      buf[3] = pageReg[1]
      buf[4] = rows & 0xff
      buf[5] = (rows >> 8) & 0xff
      buf[6] = bytesPerRow & 0xff
      buf[8] = 1
      buf[10] = 1
      const start = idx * rowsPerChunk * bytesPerRow
      buf.set(bytes.slice(start, start + rows * bytesPerRow), 14)
      const dataLength = rows * bytesPerRow + 14
      const checksum = this.computeChecksum(buf, dataLength)
      buf[0] = checksum & 0xff
      buf[1] = (checksum >> 8) & 0xff
      buffers.push(buf)
    }

    return buffers
  }

  private mergeBuffers(buffers: Uint8Array[], count: number): Uint8Array {
    const merged = new Uint8Array(count * 4096)
    for (let i = 0; i < count; i++) merged.set(buffers[i], i * 4096)
    return merged
  }

  private async lzmaCompress(data: Uint8Array): Promise<Uint8Array> {
    if (!this.lzma) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any = window.LZMA
      if (!raw) throw new Error('LZMA encoder not loaded. Ensure vendor/lzma.js is included.')
      if (typeof raw.compress === 'function') {
        // Patched build: LZMA is already an encoder object
        this.lzma = raw
      } else if (typeof raw === 'function') {
        // Standard browser build: LZMA(workerPath) returns an encoder
        this.lzma = raw('/vendor/lzma_worker.js') as Window['LZMA']
      } else {
        throw new Error('LZMA encoder not loaded. Ensure vendor/lzma.js is included.')
      }
      if (!this.lzma?.compress) throw new Error('LZMA encoder initialisation failed.')
    }
    const mode = { s: 13, f: 128, m: 1 }
    return new Promise((resolve, reject) => {
      this.lzma!.compress(Array.from(data), mode, (result, error) => {
        if (error) { reject(error); return }
        resolve(Uint8Array.from(result))
      })
    })
  }

  private findReportId(device: HIDDevice, type: 'input' | 'output'): number {
    for (const collection of device.collections ?? []) {
      const reports = type === 'input' ? collection.inputReports : collection.outputReports
      for (const report of reports ?? []) {
        if (typeof report.reportId === 'number') return report.reportId
      }
    }
    return 0
  }

  private enqueueReport(data: Uint8Array): void {
    if (this.readWaiters.length > 0) {
      this.readWaiters.shift()!(data)
    } else {
      this.readQueue.push(data)
    }
  }

  private readReport(): Promise<Uint8Array> {
    if (this.readQueue.length > 0) return Promise.resolve(this.readQueue.shift()!)
    return new Promise((resolve) => this.readWaiters.push(resolve))
  }

  private async bulkWrite(data: Uint8Array): Promise<void> {
    for (let offset = 0; offset < data.length; offset += HID_OUT_PAYLOAD) {
      const chunk = data.slice(offset, offset + HID_OUT_PAYLOAD)
      const report = new Uint8Array(HID_OUT_PAYLOAD)
      report.set(chunk)
      await this.device!.sendReport(this.reportIdOut, report)
    }
  }

  private async bulkRead(length: number): Promise<Uint8Array> {
    const out = new Uint8Array(length)
    let offset = 0
    while (offset < length) {
      const report = await this.readReport()
      const payload = report.length > HID_IN_SKIP ? report.slice(HID_IN_SKIP) : new Uint8Array()
      const copyLen = Math.min(payload.length, length - offset)
      out.set(payload.slice(0, copyLen), offset)
      offset += copyLen
    }
    return out
  }

  private async vendorReq(wIndex: number, wValue: number): Promise<Uint8Array> {
    const header = new Uint8Array([
      0xc0, 0x40, (wValue >> 8) & 0xff, wValue & 0xff, wIndex, 0x00, 0x08, 0x00,
    ])
    await this.bulkWrite(header)
    return this.bulkRead(8)
  }

  private async vendorReq2(wIndex: number, wValue1: number, wValue2: number): Promise<Uint8Array> {
    const header = new Uint8Array([
      0xc0, 0x40, (wValue1 >> 8) & 0xff, wValue1 & 0xff, wIndex, 0x00, 0x08, 0x00,
      (wValue2 >> 8) & 0xff, wValue2 & 0xff,
    ])
    await this.bulkWrite(header)
    return this.bulkRead(8)
  }

  private parsePrinterFlags(bytes: Uint8Array) {
    return {
      bufFull: !!(bytes[0] & 1),
      deviceBusy: !!(bytes[1] & 4),
      headTempHigh: !!(bytes[1] & 8),
      lidOpen: !!(bytes[2] & 8),
      labelNotInstalled: !!(bytes[3] & 1),
      printing: !!(bytes[2] & 64),
    }
  }

  private async waitComOk(): Promise<void> {
    for (let i = 0; i < 20; i++) {
      await delay(500)
      const reply = await this.vendorReq(CMD_INQUIRY_STA, 0)
      if (!this.parsePrinterFlags(reply).deviceBusy) return
    }
    throw new Error('Device busy timeout')
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
