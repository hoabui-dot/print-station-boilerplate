import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const source = await readFile(new URL('../src/lib/labelTemplateModel.ts', import.meta.url), 'utf8')
const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2020' })
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`
const api = await import(moduleUrl)

const fields = ['serial_number', 'product_code', 'trace_id']
const draft = api.draftFromLegacy({
  width: 50,
  height: 30,
  dpi: 203,
  contentMode: 'BARCODE',
  elements: [{
    id: 'barcode-serial', type: 'barcode', x: 5, y: 5, width: 390, height: 105,
    binding: 'serial_number', encodedFields: fields,
  }],
})
const barcode = draft.elements.find(element => element.type === 'barcode')
assert.deepEqual(barcode.encodedFields, fields)
assert.deepEqual(JSON.parse(api.draftToLegacyJson(draft)).elements[0].encodedFields, fields)

const legacy = api.draftFromLegacy({
  width: 50,
  height: 30,
  dpi: 203,
  elements: [{
    id: 'barcode-serial', type: 'barcode', x: 5, y: 5, width: 390, height: 105,
    binding: 'serial_number',
    payloadTemplate: '{"serial_number":"{serial_number}","product_code":"{product_code}"}',
  }],
})
assert.deepEqual(legacy.elements.find(element => element.type === 'barcode').encodedFields, ['serial_number', 'product_code'])
console.log('label-template-model encoded field tests passed')
