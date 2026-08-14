import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, Image as ImageIcon, Pencil, Printer, RefreshCw, Search, Trash2, Upload, ShieldCheck } from 'lucide-react'
import { assetApi, templateApi } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table as TableEl, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTable } from '@/components/common'
import { buildGfaZpl, packMonochromeBitmap } from '@/lib/iconZpl'

type LabelAsset = {
  id: string
  name: string
  contentType: string
  sha256: string
  isActive: boolean
  createdAt: string
  previewUrl?: string
  printSettings?: PrintSettings | null
}

type PrintSettings = {
  labelWidthMm: number
  labelHeightMm: number
  dpi: number
  iconWidthMm: number
  iconHeightMm: number
  horizontal: Horizontal
  vertical: Vertical
}

export function IconAssetsTab() {
  const [assets, setAssets] = useState<LabelAsset[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [uploadingName, setUploadingName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrlsRef = useRef<string[]>([])
  const [selectedAsset, setSelectedAsset] = useState<LabelAsset | null>(null)

  useEffect(() => () => {
    previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await assetApi.list(search)
      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      const nextUrls: string[] = []
      const withPreviews = await Promise.all(response.data.map(async (asset: Omit<LabelAsset, 'previewUrl'>) => {
        try {
          const content = await assetApi.content(asset.id)
          const previewUrl = URL.createObjectURL(content.data)
          nextUrls.push(previewUrl)
          return { ...asset, previewUrl }
        } catch {
          return { ...asset, previewUrl: undefined }
        }
      }))
      previewUrlsRef.current = nextUrls
      setAssets(withPreviews)
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Không thể tải thư viện biểu tượng.')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { void load() }, [load])

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (files.length > 3) {
      setError('Mỗi lần chỉ được tải tối đa 3 file biểu tượng.')
      return
    }
    for (const file of files) {
      const fileName = file.name || 'icon không có tên'
      const lowerName = fileName.toLowerCase()
      const isPng = file.type === 'image/png' || lowerName.endsWith('.png')
      const isSvg = file.type === 'image/svg+xml' || lowerName.endsWith('.svg')
      if (!isPng && !isSvg) {
        setError(`Icon "${fileName}" không được hỗ trợ. Chỉ chấp nhận file PNG hoặc SVG.`)
        return
      }
      if (file.size >= 2 * 1024 * 1024) {
        setError(`Icon "${fileName}" có dung lượng ${(file.size / 1024 / 1024).toFixed(2)} MB, phải nhỏ hơn 2 MB.`)
        return
      }
    }
    setUploading(true)
    setUploadingName(files.length === 1 ? files[0].name : `${files.length} file`)
    setError('')
    try {
      await assetApi.uploadMany(files)
      await load()
    } catch (err: any) {
      const detail = err.response?.data?.message ?? err.response?.data?.error ?? 'Lỗi không xác định.'
      setError(`Tải biểu tượng thất bại: ${detail}`)
    } finally {
      setUploading(false)
      setUploadingName('')
    }
  }

  const deactivate = async (asset: LabelAsset) => {
    if (!window.confirm(`Ngừng sử dụng biểu tượng "${asset.name}"?`)) return
    try {
      await assetApi.deactivate(asset.id)
      await load()
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Không thể ngừng sử dụng biểu tượng.')
    }
  }

  const columns = useMemo<ColumnDef<LabelAsset>[]>(() => [
    { id: 'preview', header: 'Xem', cell: ({ row }) => <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">{row.original.previewUrl ? <button type="button" onClick={() => setSelectedAsset(row.original)} className="h-full w-full cursor-zoom-in" title="Xem và chỉnh vị trí biểu tượng"><img src={row.original.previewUrl} alt={`Xem trước ${row.original.name}`} className="h-full w-full object-contain" /></button> : <ImageIcon size={19} className="text-muted-fg" />}</div> },
    { accessorKey: 'name', header: 'Tên biểu tượng', cell: ({ row }) => <div><p className="font-semibold text-foreground">{row.original.name}</p><p className="text-[11px] text-muted-fg">{row.original.id}</p></div> },
    { accessorKey: 'contentType', header: 'Định dạng', cell: ({ row }) => <span className="font-mono text-xs text-muted-fg">{row.original.contentType.replace('image/', '').toUpperCase()}</span> },
    { accessorKey: 'sha256', header: 'SHA-256', cell: ({ row }) => <span className="font-mono text-[11px] text-muted-fg">{row.original.sha256.slice(0, 16)}...</span> },
    { accessorKey: 'createdAt', header: 'Ngày tải', cell: ({ row }) => <span className="text-xs text-muted-fg">{new Date(row.original.createdAt).toLocaleDateString('vi-VN')}</span> },
    { id: 'actions', header: 'Thao tác', cell: ({ row }) => <div className="flex items-center justify-end gap-2 whitespace-nowrap">
      <Button variant="outline" size="sm" onClick={() => setSelectedAsset(row.original)} disabled={!row.original.previewUrl} className="gap-1.5" title="Điều chỉnh kích thước, căn lề và xem preview"><Pencil size={14} />Điều chỉnh</Button>
      <Button variant="outline" size="sm" onClick={() => setSelectedAsset(row.original)} disabled={!row.original.previewUrl} className="gap-1.5" title="Mở preview để chọn máy in và in thử"><Printer size={14} />In thử</Button>
      <Button variant="ghost" size="icon" onClick={() => void deactivate(row.original)} title="Ngừng sử dụng"><Trash2 size={16} className="text-error" /></Button>
    </div> },
  ], [deactivate])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-info/10 text-info flex items-center justify-center">
            <ImageIcon size={22} />
          </div>
          <div>
            <h2 className="text-[22px] font-semibold text-foreground">Thư viện biểu tượng</h2>
            <p className="text-[13px] text-muted-fg mt-1">Quản lý logo, biểu tượng QC và hình ảnh dùng trong mẫu tem.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="file" multiple accept="image/png,image/svg+xml" className="hidden" onChange={upload} />
          <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-2">
            {uploading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? `Đang tải ${uploadingName}` : 'Tải biểu tượng'}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-info/20 bg-info/5 p-3 flex items-start gap-3 text-[13px] text-muted-fg">
        <ShieldCheck size={17} className="text-info mt-0.5 shrink-0" />
        <span>Chỉ chấp nhận tối đa 3 file PNG hoặc SVG an toàn trong mỗi lần tải; mỗi file dưới 2 MB. SVG có script, liên kết ngoài và sự kiện HTML sẽ bị từ chối.</span>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo tên biểu tượng..." className="pl-10" />
        </div>
        <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} title="Làm mới">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </Button>
        <span className="ml-auto text-[13px] text-muted-fg">{assets.length} biểu tượng</span>
      </div>

      {error && <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-[13px] text-error" role="alert">{error}</div>}

      <DataTable columns={columns} data={assets} loading={loading} pageSize={10} getRowId={row => row.id} empty="Chưa có biểu tượng nào." />
      <div className="hidden rounded-xl border border-border bg-card overflow-hidden">
        <TableEl>
          <TableHeader><TableRow>
            <TableHead className="w-20">Xem</TableHead>
            <TableHead>Tên biểu tượng</TableHead>
            <TableHead>Định dạng</TableHead>
            <TableHead>SHA-256</TableHead>
            <TableHead>Ngày tải</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={6} className="py-16 text-center text-muted-fg">Đang tải thư viện...</TableCell></TableRow>}
            {!loading && assets.length === 0 && <TableRow><TableCell colSpan={6} className="py-16 text-center text-muted-fg">Chưa có biểu tượng nào.</TableCell></TableRow>}
            {!loading && assets.map(asset => (
              <TableRow key={asset.id}>
                <TableCell>
                  <div className="w-12 h-12 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden">
                    {asset.previewUrl
                      ? <button type="button" onClick={() => setSelectedAsset(asset)} className="w-full h-full cursor-zoom-in" title="Xem và chỉnh vị trí biểu tượng">
                          <img src={asset.previewUrl} alt={`Xem trước ${asset.name}`} className="w-full h-full object-contain" />
                        </button>
                      : <ImageIcon size={19} className="text-muted-fg" aria-label="Không tải được ảnh xem trước" />}
                  </div>
                </TableCell>
                <TableCell><p className="font-semibold text-foreground">{asset.name}</p><p className="text-[11px] text-muted-fg">{asset.id}</p></TableCell>
                <TableCell className="font-mono text-[12px] text-muted-fg">{asset.contentType.replace('image/', '').toUpperCase()}</TableCell>
                <TableCell className="font-mono text-[11px] text-muted-fg">{asset.sha256.slice(0, 16)}...</TableCell>
                <TableCell className="text-[13px] text-muted-fg">{new Date(asset.createdAt).toLocaleDateString('vi-VN')}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => void deactivate(asset)} title="Ngừng sử dụng"><Trash2 size={16} className="text-error" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableEl>
      </div>

      <IconRasterPreviewDialog asset={selectedAsset} onClose={() => setSelectedAsset(null)} onSaved={() => { setSelectedAsset(null); void load() }} />
    </div>
  )
}

type Horizontal = 'left' | 'center' | 'right'
type Vertical = 'top' | 'middle' | 'bottom'

function IconRasterPreviewDialog({ asset, onClose, onSaved }: { asset: LabelAsset | null; onClose: () => void; onSaved: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [labelWidth, setLabelWidth] = useState('50')
  const [labelHeight, setLabelHeight] = useState('30')
  const [dpi, setDpi] = useState('203')
  const [iconWidth, setIconWidth] = useState('10')
  const [iconHeight, setIconHeight] = useState('10')
  const [horizontal, setHorizontal] = useState<Horizontal>('center')
  const [vertical, setVertical] = useState<Vertical>('middle')
  const [bitmapInfo, setBitmapInfo] = useState('')
  const [renderedUrl, setRenderedUrl] = useState('')
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState('')
  const [printers, setPrinters] = useState<any[]>([])
  const [printerCode, setPrinterCode] = useState('')
  const [printing, setPrinting] = useState(false)
  const [printMessage, setPrintMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!asset) return
    const settings = asset.printSettings
    setLabelWidth(String(settings?.labelWidthMm ?? 50))
    setLabelHeight(String(settings?.labelHeightMm ?? 30))
    setDpi(String(settings?.dpi ?? 203))
    setIconWidth(String(settings?.iconWidthMm ?? 10))
    setIconHeight(String(settings?.iconHeightMm ?? 10))
    setHorizontal(settings?.horizontal ?? 'center')
    setVertical(settings?.vertical ?? 'middle')
    setRenderedUrl(''); setRenderError(''); setPrintMessage(''); setPrinterCode('')
    void templateApi.getPrintersReady().then(response => {
      const ready = response.data ?? []
      setPrinters(ready)
      setPrinterCode(ready[0]?.printerCode ?? '')
    }).catch(() => setPrinters([]))
  }, [asset])

  const rasterize = useCallback(async () => {
    if (!asset?.previewUrl || !canvasRef.current) return null
    const widthMm = Math.max(1, Number(iconWidth) || 1)
    const heightMm = Math.max(1, Number(iconHeight) || 1)
    const dotsPerMm = (Number(dpi) || 203) / 25.4
    const width = Math.max(1, Math.round(widthMm * dotsPerMm))
    const height = Math.max(1, Math.round(heightMm * dotsPerMm))
    const image = new Image()
    image.src = asset.previewUrl
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Không thể đọc hình ảnh.')) })
    const canvas = canvasRef.current
    canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d')!
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const pixels = context.getImageData(0, 0, width, height).data
    const pixelsAsBlack: boolean[] = []
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const alpha = pixels[i + 3]
      const luminance = (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000
      pixelsAsBlack.push(alpha > 30 && luminance < 180)
    }
    const bitmap = packMonochromeBitmap(width, height, pixelsAsBlack)
    setBitmapInfo(`${width} × ${height} dot · ${bitmap.rowBytes} byte/dòng · ${bitmap.data.length} byte bitmap · ${bitmap.data.length * 2} ký tự hex`)
    return { ...bitmap, dotsPerMm }
  }, [asset, dpi, iconWidth, iconHeight])

  useEffect(() => {
    if (!asset) return
    void rasterize().catch(() => setRenderError('Không thể raster hóa biểu tượng.'))
  }, [asset, rasterize])

  const buildZpl = async () => {
    const bitmap = await rasterize()
    if (!bitmap) return null
    const labelW = Math.max(1, Number(labelWidth) || 1)
    const labelH = Math.max(1, Number(labelHeight) || 1)
    const x = horizontal === 'left' ? 0 : horizontal === 'right' ? Math.max(0, Math.round(labelW * bitmap.dotsPerMm) - bitmap.width) : Math.max(0, Math.round((labelW * bitmap.dotsPerMm - bitmap.width) / 2))
    const y = vertical === 'top' ? 0 : vertical === 'bottom' ? Math.max(0, Math.round(labelH * bitmap.dotsPerMm) - bitmap.height) : Math.max(0, Math.round((labelH * bitmap.dotsPerMm - bitmap.height) / 2))
    const zpl = buildGfaZpl(bitmap, Math.round(labelW * bitmap.dotsPerMm), Math.round(labelH * bitmap.dotsPerMm), x, y)
    return { zpl, labelW, labelH }
  }

  const renderActual = async () => {
    setRendering(true); setRenderError('')
    try {
      const payload = await buildZpl()
      if (!payload) return
      const response = await templateApi.previewZpl(payload.zpl, Number(dpi) || 203, payload.labelW, payload.labelH)
      if (renderedUrl) URL.revokeObjectURL(renderedUrl)
      setRenderedUrl(URL.createObjectURL(response.data))
    } catch (error: any) {
      setRenderError(error.response?.data?.error ?? 'Không thể render preview ZPL.')
    } finally { setRendering(false) }
  }

  const printTest = async () => {
    if (!printerCode) {
      setPrintMessage('Chưa có máy in thực đang sẵn sàng.')
      return
    }
    setPrinting(true); setPrintMessage('')
    try {
      const payload = await buildZpl()
      if (!payload) return
      const response = await templateApi.printRawTest({ printerCode, zpl: payload.zpl })
      setPrintMessage(response.data?.success ? 'Đã gửi tem thử tới máy in.' : 'Máy in không xác nhận lệnh in.')
    } catch (error: any) {
      setPrintMessage(error.response?.data?.error ?? 'Gửi tem thử thất bại.')
    } finally { setPrinting(false) }
  }

  const saveChanges = async () => {
    if (!asset) return
    setSaving(true); setPrintMessage('')
    try {
      await assetApi.updatePrintSettings(asset.id, {
        labelWidthMm: Number(labelWidth),
        labelHeightMm: Number(labelHeight),
        dpi: Number(dpi),
        iconWidthMm: Number(iconWidth),
        iconHeightMm: Number(iconHeight),
        horizontal,
        vertical,
      })
      setPrintMessage('Đã lưu cấu hình biểu tượng.')
      onSaved()
    } catch (error: any) {
      setRenderError(error.response?.data?.message ?? error.response?.data?.error ?? 'Không thể lưu cấu hình biểu tượng.')
    } finally { setSaving(false) }
  }

  useEffect(() => () => { if (renderedUrl) URL.revokeObjectURL(renderedUrl) }, [renderedUrl])

  return (
    <Dialog open={!!asset} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa và xem trước biểu tượng</DialogTitle>
          <DialogDescription>{asset?.name} · raster đơn sắc theo {dpi} DPI</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold">Rộng tem (mm)<Input type="number" min="1" value={labelWidth} onChange={e => setLabelWidth(e.target.value)} /></label>
              <label className="text-xs font-semibold">Cao tem (mm)<Input type="number" min="1" value={labelHeight} onChange={e => setLabelHeight(e.target.value)} /></label>
              <label className="text-xs font-semibold">Rộng icon (mm)<Input type="number" min="1" value={iconWidth} onChange={e => setIconWidth(e.target.value)} /></label>
              <label className="text-xs font-semibold">Cao icon (mm)<Input type="number" min="1" value={iconHeight} onChange={e => setIconHeight(e.target.value)} /></label>
            </div>
            <label className="text-xs font-semibold block">DPI máy in
              <Select value={dpi} onValueChange={setDpi}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="203">203 DPI</SelectItem><SelectItem value="300">300 DPI</SelectItem><SelectItem value="600">600 DPI</SelectItem></SelectContent></Select>
            </label>
            <label className="text-xs font-semibold block">Căn ngang
              <Select value={horizontal} onValueChange={v => setHorizontal(v as Horizontal)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="left">Trái</SelectItem><SelectItem value="center">Giữa</SelectItem><SelectItem value="right">Phải</SelectItem></SelectContent></Select>
            </label>
            <label className="text-xs font-semibold block">Căn dọc
              <Select value={vertical} onValueChange={v => setVertical(v as Vertical)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="top">Trên</SelectItem><SelectItem value="middle">Giữa</SelectItem><SelectItem value="bottom">Dưới</SelectItem></SelectContent></Select>
            </label>
            <p className="text-[11px] text-muted-fg">Khoảng cách được tính từ biên tem theo lựa chọn căn chỉnh.</p>
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={() => void renderActual()} disabled={rendering || !asset?.previewUrl} className="gap-2">{rendering && <RefreshCw size={14} className="animate-spin" />} Xem preview</Button>
              <Button variant="outline" onClick={() => void printTest()} disabled={printing || !asset?.previewUrl || !printerCode} className="gap-2"><Printer size={14} /> In thử</Button>
              <Button variant="secondary" onClick={() => void saveChanges()} disabled={saving || !asset?.previewUrl} className="gap-2">{saving && <RefreshCw size={14} className="animate-spin" />} Lưu chỉnh sửa</Button>
            </div>
            <label className="text-xs font-semibold block">Máy in thực
              <Select value={printerCode} onValueChange={setPrinterCode}>
                <SelectTrigger><SelectValue placeholder="Chọn máy in đang sẵn sàng" /></SelectTrigger>
                <SelectContent>{printers.map(printer => <SelectItem key={printer.printerCode} value={printer.printerCode}>{printer.displayName ?? printer.printerCode} · {printer.printerCode}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            {bitmapInfo && <p className="text-[11px] text-info">{bitmapInfo}</p>}
            {renderError && <p className="text-xs text-error">{renderError}</p>}
            {printMessage && <p className="text-xs text-info flex items-center gap-1"><CheckCircle2 size={13} />{printMessage}</p>}
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <p className="text-xs font-semibold text-muted-fg mb-2">Bitmap đơn sắc trước khi gửi máy in</p>
              <div className="min-h-48 flex items-center justify-center overflow-auto bg-white rounded-lg p-4"><canvas ref={canvasRef} className="max-w-full max-h-64 image-render-pixelated" /></div>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <p className="text-xs font-semibold text-muted-fg mb-2">Render thực tế từ ZPL / Labelary</p>
              <div className="min-h-48 flex items-center justify-center bg-white rounded-lg p-4">{renderedUrl ? <img src={renderedUrl} alt="Render thực tế của icon trên tem" className="max-w-full max-h-72 object-contain" /> : <span className="text-xs text-muted-fg">Bấm “Xem preview” để xem kết quả.</span>}</div>
            </div>
          </div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Đóng</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default IconAssetsTab
