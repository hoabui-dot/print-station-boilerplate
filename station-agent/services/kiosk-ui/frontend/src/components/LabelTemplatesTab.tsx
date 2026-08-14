import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { templateApi } from '@/api/client'
import { LabelPreview } from '@/components/LabelPreview'
import { IconAssetsTab } from '@/components/IconAssetsTab'
import { LabelTemplateVisualEditor } from '@/components/LabelTemplateVisualEditor'
import { createBarcodeDraft, createBlankDraft, createQrDraft, draftFromLegacy, draftToLegacyJson, fitDraftToLabel, validateDraft, type LabelTemplateDraft } from '@/lib/labelTemplateModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table as TableEl, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  FileText, Plus, Search, RefreshCw, Star, Archive, CheckCircle2,
  Download, Upload, Copy, Trash2, Edit2, Eye, Printer as PrinterIcon,
  History, AlertTriangle, Check, Settings2, Barcode, QrCode, Image as ImageIcon,
} from 'lucide-react'
import { CommonTabs, DataTable } from '@/components/common'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LabelTemplate {
  id: string
  name: string
  description?: string
  note?: string
  templateCode?: string
  category?: string
  orientation?: string
  revision?: string
  supportedBarcodeTypes?: string
  supportedPrinterModels?: string
  compatibleStationTypes?: string
  dpi: number
  labelWidth: number
  labelHeight: number
  templateJson: object
  version: number
  status: 'draft' | 'published' | 'archived'
  isDefault: boolean
  isActive: boolean
  createdBy?: string
  updatedBy?: string
  createdAt: string
  updatedAt: string
  // N-Up layout
  layoutType: '1UP' | '2UP' | '3UP'
  sheetColumns: number
  sheetRows: number
  gapMm: number
}

interface PrinterAssignment {
  id: string
  printerCode: string
  templateId: string
  templateName?: string
  assignedAt: string
}

function WmsBarcodeTemplateTab({ template, onEdit }: { template: LabelTemplate | null; onEdit: () => void }) {
  return <div className="flex flex-col gap-6">
    <div className="rounded-xl border border-info/25 bg-info/5 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap"><div className="flex items-start gap-3"><Barcode size={22} className="mt-0.5 text-info" /><div>
        <h2 className="font-semibold text-foreground">Barcode WMS</h2>
        <p className="mt-1 text-[13px] text-muted-fg">Chỉ có một template CODE128 cho request từ WMS. WMS chỉ cung cấp payload; kích thước, vị trí và cách mã hóa do Print Station quản lý.</p>
      </div></div><Button variant="outline" size="sm" onClick={onEdit} disabled={!template} className="gap-2"><Edit2 size={15} /> Chỉnh sửa barcode</Button></div>
    </div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-xl border border-border bg-card p-6 [box-shadow:var(--shadow-sm)]">
        <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-foreground">Template đang sử dụng</h2><p className="mt-1 text-xs text-muted-fg">Mọi request WMS đều render từ template này, không dùng style gửi kèm request.</p></div><span className="rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">{template?.status === 'published' ? 'Phát hành' : 'Chưa sẵn sàng'}</span></div>
        {template ? <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><span className="text-muted-fg">Tên template</span><p className="font-semibold text-foreground">{template.name}</p></div><div><span className="text-muted-fg">Mã template</span><p className="font-mono text-foreground">{template.templateCode}</p></div><div><span className="text-muted-fg">Kích thước</span><p className="font-mono text-foreground">{template.labelWidth} × {template.labelHeight} mm</p></div><div><span className="text-muted-fg">Phiên bản</span><p className="font-mono text-foreground">v{template.version} · {template.dpi} DPI</p></div></div> : <p className="mt-5 text-sm text-warning">Không tìm thấy template WMS. Hãy chạy seed của printer station.</p>}
      </div>
      <div className="rounded-xl border border-border bg-card p-6 [box-shadow:var(--shadow-sm)]"><h2 className="font-semibold text-foreground">Xem trước</h2><p className="mt-1 text-xs text-muted-fg">Payload mẫu được mã hóa trong một barcode duy nhất.</p><div className="mt-5 flex aspect-[2/1] items-center justify-center overflow-hidden rounded border-2 border-dashed border-border bg-white p-4"><div className="h-2/3 w-4/5" style={{ background: 'repeating-linear-gradient(90deg,#111 0,#111 2px,transparent 2px,transparent 5px)' }} aria-label="Barcode CODE128 WMS" /></div><div className="mt-4 grid gap-1 text-xs text-muted-fg"><span>CODE128 · Payload WMS · Hex encoded</span><span>Không có QR, text hoặc template thứ hai</span></div></div>
    </div>
  </div>
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function TemplateBadge({ status }: { status: string }) {
  const statusConfig = {
    published: {
      label: 'Phát hành',
      cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold border bg-success/10 text-success border-success/25',
      dot: 'bg-success',
    },
    draft: {
      label: 'Nháp',
      cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold border bg-surface-2 text-muted-fg border-border',
      dot: 'bg-muted-fg',
    },
    archived: {
      label: 'Lưu trữ',
      cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold border bg-warning/10 text-warning border-warning/25',
      dot: 'bg-warning',
    },
  }
  const cfg = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.draft
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={cfg.cls}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        {cfg.label}
      </span>
    </div>
  )
}

function DefaultTemplateBadge() {
  return <span className="mt-1 inline-flex items-center gap-1 rounded border border-info/25 bg-info/10 px-1.5 py-0.5 text-[11px] font-semibold text-info"><Star size={10} className="fill-current" /> Mặc định</span>
}

// ── Category Badge ────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  PRODUCT:    { label: 'Product',    color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20' },
  WIP:        { label: 'WIP',        color: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20' },
  PALLET:     { label: 'Pallet',     color: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20' },
  SHELF:      { label: 'Shelf',      color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20' },
  INSPECTION: { label: 'Inspection', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' },
  MATERIAL:   { label: 'Material',   color: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20' },
  SHEET:      { label: 'Sheet',      color: 'bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-500/10 dark:text-lime-400 dark:border-lime-500/20' },
  ISSUE:      { label: 'Issue',      color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' },
}

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null
  const meta = CATEGORY_META[category.toUpperCase()] ?? {
    label: category,
    color: 'bg-surface-2 text-muted-fg border-border',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[13px] font-semibold border ${meta.color}`}>
      {meta.label}
    </span>
  )
}

// ── Icon action button ────────────────────────────────────────────────────────

function IconBtn({
  id, onClick, title, danger, success, brand, children,
}: {
  id?: string; onClick: () => void; title: string
  danger?: boolean; success?: boolean; brand?: boolean
  children: React.ReactNode
}) {
  const cls = danger
    ? 'hover:bg-error/8 hover:border-error/25 hover:text-error'
    : success
    ? 'hover:bg-success/8 hover:border-success/25 hover:text-success'
    : brand
    ? 'hover:bg-brand-glow hover:border-brand/25 hover:text-brand'
    : 'hover:bg-surface-2 hover:border-border hover:text-foreground'

  return (
    <button
      id={id}
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border border-transparent text-muted-fg transition-all duration-150 cursor-pointer ${cls}`}
    >
      {children}
    </button>
  )
}

// ── Template Editor Dialog ────────────────────────────────────────────────────

function TemplateEditorDialog({
  open, template, printers, layoutType: defaultLayoutType, onClose, onSaved,
}: {
  open: boolean; template: LabelTemplate | null; printers: any[]
  layoutType: '1UP' | '2UP' | '3UP'  // active tab — used when creating
  onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!template
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [note, setNote]               = useState('')
  const [dpi, setDpi]                 = useState('203')
  const [width, setWidth]             = useState('50')
  const [height, setHeight]           = useState('30')
  const [gapMm, setGapMm]             = useState('0')
  const [draft, setDraft]             = useState<LabelTemplateDraft>(() => createBlankDraft())
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [testPrinter, setTestPrinter] = useState('')
  const [testing, setTesting]         = useState(false)
  const [testResult, setTestResult]   = useState<{ success: boolean; msg: string } | null>(null)

  // Layout type for new templates — fixed by the active tab, cannot be changed after creation
  const layoutType = template?.layoutType ?? defaultLayoutType

  useEffect(() => {
    if (open) {
      if (template) {
        setName(template.name); setDescription(template.description ?? '')
        setNote(template.note ?? ''); setDpi(String(template.dpi))
        setWidth(String(template.labelWidth)); setHeight(String(template.labelHeight))
        setGapMm(String(template.gapMm ?? 0))
        setDraft(draftFromLegacy(template.templateJson, template.labelWidth, template.labelHeight, template.dpi as 203 | 300 | 600))
      } else {
        // Derive gap default from layout type
        const defaultGap = defaultLayoutType === '1UP' ? '0' : '2'
        setName(''); setDescription(''); setNote(''); setDpi('203'); setWidth('50'); setHeight('30')
        setGapMm(defaultGap)
        setDraft(createBarcodeDraft(50, 30, 203))
      }
      setError(null); setTestResult(null); setTesting(false)
    }
  }, [open, template, defaultLayoutType])

  const handleSave = async () => {
    const validationErrors = validateDraft(draft)
    if (validationErrors.length) { setError(validationErrors.join(' ')); return }
    setSaving(true); setError(null)
    try {
      const jsonText = draftToLegacyJson(draft)
      const definitionResult = await templateApi.validateDefinition(jsonText, draft.contentMode)
      if (!definitionResult.data.valid) {
        setError(definitionResult.data.errors.join(' '))
        return
      }
      const payload = {
        name, description: description || undefined, note: note || undefined,
        dpi: parseInt(dpi), labelWidth: parseFloat(width), labelHeight: parseFloat(height),
        templateJson: jsonText,
        gapMm: parseFloat(gapMm) || 0,
      }
      if (isEdit) {
        console.info('[LabelTemplateSave] start edit', { id: template!.id, contentMode: draft.contentMode, templateJsonLength: jsonText.length })
        await templateApi.update(template!.id, payload)
      } else {
        await templateApi.create({
          ...payload,
          layoutType,
          sheetColumns: layoutType === '3UP' ? 3 : layoutType === '2UP' ? 2 : 1,
          sheetRows: 1,
        })
      }
      onSaved()
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message)
    } finally { setSaving(false) }
  }

  const handleTestPrint = async () => {
    if (!testPrinter) { setTestResult({ success: false, msg: 'Chọn máy in trước.' }); return }
    setTesting(true); setTestResult(null)
    try {
      const res = await templateApi.printTest(template!.id, {
        printerCode: testPrinter,
        data: {
          serial_number: 'TEST-001', product_code: 'TEST-P01',
          product_name: 'Test Product', batch_number: 'BATCH-TEST',
          revision: 'A', production_date: new Date().toISOString().split('T')[0],
        }
      })
      setTestResult({
        success: res.data.success,
        msg: res.data.success ? `In thành công · ${res.data.durationMs}ms` : 'In thất bại — kiểm tra máy in.',
      })
    } catch (e: any) {
      setTestResult({ success: false, msg: e.response?.data?.error ?? e.message })
    } finally { setTesting(false) }
  }

  const labelCls = 'block text-[13px] font-semibold text-foreground mb-1.5'
  const changeContentMode = (mode: 'BARCODE' | 'QR') => {
    const next = mode === 'BARCODE'
      ? createBarcodeDraft(Number(width) || 50, Number(height) || 30, Number(dpi) as 203 | 300 | 600)
      : createQrDraft(Number(width) || 50, Number(height) || 30, Number(dpi) as 203 | 300 | 600)
    setDraft(next)
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-card border-border text-foreground [box-shadow:var(--shadow-lg)]">
        <DialogHeader className="pb-4 border-b border-border flex-shrink-0">
          <DialogTitle className="text-[22px] font-semibold">
            {isEdit ? `Chỉnh sửa — ${template?.name}` : 'Thêm mẫu nhãn mới'}
          </DialogTitle>
          {!isEdit && (
            <DialogDescription className="text-[13px] text-muted-fg">
              Cấu hình thông số và thiết kế layout tem nhãn
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-1 gap-6 py-4 min-h-0">
          {/* ── Form (left) ── */}
          <div className="overflow-y-auto pr-2 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Tên mẫu tem <span className="text-error">*</span></label>
                <Input id="tpl-name" value={name} onChange={e => setName(e.target.value)} placeholder="50x30 QR Label" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Mô tả</label>
                <Input id="tpl-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Mô tả ngắn..." />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Ghi chú sản xuất</label>
                <textarea
                  id="tpl-note" value={note} onChange={e => setNote(e.target.value)} rows={3}
                  placeholder="Ghi chú cho kỹ sư sản xuất..."
                  className="w-full rounded-lg bg-surface border border-border text-foreground text-[15px] px-3 py-2.5 resize-y focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-shadow"
                />
              </div>
            {/* Layout type badge (read-only) */}
              <div className="col-span-2">
                <label className={labelCls}>Cột nhãn (Column Across)</label>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-bold border ${
                    layoutType === '3UP' ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20'
                    : layoutType === '2UP' ? 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20'
                    : 'bg-surface-2 text-muted-fg border-border'
                  }`}>
                    {layoutType === '1UP' ? '1 cột nhãn (1 nhãn / hàng)'
                    : layoutType === '2UP' ? '2 cột nhãn (2 nhãn / hàng)'
                    : '3 cột nhãn (3 nhãn / hàng)'}
                  </span>
                  {isEdit && <span className="text-[12px] text-muted-fg">Không thể đổi sau khi tạo</span>}
                </div>
              </div>
              <div>
                <label className={labelCls}>Độ phân giải (DPI)</label>
                  <Select value={dpi} onValueChange={value => { setDpi(value); setDraft(previous => ({ ...previous, dpi: Number(value) as 203 | 300 | 600 })) }}>
                  <SelectTrigger id="tpl-dpi" className="bg-surface border-border text-foreground focus:ring-brand h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-foreground">
                    <SelectItem value="203">203 DPI</SelectItem>
                    <SelectItem value="300">300 DPI</SelectItem>
                    <SelectItem value="600">600 DPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 rounded-lg border border-brand/20 bg-brand/5 p-3">
                <label className={labelCls}>Loại mã trên tem <span className="text-error">*</span></label>
                {isEdit ? (
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {draft.contentMode === 'BARCODE' ? <Barcode size={16} className="text-brand" /> : <QrCode size={16} className="text-brand" />}
                    {draft.contentMode === 'BARCODE' ? 'Barcode' : 'QR Code'}
                    <span className="text-xs font-normal text-muted-fg">Không thể đổi loại mã sau khi tạo</span>
                  </div>
                ) : (
                  <Select value={draft.contentMode} onValueChange={value => changeContentMode(value as 'BARCODE' | 'QR')}>
                    <SelectTrigger className="bg-surface border-border text-foreground h-10"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover border-border text-foreground">
                      <SelectItem value="BARCODE">Barcode — mã scan + code ID</SelectItem>
                      <SelectItem value="QR">QR Code — field và kích thước tùy chỉnh</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Rộng (mm)</label>
                  <Input id="tpl-width" value={width} onChange={e => { setWidth(e.target.value); setDraft(previous => fitDraftToLabel(previous, Number(e.target.value) || 0, previous.heightMm)) }} type="number" />
                </div>
                <div>
                  <label className={labelCls}>Cao (mm)</label>
                  <Input id="tpl-height" value={height} onChange={e => { setHeight(e.target.value); setDraft(previous => fitDraftToLabel(previous, previous.widthMm, Number(e.target.value) || 0)) }} type="number" />
                </div>
              </div>
              {/* N-Up config: only shown for 2UP / 3UP */}
              {layoutType !== '1UP' && (
                <div className="col-span-2 grid grid-cols-3 gap-3 bg-surface-2 border border-border rounded-xl p-3 mt-1">
                  <div>
                    <label className={labelCls}>Số cột</label>
                    <Input value={layoutType === '3UP' ? 3 : 2} disabled type="number" className="opacity-60 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className={labelCls}>Số hàng</label>
                    <Input value={1} disabled type="number" className="opacity-60 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className={labelCls}>Khoảng cách (mm)</label>
                    <Input
                      id="tpl-gap-mm"
                      value={gapMm} onChange={e => setGapMm(e.target.value)}
                      type="number" min="0" max="20" step="0.5"
                    />
                  </div>
                  <div className="col-span-3 text-[11px] text-muted-fg pt-1">
                    Kích thước tờ in: <span className="font-semibold text-foreground">
                      {Math.round((parseFloat(width)||50) * (layoutType === '3UP' ? 3 : 2) + (parseFloat(gapMm)||0) * (layoutType === '3UP' ? 2 : 1))} × {height || 30} mm
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className={labelCls.replace('mb-1.5', '')}>Thiết kế nội dung tem</label>
                  <p className="text-xs text-muted-fg">Chọn phần tử trực tiếp trên preview để chỉnh vị trí, kích thước, field và cỡ chữ.</p>
                </div>
                <div className="rounded border border-info/20 bg-info/5 px-2 py-1 text-[11px] text-info">Chế độ {draft.contentMode === 'BARCODE' ? 'Barcode' : 'QR Code'}</div>
              </div>
              <LabelTemplateVisualEditor value={draft} onChange={setDraft} />
            </div>

            {/* Test Print */}
            {isEdit && (
              <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
                <div className="text-[13px] font-semibold text-foreground">In thử nghiệm</div>
                <div className="flex gap-3">
                  <Select value={testPrinter} onValueChange={setTestPrinter}>
                    <SelectTrigger id="tpl-test-printer" className="bg-surface border-border text-foreground h-10 flex-1 focus:ring-brand">
                      <SelectValue placeholder="Chọn máy in..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border text-foreground">
                      {printers.map(p => (
                        <SelectItem key={p.printerCode ?? p.PrinterCode} value={p.printerCode ?? p.PrinterCode}>
                          {p.displayName ?? p.DisplayName} ({p.printerCode ?? p.PrinterCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button id="tpl-test-print-btn" size="sm" onClick={handleTestPrint} disabled={testing}
                    className="bg-info hover:bg-info/90 text-white h-10 px-4 gap-2">
                    {testing ? <RefreshCw size={14} className="animate-spin" /> : <PrinterIcon size={14} />}
                    Test Print
                  </Button>
                </div>
                {testResult && (
                  <div className={`text-[13px] flex items-center gap-2 font-semibold ${testResult.success ? 'text-success' : 'text-error'}`}>
                    {testResult.success ? <Check size={14} /> : <AlertTriangle size={14} />}
                    {testResult.msg}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {error && (
          <div className="text-error text-[13px] font-semibold flex items-center gap-2 bg-error/8 border border-error/20 rounded-xl px-4 py-3 flex-shrink-0">
            <AlertTriangle size={16} className="flex-shrink-0" /> {error}
          </div>
        )}

        <DialogFooter className="gap-3 border-t border-border pt-4 flex-shrink-0">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button id="tpl-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : null}
            {isEdit ? 'Lưu thay đổi' : 'Tạo mẫu nhãn'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Preview Dialog ────────────────────────────────────────────────────────────

function TemplatePreviewDialog({
  open, template, onClose,
}: { open: boolean; template: LabelTemplate | null; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border text-foreground [box-shadow:var(--shadow-lg)]">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-[22px] font-semibold">{template?.name}</DialogTitle>
          <DialogDescription className="text-[13px] text-muted-fg">
            v{template?.version} · {template?.labelWidth}×{template?.labelHeight}mm · {template?.dpi} DPI
            {template?.orientation && ` · ${template.orientation}`}
            {template?.revision && ` · Rev ${template.revision}`}
          </DialogDescription>
        </DialogHeader>

        {(template?.category || template?.templateCode) && (
          <div className="flex items-center gap-2 flex-wrap pt-2">
            {template?.category && <CategoryBadge category={template.category} />}
            {template?.templateCode && (
              <span className="font-mono text-[13px] text-foreground bg-surface-2 px-2.5 py-1 rounded-lg border border-border">
                {template.templateCode}
              </span>
            )}
          </div>
        )}

        {template?.note && (
          <div className="rounded-xl border border-warning/25 bg-warning/5 px-4 py-3">
            <div className="text-[12px] font-bold text-warning uppercase tracking-wider mb-2 flex items-center gap-1.5">
              📋 Ghi chú sản xuất
            </div>
            <pre className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed font-sans">
              {template.note}
            </pre>
          </div>
        )}

        <div className="flex items-center justify-center py-8 bg-background border border-border rounded-xl">
          {template && (
            <LabelPreview
              template={template.templateJson as any}
              data={{
                serial_number: 'SN-PREVIEW-001', product_code: 'P-PREVIEW-01',
                product_name: 'Preview Product', batch_number: 'BATCH-PREVIEW',
                revision: 'B', production_date: new Date().toISOString().split('T')[0],
              }}
              width={460}
            />
          )}
        </div>

        {template?.description && (
          <p className="text-[13px] text-muted-fg">{template.description}</p>
        )}

        <DialogFooter className="border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Print History Dialog ──────────────────────────────────────────────────────

function PrintHistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await templateApi.getPrintHistory(1, 50); setRecords(res.data) }
    catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (open) { load(); setSelected(null) } }, [open, load])

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col bg-card border-border text-foreground [box-shadow:var(--shadow-lg)]">
        <DialogHeader className="border-b border-border pb-4 flex-shrink-0">
          <DialogTitle className="text-[22px] font-semibold flex items-center gap-2">
            <History size={20} className="text-info" />
            Lịch sử in/khắc tem nhãn
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-fg text-[15px] gap-3">
              <RefreshCw size={20} className="animate-spin text-brand" /> Đang tải lịch sử in…
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-16 text-muted-fg text-[15px]">Chưa có lịch sử in.</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                {records.map(r => (
                  <button key={r.id} onClick={() => setSelected(r)}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-150 ${
                      selected?.id === r.id
                        ? 'border-brand bg-brand-glow shadow-sm'
                        : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2'
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-foreground text-[15px] truncate max-w-[60%]">
                        {r.templateName}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-bold border ${
                        r.status === 'SUCCESS'
                          ? 'bg-success/10 text-success border-success/25'
                          : r.status === 'FAILED'
                          ? 'bg-error/10 text-error border-error/25'
                          : 'bg-warning/10 text-warning border-warning/25'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="text-muted-fg flex gap-3 text-[13px]">
                      <span>v{r.templateVersion}</span>
                      <span>{r.printerCode}</span>
                      <span>{r.durationMs}ms</span>
                    </div>
                    <div className="text-muted-fg mt-1 font-mono text-[12px]">
                      {new Date(r.createdAt).toLocaleString('vi-VN')}
                    </div>
                  </button>
                ))}
              </div>

              <div className="sticky top-0">
                {selected ? (
                  <div className="bg-surface-2 border border-border rounded-xl p-5 space-y-4">
                    <div className="text-[15px] font-bold text-foreground">
                      Chi tiết — {selected.templateName}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[13px]">
                      {[
                        ['Trạng thái', selected.status],
                        ['Phiên bản', `v${selected.templateVersion}`],
                        ['Mã máy in', selected.printerCode],
                        ['Thời gian xử lý', `${selected.durationMs} ms`],
                        ['Trace ID', selected.traceId],
                      ].map(([k, v]) => (
                        <>
                          <span key={`k-${k}`} className="text-muted-fg">{k}</span>
                          <span key={`v-${k}`} className="text-foreground font-mono truncate text-[12px]">{v}</span>
                        </>
                      ))}
                    </div>
                    {selected.renderedZpl && (
                      <div>
                        <div className="text-[13px] font-semibold text-muted-fg mb-2">Bản tin ZPL</div>
                        <pre className="text-[12px] font-mono bg-background text-foreground p-3 rounded-lg max-h-48 overflow-y-auto border border-border">
                          {selected.renderedZpl}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-muted-fg text-[13px] text-center py-16 border border-dashed border-border rounded-xl bg-surface-2">
                    Chọn một bản ghi để xem chi tiết.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-4 flex-shrink-0">
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main Label Templates Tab ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export function LabelTemplatesTab() {
  const [templates, setTemplates]   = useState<LabelTemplate[]>([])
  const [wmsTemplate, setWmsTemplate] = useState<LabelTemplate | null>(null)
  const [printers, setPrinters]     = useState<any[]>([])
  const [assignments, setAssignments] = useState<PrinterAssignment[]>([])
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter]   = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  // N-Up layout tab
  const [layoutTab, setLayoutTab]   = useState<'1UP' | '2UP' | '3UP'>('1UP')
  const [contentTab, setContentTab] = useState<'barcode' | 'icons' | 'wms-barcode'>('barcode')

  // Dialog visibility
  const [editorOpen, setEditorOpen]   = useState(false)
  const [editTarget, setEditTarget]   = useState<LabelTemplate | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTarget, setPreviewTarget] = useState<LabelTemplate | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [assignOpen, setAssignOpen]   = useState(false)

  const [assignSelections, setAssignSelections] = useState<Record<string, string>>({})
  const [assignSaving, setAssignSaving] = useState(false)

  const importRef = useRef<HTMLInputElement>(null)

  // ── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { layoutType: layoutTab }
      if (statusFilter !== 'all') params.status = statusFilter
      if (statusFilter === 'archived') params.includeArchived = true
      const [tRes, wmsRes, readyRes, activeRes, aRes] = await Promise.all([
        templateApi.list(params),
        templateApi.getWmsBarcodeTemplate(),
        templateApi.getPrintersReady(),
        templateApi.getPrintersActive(),
        templateApi.getAssignments(),
      ])
      setTemplates(tRes.data)
      setWmsTemplate(wmsRes.data)
      const byCode = new Map<string, any>()
      ;[...readyRes.data, ...activeRes.data].forEach((printer: any) => byCode.set(printer.printerCode ?? printer.PrinterCode, printer))
      setPrinters(Array.from(byCode.values()).filter((printer: any) => printer.driverType !== 'simulation'))
      setAssignments(aRes.data)
      const sel: Record<string, string> = {}
      aRes.data.forEach((a: any) => { sel[a.printerCode ?? a.PrinterCode] = a.templateId })
      setAssignSelections(sel)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [statusFilter, layoutTab])

  useEffect(() => { load() }, [load])

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = templates.filter(t => {
    const matchSearch = !search
      || t.name.toLowerCase().includes(search.toLowerCase())
      || (t.description ?? '').toLowerCase().includes(search.toLowerCase())
      || (t.templateCode ?? '').toLowerCase().includes(search.toLowerCase())
    const matchCategory = categoryFilter === 'all' || (t.category ?? '').toUpperCase() === categoryFilter
    return matchSearch && matchCategory
  })

  // ── Actions ───────────────────────────────────────────────────────────────
  const handlePublish   = async (id: string) => { try { await templateApi.publish(id);    await load() } catch { /* API interceptor displays the error. */ } }
  const handleArchive   = async (id: string) => { try { await templateApi.archive(id);    await load() } catch { /* API interceptor displays the error. */ } }
  const handleSetDefault = async (id: string) => { try { await templateApi.setDefault(id); await load() } catch { /* API interceptor displays the error. */ } }
  const handleDuplicate = async (id: string) => { try { await templateApi.duplicate(id);  await load() } catch { /* API interceptor displays the error. */ } }
  const handleDelete    = async (id: string) => {
    if (!confirm('Xóa mẫu nhãn này? Hành động không thể hoàn tác.')) return
    try { await templateApi.delete(id); await load() } catch { /* API interceptor displays the error. */ }
  }
  const handleExport = async (t: LabelTemplate) => {
    const res = await templateApi.exportTemplate(t.id)
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url; a.download = `${t.name.replace(/\s+/g, '_')}_v${t.version}.json`
    a.click(); window.URL.revokeObjectURL(url)
  }
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const text = await file.text()
    try { await templateApi.importTemplate(JSON.parse(text)); await load() }
    catch (err: any) { alert(`Import failed: ${err.message}`) }
    finally { if (importRef.current) importRef.current.value = '' }
  }

  const handleSaveAssignments = async () => {
    setAssignSaving(true)
    try {
      for (const printer of printers) {
        const code = printer.printerCode ?? printer.PrinterCode
        const selectedId = assignSelections[code]
        const current = assignments.find(a => (a.printerCode ?? (a as any).PrinterCode) === code)
        if (selectedId && selectedId !== 'none') {
          if (!current || current.templateId !== selectedId) await templateApi.assignTemplate(code, selectedId)
        } else if (current) {
          await templateApi.removeAssignment(code)
        }
      }
      await load(); setAssignOpen(false)
    } catch (e: any) { alert(`Save failed: ${e.message}`) }
    finally { setAssignSaving(false) }
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const published = templates.filter(t => t.status === 'published').length
  const drafts    = templates.filter(t => t.status === 'draft').length
  const archived  = templates.filter(t => t.status === 'archived').length

  const templateColumns = useMemo<ColumnDef<LabelTemplate>[]>(() => [
    { accessorKey: 'name', header: 'Tên mẫu nhãn', cell: ({ row }) => <div><p className="font-semibold text-foreground">{row.original.name}</p>{row.original.isDefault && <DefaultTemplateBadge />}{row.original.templateCode && <code className="mt-1 inline-block rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-fg">{row.original.templateCode}</code>}{row.original.description && <p className="mt-0.5 max-w-xs truncate text-xs text-muted-fg">{row.original.description}</p>}</div> },
    { accessorKey: 'category', header: 'Phân loại', cell: ({ row }) => <span className="whitespace-nowrap"><CategoryBadge category={row.original.category} /></span> },
    { id: 'size', header: 'Kích thước', cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.labelWidth}×{row.original.labelHeight}<span className="ml-1 text-xs text-muted-fg">mm</span></span> },
    { accessorKey: 'dpi', header: 'DPI', cell: ({ row }) => <span className="font-mono text-muted-fg">{row.original.dpi}</span> },
    { accessorKey: 'version', header: 'Phiên bản', cell: ({ row }) => <span className="font-mono text-muted-fg">v{row.original.version}</span> },
    { id: 'status', header: 'Trạng thái', cell: ({ row }) => <span className="whitespace-nowrap"><TemplateBadge status={row.original.status} /></span> },
    { accessorKey: 'createdAt', header: 'Ngày tạo', cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-fg">{new Date(row.original.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</span> },
    { accessorKey: 'updatedAt', header: 'Cập nhật', cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-fg">{new Date(row.original.updatedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</span> },
    { id: 'actions', header: 'Thao tác', enableHiding: false, cell: ({ row }) => {
      const template = row.original
      return (
        <div className="flex items-center justify-end gap-0.5 whitespace-nowrap">
          <IconBtn id={`tpl-preview-${template.id}`} onClick={() => { setPreviewTarget(template); setPreviewOpen(true) }} title="Xem trước mẫu nhãn">
            <Eye size={15} />
          </IconBtn>
          <IconBtn id={`tpl-edit-${template.id}`} onClick={() => { setEditTarget(template); setEditorOpen(true) }} title="Chỉnh sửa" brand>
            <Edit2 size={15} />
          </IconBtn>
          <IconBtn id={`tpl-dup-${template.id}`} onClick={() => void handleDuplicate(template.id)} title="Nhân bản">
            <Copy size={15} />
          </IconBtn>
          {template.status !== 'published' && (
            <IconBtn id={`tpl-publish-${template.id}`} onClick={() => void handlePublish(template.id)} title="Phát hành" success>
              <CheckCircle2 size={15} />
            </IconBtn>
          )}
          {!template.isDefault && template.status === 'published' && (
            <IconBtn id={`tpl-setdefault-${template.id}`} onClick={() => void handleSetDefault(template.id)} title="Đặt làm mặc định">
              <Star size={15} />
            </IconBtn>
          )}
          {template.status !== 'archived' && (
            <IconBtn id={`tpl-archive-${template.id}`} onClick={() => void handleArchive(template.id)} title="Lưu trữ">
              <Archive size={15} />
            </IconBtn>
          )}
          <IconBtn id={`tpl-export-${template.id}`} onClick={() => void handleExport(template)} title="Xuất file JSON">
            <Download size={15} />
          </IconBtn>
          {!template.isDefault && (
            <IconBtn id={`tpl-delete-${template.id}`} onClick={() => void handleDelete(template.id)} title="Xóa mẫu nhãn" danger>
              <Trash2 size={15} />
            </IconBtn>
          )}
        </div>
      )
    } },
  ], [handleArchive, handleDelete, handleDuplicate, handleExport, handlePublish, handleSetDefault])

  if (contentTab === 'wms-barcode') {
    return <div className="flex flex-col gap-6 p-6 bg-background min-h-full"><div className="flex items-start gap-4"><div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0"><Barcode size={24} className="text-brand" /></div><div><h1 className="text-[32px] font-bold text-foreground leading-tight">Barcode WMS</h1><p className="text-[13px] text-muted-fg mt-1">Template barcode duy nhất cho request in từ WMS.</p></div></div><CommonTabs value={contentTab} onValueChange={value => setContentTab(value as 'barcode' | 'icons' | 'wms-barcode')} items={[{ value: 'barcode', label: 'Barcode / QR', icon: <Barcode size={17} /> }, { value: 'wms-barcode', label: 'Barcode WMS', icon: <Settings2 size={17} /> }, { value: 'icons', label: 'Icon / Hình ảnh', icon: <ImageIcon size={17} /> }]} /><WmsBarcodeTemplateTab template={wmsTemplate} onEdit={() => { setEditTarget(wmsTemplate); setEditorOpen(true) }} /><TemplateEditorDialog open={editorOpen} template={editTarget} printers={printers} layoutType="1UP" onClose={() => { setEditorOpen(false); setEditTarget(null) }} onSaved={() => { setEditorOpen(false); setEditTarget(null); void load() }} /></div>
  }
  if (contentTab === 'icons') {
    return (
      <div className="flex flex-col gap-6 p-6 bg-background min-h-full">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center flex-shrink-0 mt-0.5"><ImageIcon size={24} className="text-info" /></div>
            <div><h1 className="text-[32px] font-bold text-foreground leading-tight">Thiết kế biểu tượng</h1><p className="text-[13px] text-muted-fg mt-1">Thư viện icon và hình ảnh dùng trong mẫu tem.</p></div>
          </div>
        </div>
        <CommonTabs value={contentTab} onValueChange={value => setContentTab(value as 'barcode' | 'icons' | 'wms-barcode')} items={[{ value: 'barcode', label: 'Barcode / QR', icon: <Barcode size={17} /> }, { value: 'wms-barcode', label: 'Barcode WMS', icon: <Settings2 size={17} /> }, { value: 'icons', label: 'Icon / Hình ảnh', icon: <ImageIcon size={17} /> }]} />
        <IconAssetsTab />
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-6 bg-background min-h-full">

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileText size={24} className="text-brand" />
          </div>
          <div>
            <h1 className="text-[32px] font-bold text-foreground leading-tight">Mẫu nhãn thiết kế</h1>
            <p className="text-[13px] text-muted-fg mt-1">
              Quản lý và cấu hình mẫu tem nhãn · Gán máy in tương thích
            </p>
          </div>
        </div>

        {/* Action buttons — clear hierarchy */}
        <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0">
          <Button id="tpl-history-btn" variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="gap-2">
            <History size={16} /> Lịch sử in
          </Button>
          <Button id="tpl-assign-btn" variant="outline" size="sm" onClick={() => setAssignOpen(true)} className="gap-2">
            <Settings2 size={16} /> Phân bổ máy in
          </Button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <Button id="tpl-import-btn" variant="outline" size="sm" onClick={() => importRef.current?.click()} className="gap-2">
            <Upload size={16} /> Nhập file
          </Button>
          {/* Primary CTA */}
          <Button id="tpl-new-btn" size="sm" onClick={() => { setEditTarget(null); setEditorOpen(true) }} className="gap-2 shadow-sm">
            <Plus size={16} /> Thêm mẫu mới
          </Button>
        </div>
      </div>

      {/* ── Stats strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Tổng mẫu nhãn', value: templates.length, color: 'text-foreground', icon: FileText, iconBg: 'bg-surface-2', iconColor: 'text-muted-fg' },
          { label: 'Đang phát hành', value: published,        color: 'text-success',    icon: CheckCircle2, iconBg: 'bg-success/10', iconColor: 'text-success' },
          { label: 'Bản nháp',       value: drafts,           color: 'text-warning',    icon: Archive, iconBg: 'bg-warning/10', iconColor: 'text-warning' },
          { label: 'Lưu trữ',        value: archived,         color: 'text-muted-fg',   icon: Archive, iconBg: 'bg-surface-2', iconColor: 'text-muted-fg' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${s.iconBg}`}>
              <s.icon size={22} className={s.iconColor} />
            </div>
            <div>
              <p className="text-[13px] text-muted-fg font-medium leading-tight">{s.label}</p>
              <p className={`text-[28px] font-bold leading-tight tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Column Layout Tabs ────────────────────────────────────────────────── */}
      {(() => {
        const tabDefs: { key: '1UP' | '2UP' | '3UP'; label: string; emoji: string; desc: string }[] = [
          { key: '1UP', label: '1 Cột nhãn', emoji: '▭', desc: '1 nhãn / hàng' },
          { key: '2UP', label: '2 Cột nhãn', emoji: '▭▭', desc: '2 nhãn / hàng' },
          { key: '3UP', label: '3 Cột nhãn', emoji: '▭▭▭', desc: '3 nhãn / hàng' },
        ]
        // count all templates (ignoring status filter) per layout — use unfiltered set from loaded data
        const countFor = (lt: string) => templates.filter(t => (t.layoutType ?? '1UP') === lt).length

        return (
          <div className="flex items-center gap-3 flex-wrap">
          <CommonTabs value={contentTab} onValueChange={value => setContentTab(value as 'barcode' | 'icons' | 'wms-barcode')} items={[{ value: 'barcode', label: 'Barcode / QR', icon: <Barcode size={17} /> }, { value: 'wms-barcode', label: 'Barcode WMS', icon: <Settings2 size={17} /> }, { value: 'icons', label: 'Icon / Hình ảnh', icon: <ImageIcon size={17} /> }]} />
          <div className="flex gap-1 bg-surface-2 border border-border rounded-xl p-1.5 self-start">
            {tabDefs.map(tab => {
              const active = layoutTab === tab.key
              return (
                <button
                  key={tab.key}
                  id={`tpl-tab-${tab.key.toLowerCase()}`}
                  onClick={() => { setLayoutTab(tab.key); setSearch('') }}
                  className={`flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-[14px] font-semibold transition-all duration-200 cursor-pointer ${
                    active
                      ? tab.key === '2UP' ? 'bg-cyan-500 text-white shadow-sm'
                        : tab.key === '3UP' ? 'bg-violet-500 text-white shadow-sm'
                        : 'bg-brand text-white shadow-sm'
                      : 'text-muted-fg hover:text-foreground hover:bg-surface'
                  }`}
                >
                  <span className="font-mono text-[11px] opacity-70 tracking-tight">{tab.emoji}</span>
                  <span>{tab.label}</span>
                  <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-surface text-muted-fg'
                  }`}>
                    {countFor(tab.key)}
                  </span>
                </button>
              )
            })}
          </div>
          </div>
        )
      })()}

      {/* ── Unified Toolbar ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] p-4 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg pointer-events-none" />
          <Input
            id="tpl-search"
            value={search}
            onChange={e => { setSearch(e.target.value) }}
            placeholder="Tìm theo tên, mã mẫu, mô tả…"
            className="pl-10"
          />
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Category filter */}
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-muted-fg whitespace-nowrap">Nhóm:</span>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger id="tpl-category-filter" className="w-40 h-10 bg-surface border-border text-foreground focus:ring-brand text-[13px]">
              <SelectValue placeholder="Tất cả nhóm" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border text-foreground">
              <SelectItem value="all">Tất cả nhóm</SelectItem>
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-muted-fg whitespace-nowrap">Trạng thái:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="tpl-status-filter" className="w-44 h-10 bg-surface border-border text-foreground focus:ring-brand text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border text-foreground">
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="published">Đã phát hành</SelectItem>
              <SelectItem value="draft">Bản nháp</SelectItem>
              <SelectItem value="archived">Đã lưu trữ</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {(search || statusFilter !== 'all' || categoryFilter !== 'all') && (
            <span className="text-[13px] text-muted-fg whitespace-nowrap tabular-nums">
              {filtered.length} / {templates.length}
            </span>
          )}
          <button
            id="tpl-refresh-btn"
            onClick={load}
            disabled={loading}
            title="Làm mới danh sách"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border text-muted-fg hover:text-foreground hover:bg-surface-2 hover:border-border-strong transition-all duration-150 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-brand' : ''} />
          </button>
        </div>
      </div>

      {/* ── Data Table ─────────────────────────────────────────────────────── */}
      <DataTable columns={templateColumns} data={filtered} loading={loading} pageSize={10} getRowId={row => row.id} empty={search ? `Không có mẫu nhãn khớp với "${search}"` : 'Chưa có mẫu nhãn nào.'} />
      <div className="hidden rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] overflow-hidden">
        <TableEl>
          <TableHeader>
            <TableRow className="hover:bg-surface-2">
              <TableHead className="pl-6 w-[35%]">Tên mẫu nhãn</TableHead>
              <TableHead className="w-[12%]">Phân loại</TableHead>
              <TableHead className="w-[12%]">Kích thước</TableHead>
              <TableHead className="w-[7%]">DPI</TableHead>
              <TableHead className="w-[7%]">Phiên bản</TableHead>
              <TableHead className="w-[15%]">Trạng thái</TableHead>
              <TableHead className="w-[10%]">Cập nhật</TableHead>
              <TableHead className="pr-4 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>

            {/* Loading skeleton */}
            {loading && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="text-center py-20">
                  <div className="flex items-center justify-center gap-3 text-muted-fg text-[15px]">
                    <RefreshCw size={20} className="animate-spin text-brand" />
                    Đang tải danh sách mẫu nhãn…
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-20">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center">
                      <FileText size={30} className="text-muted-fg" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-foreground text-[16px]">
                        {search ? 'Không tìm thấy kết quả' : 'Chưa có mẫu nhãn nào'}
                      </p>
                      <p className="text-muted-fg text-[13px] mt-1">
                        {search
                          ? `Không có mẫu nhãn nào khớp với "${search}"`
                          : 'Bấm "Thêm mẫu mới" để tạo mẫu nhãn đầu tiên.'}
                      </p>
                    </div>
                    {!search && (
                      <Button size="sm" onClick={() => { setEditTarget(null); setEditorOpen(true) }} className="gap-2">
                        <Plus size={16} /> Thêm mẫu mới
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* Data rows */}
            {!loading && filtered.map(t => (
              <TableRow key={t.id}>
                {/* Template name + code + description */}
                <TableCell className="pl-6">
                  <p className="font-semibold text-foreground text-[15px] leading-tight">{t.name}</p>
                  {t.templateCode && (
                    <code className="text-[12px] text-muted-fg bg-surface-2 border border-border px-1.5 py-0.5 rounded mt-1 inline-block">
                      {t.templateCode}
                    </code>
                  )}
                  {t.description && (
                    <p className="text-muted-fg text-[13px] mt-0.5 truncate max-w-xs">{t.description}</p>
                  )}
                </TableCell>

                <TableCell><span className="whitespace-nowrap"><CategoryBadge category={t.category} /></span></TableCell>

                <TableCell>
                  <span className="font-mono text-[15px] text-foreground tabular-nums">
                    {t.labelWidth}×{t.labelHeight}<span className="text-muted-fg text-[12px] ml-1">mm</span>
                  </span>
                </TableCell>

                <TableCell>
                  <span className="font-mono text-[15px] text-muted-fg tabular-nums">{t.dpi}</span>
                </TableCell>

                <TableCell>
                  <span className="font-mono text-[15px] text-muted-fg tabular-nums">v{t.version}</span>
                </TableCell>

                <TableCell><TemplateBadge status={t.status} /></TableCell>

                <TableCell>
                  <span className="text-[13px] text-muted-fg">
                    {new Date(t.updatedAt).toLocaleDateString('vi-VN')}
                  </span>
                </TableCell>

                {/* Actions — grouped, all with tooltips, destructive separated */}
                <TableCell className="pr-4">
                  <div className="flex items-center gap-0.5 justify-end">
                    {/* View & Edit */}
                    <IconBtn id={`tpl-preview-${t.id}`} onClick={() => { setPreviewTarget(t); setPreviewOpen(true) }} title="Xem trước mẫu nhãn">
                      <Eye size={16} />
                    </IconBtn>
                    <IconBtn id={`tpl-edit-${t.id}`} onClick={() => { setEditTarget(t); setEditorOpen(true) }} title="Chỉnh sửa" brand>
                      <Edit2 size={16} />
                    </IconBtn>
                    <IconBtn id={`tpl-dup-${t.id}`} onClick={() => handleDuplicate(t.id)} title="Nhân bản">
                      <Copy size={16} />
                    </IconBtn>

                    {/* Visual separator */}
                    <span className="w-px h-5 bg-border mx-1" />

                    {/* Status transitions */}
                    {t.status !== 'published' && (
                      <IconBtn id={`tpl-publish-${t.id}`} onClick={() => handlePublish(t.id)} title="Phát hành" success>
                        <CheckCircle2 size={16} />
                      </IconBtn>
                    )}
                    {!t.isDefault && t.status === 'published' && (
                      <IconBtn id={`tpl-setdefault-${t.id}`} onClick={() => handleSetDefault(t.id)} title="Đặt làm mặc định">
                        <Star size={16} />
                      </IconBtn>
                    )}
                    {t.status !== 'archived' && (
                      <IconBtn id={`tpl-archive-${t.id}`} onClick={() => handleArchive(t.id)} title="Lưu trữ">
                        <Archive size={16} />
                      </IconBtn>
                    )}
                    <IconBtn id={`tpl-export-${t.id}`} onClick={() => handleExport(t)} title="Xuất file JSON">
                      <Download size={16} />
                    </IconBtn>

                    {/* Destructive — separated at end */}
                    {!t.isDefault && (
                      <>
                        <span className="w-px h-5 bg-border mx-1" />
                        <IconBtn id={`tpl-delete-${t.id}`} onClick={() => handleDelete(t.id)} title="Xóa mẫu nhãn" danger>
                          <Trash2 size={16} />
                        </IconBtn>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableEl>
      </div>

      {/* ── All Dialogs ─────────────────────────────────────────────────────── */}
      <TemplateEditorDialog
        open={editorOpen}
        template={editTarget}
        printers={printers}
        layoutType={layoutTab}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load() }}
      />
      <TemplatePreviewDialog
        open={previewOpen}
        template={previewTarget}
        onClose={() => setPreviewOpen(false)}
      />
      <PrintHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {/* Printer Assignment Dialog */}
      <Dialog open={assignOpen} onOpenChange={v => !v && setAssignOpen(false)}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground [box-shadow:var(--shadow-lg)]">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-[22px] font-semibold flex items-center gap-2">
              <Settings2 size={20} className="text-brand" />
              Phân bổ mẫu nhãn in
            </DialogTitle>
            <DialogDescription className="text-[13px] text-muted-fg">
              Gán mẫu nhãn in cụ thể cho từng thiết bị máy in. Bỏ trống để dùng mẫu mặc định hệ thống.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {printers.map(p => {
              const code = p.printerCode ?? p.PrinterCode
              return (
                <div key={code} className="flex items-center gap-4 bg-surface-2 border border-border rounded-xl p-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-foreground truncate">
                      {p.displayName ?? p.DisplayName}
                    </p>
                    <p className="text-[12px] text-muted-fg font-mono mt-0.5">{code}</p>
                  </div>
                  <Select
                    value={assignSelections[code] ?? 'none'}
                    onValueChange={v => setAssignSelections(prev => ({ ...prev, [code]: v }))}
                  >
                    <SelectTrigger id={`assign-${code}`} className="w-56 h-10 text-[13px] bg-surface border-border text-foreground focus:ring-brand">
                      <SelectValue placeholder="Mặc định hệ thống" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border text-foreground">
                      <SelectItem value="none">— Mặc định hệ thống —</SelectItem>
                      {templates.filter(t => t.status === 'published').map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>

          <DialogFooter className="gap-3 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Hủy</Button>
            <Button id="assign-save-btn" onClick={handleSaveAssignments} disabled={assignSaving}>
              {assignSaving ? <RefreshCw size={14} className="animate-spin" /> : null}
              Lưu phân bổ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default LabelTemplatesTab
