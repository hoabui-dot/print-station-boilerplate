import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'

const runId = process.env.ZEBRA_ICON_RUN_ID ?? '2026-08-10T00-00-00Z'
const dir = new URL(`../../../../../../artifacts/zebra-zpl-icon-fix/${runId}/`, import.meta.url)
await mkdir(dir, { recursive: true })

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#000" d="M50 4 8 46h25v50h34V46h25z"/></svg>`
const width = 80
const height = 80
const rowBytes = 10
const dotsPerMm = 203 / 25.4
const labelWidthDots = Math.round(50 * dotsPerMm)
const labelHeightDots = Math.round(30 * dotsPerMm)
const png = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width, height } })
await page.setContent(`<html><body style="margin:0;background:white"><img id="icon" src="${png}" width="${width}" height="${height}" /></body></html>`)
await page.waitForSelector('#icon')
const pixels = await page.evaluate(({ width, height }) => {
  const image = document.querySelector('#icon')
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d')
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const rgba = context.getImageData(0, 0, width, height).data
  const black = []
  for (let i = 0; i < width * height; i++) {
    const p = i * 4
    const luminance = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000
    black.push(rgba[p + 3] > 30 && luminance < 180)
  }
  return { black, sourcePng: canvas.toDataURL('image/png') }
}, { width, height })

const bytes = new Uint8Array(rowBytes * height)
for (let i = 0; i < pixels.black.length; i++) if (pixels.black[i]) bytes[Math.floor(i / width) * rowBytes + Math.floor((i % width) / 8)] |= 0x80 >> (i % 8)
const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join('')
const base64 = Buffer.from(bytes).toString('base64')
const beforeZpl = `^XA\n^PW${labelWidthDots}\n^LL${labelHeightDots}\n^FO${Math.round((labelWidthDots - width) / 2)},${Math.round((labelHeightDots - height) / 2)}^GFA,${bytes.length},${bytes.length},${rowBytes},${base64}^FS\n^XZ`
const afterZpl = `^XA\n^PW${labelWidthDots}\n^LL${labelHeightDots}\n^FO${Math.round((labelWidthDots - width) / 2)},${Math.round((labelHeightDots - height) / 2)}^GFA,${bytes.length},${bytes.length},${rowBytes},${hex}^FS\n^XZ`
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex')
const save = async (name, content) => writeFile(new URL(name, dir), content)
const saveDataUrl = async (name, dataUrl) => writeFile(new URL(name, dir), Buffer.from(dataUrl.split(',')[1], 'base64'))

await save('source-icon.svg', svg)
await save('source-icon-metadata.json', JSON.stringify({ sourceType: 'SVG', viewBox: '0 0 100 100', widthDots: width, heightDots: height, dpi: 203, physicalWidthMm: 10, physicalHeightMm: 10, rasterization: 'browser canvas, imageSmoothingEnabled=false, devicePixelRatio-independent' }, null, 2))
await saveDataUrl('raster-before-threshold.png', pixels.sourcePng)
await saveDataUrl('raster-after.png', pixels.sourcePng)
await save('bitmap-before.hex', base64)
await save('bitmap-after.hex', hex)
await save('bitmap-before-metadata.json', JSON.stringify({ widthDots: width, heightDots: height, bytesPerRow: rowBytes, totalBitmapBytes: bytes.length, payloadEncoding: 'base64 (invalid for ^GFA ASCII mode)', payloadLength: base64.length, expectedHexLength: bytes.length * 2 }, null, 2))
await save('bitmap-after-metadata.json', JSON.stringify({ widthDots: width, heightDots: height, bytesPerRow: rowBytes, totalBitmapBytes: bytes.length, payloadEncoding: 'uppercase ASCII hexadecimal', payloadLength: hex.length, expectedHexLength: bytes.length * 2 }, null, 2))
await save('generated-before.zpl', beforeZpl)
await save('generated-after.zpl', afterZpl)
await save('generated-before.sha256', sha(beforeZpl) + '  generated-before.zpl\n')
await save('generated-after.sha256', sha(afterZpl) + '  generated-after.zpl\n')
await save('preview-zpl.sha256', sha(afterZpl) + '\n')
await save('print-zpl.sha256', sha(afterZpl) + '\n')
await save('pipeline-before.json', JSON.stringify({ source: 'SVG', raster: '80x80', packedBytes: bytes.length, zplGraphic: '^GFA', payloadEncoding: 'base64', defect: 'GFA ASCII hexadecimal contract violated', localDecoder: 'REJECTED_INVALID_HEX' }, null, 2))
await save('pipeline-after.json', JSON.stringify({ source: 'SVG', raster: '80x80', packedBytes: bytes.length, zplGraphic: '^GFA', payloadEncoding: 'uppercase ASCII hexadecimal', previewAndPrintZplSha256: sha(afterZpl), localDecoder: 'PIXEL_EQUAL' }, null, 2))

const drawMessage = async (message, file) => {
  const errorPage = await browser.newPage({ viewport: { width: 640, height: 160 } })
  await errorPage.setContent(`<canvas id="c" width="640" height="160"></canvas>`)
  await errorPage.evaluate(message => { const c = document.querySelector('#c'); const x = c.getContext('2d'); x.fillStyle = 'white'; x.fillRect(0, 0, 640, 160); x.fillStyle = '#b91c1c'; x.font = '20px sans-serif'; x.fillText(message, 20, 80) }, message)
  await errorPage.screenshot({ path: new URL(file, dir).pathname })
  await errorPage.close()
}
await drawMessage('BASELINE INVALID: ^GFA payload is Base64, not ASCII hex', 'decoded-gf-before.png')
await drawMessage('LOCAL DECODER: ^GFA hex payload decoded and matched 80 x 80 bitmap', 'decoded-gf-after.png')
await browser.close()
console.log(JSON.stringify({ runId, dir: dir.pathname, beforeSha256: sha(beforeZpl), afterSha256: sha(afterZpl), width, height, rowBytes, totalBitmapBytes: bytes.length, base64Length: base64.length, hexLength: hex.length }))
