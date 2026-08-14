export type MonochromeBitmap = {
  width: number
  height: number
  rowBytes: number
  data: Uint8Array
}

export function packMonochromeBitmap(width: number, height: number, pixels: Iterable<boolean>): MonochromeBitmap {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error('INVALID_GRAPHIC_DIMENSIONS')
  }
  const rowBytes = Math.ceil(width / 8)
  const data = new Uint8Array(rowBytes * height)
  let index = 0
  for (const black of pixels) {
    if (index >= width * height) break
    if (black) data[Math.floor(index / width) * rowBytes + Math.floor((index % width) / 8)] |= 0x80 >> (index % 8)
    index += 1
  }
  if (index !== width * height) throw new Error('BITMAP_SIZE_MISMATCH')
  return { width, height, rowBytes, data }
}

export function bytesToHex(data: Uint8Array): string {
  let result = ''
  for (const byte of data) result += byte.toString(16).padStart(2, '0').toUpperCase()
  return result
}

export function hexToBytes(hex: string, expectedBytes?: number): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) throw new Error('HEX_ENCODING_INVALID')
  const data = new Uint8Array(hex.length / 2)
  for (let i = 0; i < data.length; i += 1) data[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  if (expectedBytes !== undefined && data.length !== expectedBytes) throw new Error('BITMAP_SIZE_MISMATCH')
  return data
}

export function decodeMonochromeBitmap(bitmap: MonochromeBitmap): boolean[] {
  const pixels: boolean[] = []
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      pixels.push((bitmap.data[y * bitmap.rowBytes + Math.floor(x / 8)] & (0x80 >> (x % 8))) !== 0)
    }
  }
  return pixels
}

export function buildGfaZpl(bitmap: MonochromeBitmap, labelWidthDots: number, labelHeightDots: number, x: number, y: number): string {
  const totalBytes = bitmap.rowBytes * bitmap.height
  if (bitmap.data.length !== totalBytes) throw new Error('BITMAP_SIZE_MISMATCH')
  const hex = bytesToHex(bitmap.data)
  if (hex.length !== totalBytes * 2) throw new Error('HEX_ENCODING_INVALID')
  return `^XA\n^PW${labelWidthDots}\n^LL${labelHeightDots}\n^FO${x},${y}^GFA,${totalBytes},${totalBytes},${bitmap.rowBytes},${hex}^FS\n^XZ`
}

export function parseGfaPayload(zpl: string): { totalBytes: number; rowBytes: number; hex: string } {
  const match = zpl.match(/\^GFA,(\d+),(\d+),(\d+),([0-9A-Fa-f]+)/)
  if (!match) throw new Error('ZPL_GRAPHIC_ENCODING_FAILED')
  const totalBytes = Number(match[1])
  const expectedBytes = Number(match[2])
  const rowBytes = Number(match[3])
  const hex = match[4]
  if (totalBytes !== expectedBytes || hex.length !== totalBytes * 2) throw new Error('BITMAP_SIZE_MISMATCH')
  return { totalBytes, rowBytes, hex }
}
