import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, RotateCcw, MousePointer2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { templateApi } from '@/api/client'
import { BarcodePreview } from '@/components/BarcodePreview'
import { createBarcodeDraft, createQrDraft, PRINTABLE_FIELDS, SAMPLE_DATA, type LabelElement, type LabelTemplateDraft, type TemplateFieldKey } from '@/lib/labelTemplateModel'

type Props = { value: LabelTemplateDraft; onChange: (value: LabelTemplateDraft) => void }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Shared direct-manipulation preview/inspector for Barcode and QR templates. */
export function LabelTemplateVisualEditor({ value, onChange }: Props) {
  const [printableFields, setPrintableFields] = useState(PRINTABLE_FIELDS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = value.elements.find(element => element.id === selectedId) ?? null
  const qr = value.elements.find(element => element.type === 'qr')
  const barcode = value.elements.find(element => element.type === 'barcode')
  const scale = Math.min(7, Math.max(3.2, 560 / Math.max(value.widthMm, 1)))

  useEffect(() => {
    let active = true
    void templateApi.fieldCatalog().then(response => {
      if (!active || !response.data.length) return
      setPrintableFields(response.data.map(field => ({
        ...field,
        key: field.key as TemplateFieldKey,
        source: field.source === 'MES' ? 'MES' : 'ADAPTER_DERIVED',
        allowedFor: field.allowedFor as Array<'BARCODE' | 'QR' | 'TEXT'>,
      })))
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const updateElement = (id: string, patch: Partial<LabelElement>) => onChange({
    ...value,
    elements: value.elements.map(element => element.id === id ? { ...element, ...patch } : element),
  })

  const updateNumber = (id: string, key: 'xMm' | 'yMm' | 'widthMm' | 'heightMm' | 'fontSize', raw: string) => {
    const next = Number(raw)
    if (!Number.isFinite(next)) return
    const element = value.elements.find(item => item.id === id)
    if (!element) return
    const max = key === 'xMm' ? Math.max(0, value.widthMm - element.widthMm) : key === 'yMm' ? Math.max(0, value.heightMm - element.heightMm) : key === 'widthMm' ? value.widthMm : key === 'heightMm' ? value.heightMm : 72
    updateElement(id, { [key]: clamp(next, key === 'fontSize' ? 4 : 0.5, max) })
  }

  const toggleFields = (element: LabelElement, field: TemplateFieldKey) => {
    const fields = element.type === 'barcode' ? (element.encodedFields ?? []) : (element.selectedFields ?? [])
    const selectedFields = fields.includes(field) ? fields.filter(item => item !== field) : [...fields, field]
    updateElement(element.id, element.type === 'barcode'
      ? { binding: selectedFields[0] ?? 'serial_number', encodedFields: selectedFields.length ? selectedFields : ['serial_number'] }
      : { selectedFields: selectedFields.length ? selectedFields : ['serial_number'] })
  }

  const qrFields: TemplateFieldKey[] = qr?.selectedFields?.length ? qr.selectedFields : ['serial_number']
  const barcodeFields: TemplateFieldKey[] = barcode?.encodedFields?.length ? barcode.encodedFields : [barcode?.binding ?? 'serial_number']
  const qrValue = JSON.stringify(Object.fromEntries(qrFields.map(field => [field, SAMPLE_DATA[field]])))
  const stageWidth = value.widthMm * scale
  const stageHeight = value.heightMm * scale

  return (
    <div className="grid grid-cols-[minmax(320px,1fr)_280px] gap-3 min-h-0 flex-1">
      <div className="rounded-lg border border-border bg-preview-paper p-3 overflow-auto flex items-start justify-center shadow-inner">
        <div className="relative border-2 border-muted bg-preview-paper shadow-md" style={{ width: stageWidth, height: stageHeight, minWidth: stageWidth, minHeight: stageHeight }}>
          <div className="absolute inset-0 border border-muted" aria-label="Visual editor mẫu nhãn">
            {value.elements.map(element => {
              const active = selectedId === element.id
              const common = { position: 'absolute' as const, left: element.xMm * scale, top: element.yMm * scale, width: element.widthMm * scale, height: element.heightMm * scale, outline: active ? '2px solid hsl(var(--status-info))' : '1px dashed hsl(var(--status-info) / 0.35)', outlineOffset: 2, cursor: 'pointer' }
              if (element.type === 'qr') return <button type="button" key={element.id} aria-label="Chọn QR Code" onClick={() => setSelectedId(element.id)} style={{ ...common, padding: 0, border: 0, background: 'hsl(var(--preview-paper))' }}><QRCodeSVG value={qrValue} size={Math.max(1, Math.round(Math.min(element.widthMm, element.heightMm) * scale))} level="M" includeMargin style={{ width: '100%', height: '100%', background: 'hsl(var(--preview-paper))', pointerEvents: 'none' }} /></button>
              if (element.type === 'barcode') return <button type="button" key={element.id} aria-label="Chọn Barcode" onClick={() => setSelectedId(element.id)} style={{ ...common, padding: 0, border: 0, background: 'hsl(var(--preview-paper))' }}><BarcodePreview value={SAMPLE_DATA[element.binding ?? 'serial_number']} showText={false} height={Math.max(20, element.heightMm * scale * .72)} lineWidth={1.2} className="h-full w-full" /></button>
              return <button type="button" key={element.id} aria-label={`Chọn ${element.binding ?? 'field'}`} onClick={() => setSelectedId(element.id)} style={{ ...common, display: 'flex', alignItems: 'center', justifyContent: element.align === 'right' ? 'flex-end' : element.align === 'center' ? 'center' : 'flex-start', overflow: 'hidden', fontSize: `${Math.max(4, element.fontSize ?? 9) * scale / 3}px`, color: 'hsl(var(--preview-ink))', whiteSpace: 'nowrap', background: 'transparent', border: 0 }}>{element.text ?? (element.binding ? SAMPLE_DATA[element.binding] : 'Nội dung')}</button>
            })}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-2 p-3 overflow-y-auto space-y-3">
        <div className="text-xs font-bold text-foreground uppercase tracking-wide">Thiết kế nội dung tem</div>
        {!selected && <div className="rounded border border-dashed border-border p-4 text-xs text-muted-fg"><MousePointer2 size={16} className="mb-2 text-brand" />Chọn Barcode, QR hoặc field trực tiếp trên preview để chỉnh.</div>}
        {selected && <div className="space-y-3 rounded border border-brand/30 bg-brand/5 p-2">
          <div className="text-xs font-semibold text-foreground">{selected.type === 'qr' ? 'Thông số QR Code' : selected.type === 'barcode' ? 'Cấu hình dữ liệu Barcode' : 'Field thông tin'} </div>
          {(selected.type === 'qr' || selected.type === 'barcode') && <div className="grid grid-cols-2 gap-2">{(['xMm', 'yMm', 'widthMm', 'heightMm'] as const).map(key => <label key={key} className="text-[10px] font-semibold text-muted-fg">{key === 'xMm' ? 'X' : key === 'yMm' ? 'Y' : key === 'widthMm' ? 'Chiều rộng' : 'Chiều cao'} (mm)<Input type="number" min="0.5" step="0.5" value={Number(selected[key]).toFixed(1)} onChange={event => updateNumber(selected.id, key, event.target.value)} className="mt-1 h-8 text-xs" /></label>)}</div>}
          {(selected.type === 'qr' || selected.type === 'barcode') && <div className="space-y-1.5"><div className="text-[10px] font-semibold text-muted-fg">Thông tin được mã hóa</div>{printableFields.filter(field => field.allowedFor.includes(selected.type === 'qr' ? 'QR' : 'BARCODE')).map(field => <label key={field.key} className="flex items-start gap-2 rounded border border-border bg-surface px-2 py-1.5 text-xs"><input type="checkbox" checked={(selected.type === 'qr' ? qrFields : barcodeFields).includes(field.key)} onChange={() => toggleFields(selected, field.key)} /><span><span className="block text-foreground">{field.label}</span><span className="block font-mono text-[10px] italic text-muted-fg">{field.key}</span></span></label>)}</div>}
          {selected.type === 'text' && <div className="grid grid-cols-2 gap-2">{(['xMm', 'yMm', 'fontSize'] as const).map(key => <label key={key} className="text-[10px] font-semibold text-muted-fg">{key === 'fontSize' ? 'Cỡ chữ (dot)' : key === 'xMm' ? 'X (mm)' : 'Y (mm)'}<Input type="number" min="0.5" step="0.5" value={Number(selected[key] ?? 0).toFixed(1)} onChange={event => updateNumber(selected.id, key, event.target.value)} className="mt-1 h-8 text-xs" /></label>)}</div>}
        </div>}
        <Button type="button" variant="ghost" className="w-full gap-2 text-xs" onClick={() => onChange(value.contentMode === 'BARCODE' ? createBarcodeDraft(value.widthMm, value.heightMm, value.dpi) : createQrDraft(value.widthMm, value.heightMm, value.dpi))}><RotateCcw size={13} />Đặt lại mẫu</Button>
        <div className="rounded border border-info/20 bg-info/5 p-2 text-[10px] text-muted-fg"><Check size={12} className="inline mr-1 text-success" />Chọn trực tiếp phần tử trên preview để xem thông số và field tương ứng.</div>
      </div>
    </div>
  )
}
