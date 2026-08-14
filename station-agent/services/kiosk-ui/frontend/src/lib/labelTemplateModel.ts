export type TemplateContentMode = 'BARCODE' | 'QR'
export type TemplateFieldKey =
  | 'production_order'
  | 'product_code'
  | 'serial_number'
  | 'trace_id'
  | 'quantity'
  | 'requested_quantity'
  | 'wms_payload'

export type PrintableField = {
  key: TemplateFieldKey
  label: string
  source: 'MES' | 'ADAPTER_DERIVED'
  authoritative: boolean
  allowedFor: Array<'BARCODE' | 'QR' | 'TEXT'>
  sampleValue: string
}

export type LabelElement = {
  id: string
  type: 'barcode' | 'qr' | 'text'
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
  binding?: TemplateFieldKey
  selectedFields?: TemplateFieldKey[]
  encodedFields?: TemplateFieldKey[]
  text?: string
  fontSize?: number
  visibleCode?: boolean
  hexEncoded?: boolean
  align?: 'left' | 'center' | 'right'
}

export type LabelTemplateDraft = {
  schemaVersion: 2
  contentMode: TemplateContentMode
  widthMm: number
  heightMm: number
  dpi: 203 | 300 | 600
  elements: LabelElement[]
}

export const PRINTABLE_FIELDS: PrintableField[] = [
  { key: 'serial_number', label: 'Số serial', source: 'MES', authoritative: true, allowedFor: ['BARCODE', 'QR', 'TEXT'], sampleValue: 'WO-20260810-0001-001' },
  { key: 'product_code', label: 'Mã sản phẩm', source: 'MES', authoritative: true, allowedFor: ['BARCODE', 'QR', 'TEXT'], sampleValue: 'FG-WS-CM01' },
  { key: 'production_order', label: 'Lệnh sản xuất', source: 'MES', authoritative: true, allowedFor: ['BARCODE', 'QR', 'TEXT'], sampleValue: 'WO-20260810-0001' },
  { key: 'trace_id', label: 'Mã truy xuất', source: 'MES', authoritative: true, allowedFor: ['BARCODE', 'QR', 'TEXT'], sampleValue: 'label-job-001' },
  { key: 'quantity', label: 'Sản lượng', source: 'MES', authoritative: false, allowedFor: ['QR', 'TEXT'], sampleValue: '100' },
  { key: 'requested_quantity', label: 'Sản lượng yêu cầu', source: 'MES', authoritative: false, allowedFor: ['QR', 'TEXT'], sampleValue: '100' },
  { key: 'wms_payload', label: 'Toàn bộ payload WMS', source: 'MES', authoritative: true, allowedFor: ['BARCODE'], sampleValue: '{"material_code":"RM-001","quantity":10}' },
]

export const SAMPLE_DATA: Record<TemplateFieldKey, string> = Object.fromEntries(
  PRINTABLE_FIELDS.map(field => [field.key, field.sampleValue]),
) as Record<TemplateFieldKey, string>

const asNumber = (value: unknown, fallback: number) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const dotsToMm = (value: number, dpi: number) => value * 25.4 / dpi
const mmToDots = (value: number, dpi: number) => Math.round(value * dpi / 25.4)

export function createBlankDraft(widthMm = 50, heightMm = 30, dpi: 203 | 300 | 600 = 203): LabelTemplateDraft {
  return createBarcodeDraft(widthMm, heightMm, dpi)
}

export function createBarcodeDraft(widthMm = 50, heightMm = 30, dpi: 203 | 300 | 600 = 203): LabelTemplateDraft {
  return fitDraftToLabel({
    schemaVersion: 2,
    contentMode: 'BARCODE',
    widthMm,
    heightMm,
    dpi,
    elements: [
      { id: 'barcode-1', type: 'barcode', xMm: 5, yMm: 5, widthMm: Math.max(30, widthMm - 10), heightMm: Math.min(14, heightMm / 2), binding: 'serial_number', visibleCode: false, align: 'center' },
      { id: 'barcode-code-id', type: 'text', xMm: 5, yMm: Math.max(20, heightMm - 7), widthMm: Math.max(30, widthMm - 10), heightMm: 5, binding: 'serial_number', fontSize: 9, align: 'center' },
    ],
  }, widthMm, heightMm)
}

/** Keep persisted layouts valid when a user changes the label dimensions. */
export function fitDraftToLabel(draft: LabelTemplateDraft, widthMm: number, heightMm: number): LabelTemplateDraft {
  const safeWidth = Math.max(0.1, Number(widthMm) || 0.1)
  const safeHeight = Math.max(0.1, Number(heightMm) || 0.1)
  return {
    ...draft,
    widthMm: safeWidth,
    heightMm: safeHeight,
    elements: draft.elements.map(element => {
      const elementWidth = Math.min(Math.max(0.1, Number(element.widthMm) || 0.1), safeWidth)
      const elementHeight = Math.min(Math.max(0.1, Number(element.heightMm) || 0.1), safeHeight)
      return {
        ...element,
        widthMm: elementWidth,
        heightMm: elementHeight,
        xMm: Math.min(Math.max(0, Number(element.xMm) || 0), Math.max(0, safeWidth - elementWidth)),
        yMm: Math.min(Math.max(0, Number(element.yMm) || 0), Math.max(0, safeHeight - elementHeight)),
      }
    }),
  }
}

export function createQrDraft(widthMm = 50, heightMm = 30, dpi: 203 | 300 | 600 = 203): LabelTemplateDraft {
  return fitDraftToLabel({
    schemaVersion: 2,
    contentMode: 'QR',
    widthMm,
    heightMm,
    dpi,
    elements: [
      { id: 'qr-1', type: 'qr', xMm: 4, yMm: 4, widthMm: Math.min(22, widthMm - 8), heightMm: Math.min(22, heightMm - 8), selectedFields: ['serial_number', 'product_code'], align: 'center' },
      { id: 'qr-product-code', type: 'text', xMm: Math.min(28, widthMm / 2), yMm: 7, widthMm: Math.max(15, widthMm - Math.min(33, widthMm / 2)), heightMm: 5, binding: 'product_code', align: 'left' },
      { id: 'qr-serial', type: 'text', xMm: Math.min(28, widthMm / 2), yMm: 14, widthMm: Math.max(15, widthMm - Math.min(33, widthMm / 2)), heightMm: 5, binding: 'serial_number', align: 'left' },
    ],
  }, widthMm, heightMm)
}

export function draftFromLegacy(raw: unknown, widthMm = 50, heightMm = 30, dpi: 203 | 300 | 600 = 203): LabelTemplateDraft {
  const root = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const elements = Array.isArray(root.elements) ? root.elements : []
  const sourceDpi = (asNumber(root.dpi, dpi) === 300 || asNumber(root.dpi, dpi) === 600 ? asNumber(root.dpi, dpi) : 203)
  const coordinateUnit = root.coordinateUnit === 'mm' ? 'mm' : 'dots'
  const toMm = (value: unknown, fallbackMm: number) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return fallbackMm
    return coordinateUnit === 'dots' ? dotsToMm(numeric, sourceDpi) : numeric
  }
  const converted: LabelElement[] = elements.map((item, index) => {
    const source = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const type = source.type === 'qr' || source.type === 'qrcode' ? 'qr' : source.type === 'barcode' ? 'barcode' : 'text'
    const binding = typeof source.binding === 'string' && PRINTABLE_FIELDS.some(field => field.key === source.binding)
      ? source.binding as TemplateFieldKey
      : undefined
    const payload = typeof source.payloadTemplate === 'string' ? source.payloadTemplate : ''
    const payloadFields = [...payload.matchAll(/\{([^{}]+)\}/g)]
      .map(match => match[1] as TemplateFieldKey)
      .filter(key => PRINTABLE_FIELDS.some(field => field.key === key))
    const encodedFields = Array.isArray(source.encodedFields)
      ? source.encodedFields
        .filter((field): field is string => typeof field === 'string')
        .map(field => field as TemplateFieldKey)
        .filter(key => PRINTABLE_FIELDS.some(field => field.key === key))
      : []
    const barcodeFields = encodedFields.length
      ? encodedFields
      : payloadFields.length
        ? payloadFields
        : binding
          ? [binding]
          : undefined
    return {
      id: typeof source.id === 'string' ? source.id : `${type}-${index + 1}`,
      type,
      xMm: toMm(source.x, 5),
      yMm: toMm(source.y, 5),
      widthMm: toMm(source.width, type === 'text' ? Math.max(30, widthMm - 10) : type === 'qr' ? 20 : Math.max(30, widthMm - 10)),
      heightMm: toMm(source.height, type === 'text' ? 5 : type === 'qr' ? 20 : 14),
      binding,
      selectedFields: payloadFields.length ? payloadFields : binding ? [binding] : type === 'qr' ? ['serial_number'] : undefined,
      encodedFields: type === 'barcode' ? barcodeFields : undefined,
      text: typeof source.text === 'string' ? source.text : undefined,
      fontSize: asNumber(source.fontSize, type === 'text' ? 9 : 0) || undefined,
      visibleCode: source.visibleCode !== false,
      hexEncoded: source.hexEncoded === true,
      align: source.align === 'left' || source.align === 'right' ? source.align : 'center',
    }
  })
  const hasQr = converted.some(element => element.type === 'qr')
  const contentMode = hasQr ? 'QR' : 'BARCODE'
  const barcode = converted.find(element => element.type === 'barcode')
  const barcodeCode = converted.find(element => element.type === 'text' && (element.id === 'barcode-code-id' || element.id === 'barcode-code'))
  const isWmsPayloadBarcode = barcode?.binding === 'wms_payload'
  const barcodeElements = barcode
    ? [
        { ...barcode, encodedFields: (barcode.encodedFields?.length ? barcode.encodedFields : barcode.binding ? [barcode.binding] : ['serial_number']) as TemplateFieldKey[] },
        !isWmsPayloadBarcode && barcodeCode
          ? { ...barcodeCode, id: 'barcode-code-id', binding: barcodeCode.binding ?? barcode.binding ?? 'serial_number' }
          : !isWmsPayloadBarcode ? { id: 'barcode-code-id', type: 'text' as const, xMm: 5, yMm: Math.max(20, heightMm - 7), widthMm: Math.max(30, widthMm - 10), heightMm: 5, binding: barcode.binding ?? 'serial_number', fontSize: 9, align: 'center' as const } : null,
      ]
    : converted
  return {
    schemaVersion: 2,
    contentMode,
    widthMm: asNumber(root.width, widthMm),
    heightMm: asNumber(root.height, heightMm),
    dpi: sourceDpi as 203 | 300 | 600,
    elements: contentMode === 'BARCODE'
      ? (barcodeElements.filter((element): element is LabelElement => element !== null).length ? barcodeElements.filter((element): element is LabelElement => element !== null) : createBarcodeDraft(widthMm, heightMm, dpi).elements)
      : (converted.length ? converted : createQrDraft(widthMm, heightMm, dpi).elements),
  }
}

export function draftToLegacyJson(draft: LabelTemplateDraft): string {
  const elements = draft.elements.map(element => {
    if (element.type === 'barcode') {
      const encodedFields = element.encodedFields?.length ? element.encodedFields : [element.binding ?? 'serial_number']
      const payloadTemplate = encodedFields.length > 1
        ? `{${encodedFields.map(field => `"${field}":"{${field}}"`).join(',')}}`
        : undefined
      return {
        id: element.id, type: 'barcode', x: mmToDots(element.xMm, draft.dpi), y: mmToDots(element.yMm, draft.dpi),
        width: mmToDots(element.widthMm, draft.dpi), height: mmToDots(element.heightMm, draft.dpi), symbology: 'CODE128',
        binding: element.binding ?? 'serial_number', defaultValue: SAMPLE_DATA[element.binding ?? 'serial_number'],
        encodedFields, payloadTemplate, humanReadable: false, hexEncoded: element.hexEncoded === true, align: element.align ?? 'center',
      }
    }
    if (element.type === 'qr') {
      const fields = element.selectedFields?.length ? element.selectedFields : ['serial_number']
      const payloadTemplate = `{${fields.map(field => `"${field}":"{${field}}"`).join(',')}}`
      return {
        id: element.id, type: 'qr', x: mmToDots(element.xMm, draft.dpi), y: mmToDots(element.yMm, draft.dpi),
        width: mmToDots(element.widthMm, draft.dpi), height: mmToDots(element.heightMm, draft.dpi), magnification: 4,
        fields, payloadTemplate,
      }
    }
    return {
      id: element.id, type: 'text', x: mmToDots(element.xMm, draft.dpi), y: mmToDots(element.yMm, draft.dpi),
      width: mmToDots(element.widthMm, draft.dpi), height: mmToDots(element.heightMm, draft.dpi), fontSize: element.fontSize ?? 9,
      binding: element.binding, text: element.text, align: element.align ?? 'left',
      defaultValue: element.binding ? SAMPLE_DATA[element.binding] : element.text ?? '',
    }
  })
  return JSON.stringify({ schemaVersion: 2, coordinateUnit: 'dots', contentMode: draft.contentMode, width: draft.widthMm, height: draft.heightMm, dpi: draft.dpi, elements }, null, 2)
}

export function validateDraft(draft: LabelTemplateDraft): string[] {
  const errors: string[] = []
  if (draft.widthMm <= 0 || draft.widthMm > 500) errors.push('Chiều rộng tem phải lớn hơn 0 và không vượt quá 500 mm.')
  if (draft.heightMm <= 0 || draft.heightMm > 500) errors.push('Chiều cao tem phải lớn hơn 0 và không vượt quá 500 mm.')
  if (!draft.elements.length) errors.push('Tem phải có ít nhất một thành phần.')
  for (const element of draft.elements) {
    if (element.widthMm <= 0 || element.heightMm <= 0) errors.push(`Thành phần ${element.id} phải có kích thước lớn hơn 0.`)
    if (element.xMm < 0 || element.yMm < 0 || element.xMm + element.widthMm > draft.widthMm || element.yMm + element.heightMm > draft.heightMm) {
      errors.push(`Thành phần ${element.id} đang nằm ngoài vùng tem.`)
    }
    if ((element.type === 'barcode' || element.type === 'qr') && !element.binding && !element.selectedFields?.length) errors.push(`${element.type === 'barcode' ? 'Barcode' : 'QR Code'} phải có dữ liệu được chọn.`)
  }
  return errors
}
