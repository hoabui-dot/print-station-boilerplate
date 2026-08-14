import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { transform } from 'esbuild'

const source = await readFile(new URL('../src/lib/iconZpl.ts', import.meta.url), 'utf8')
const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2020' })
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`
const api = await import(moduleUrl)

const make = (width, height, fn) => api.packMonochromeBitmap(width, height, Array.from({ length: width * height }, (_, i) => fn(i % width, Math.floor(i / width))))
const roundTrip = bitmap => {
  const hex = api.bytesToHex(bitmap.data)
  const decoded = api.hexToBytes(hex, bitmap.data.length)
  const decodedBitmap = { ...bitmap, data: decoded }
  assert.deepEqual(api.decodeMonochromeBitmap(decodedBitmap), api.decodeMonochromeBitmap(bitmap))
}

const oneByEight = make(1, 8, (_x, y) => y === 0)
assert.equal(oneByEight.data[0], 0x80)
roundTrip(oneByEight)

const eightByOne = make(8, 1, (x) => x === 0)
assert.equal(eightByOne.data[0], 0x80)
roundTrip(eightByOne)

const checker = make(8, 8, (x, y) => (x + y) % 2 === 0)
assert.equal(api.bytesToHex(checker.data), 'AA55AA55AA55AA55')
roundTrip(checker)

for (const width of [1, 7, 8, 9, 15, 16, 17, 79, 80, 81]) {
  const bitmap = make(width, 3, (x, y) => x === width - 1 && y === 2)
  assert.equal(bitmap.rowBytes, Math.ceil(width / 8))
  assert.equal(bitmap.data.length, bitmap.rowBytes * 3)
  roundTrip(bitmap)
}

const solidWhite = make(8, 8, () => false)
const solidBlack = make(8, 8, () => true)
assert.equal(api.bytesToHex(solidWhite.data), '0000000000000000')
assert.equal(api.bytesToHex(solidBlack.data), 'FFFFFFFFFFFFFFFF')

const zpl = api.buildGfaZpl(eightByOne, 80, 80, 0, 0)
const parsed = api.parseGfaPayload(zpl)
assert.equal(parsed.totalBytes, 1)
assert.equal(parsed.rowBytes, 1)
assert.equal(parsed.hex, '80')
assert.equal(zpl.includes('gk'), false)

console.log(JSON.stringify({ passed: 6 + 10, failed: 0, cases: ['8x1', '1x8', 'checkerboard', 'non-byte-aligned-widths', 'solid-white', 'solid-black', 'gfa-parameters'] }))
