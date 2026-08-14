import { createContext, useContext, useState, type ReactNode } from 'react'
import {
  flexRender, getCoreRowModel, getPaginationRowModel, useReactTable,
  type ColumnDef, type PaginationState,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function BaseModal({ open, onOpenChange, title, description, children, footer, className = 'max-w-4xl' }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string
  children: ReactNode; footer?: ReactNode; className?: string
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={`max-h-[88vh] overflow-y-auto bg-card border-border text-foreground ${className}`}>
      <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
      {children}
      {footer && <DialogFooter className="border-t border-border pt-4">{footer}</DialogFooter>}
    </DialogContent>
  </Dialog>
}

type ToastMessage = { id: number; title?: string; description: string; variant: 'default' | 'success' | 'error' }
const ToastContext = createContext<{ toast: (message: Omit<ToastMessage, 'id'>) => void }>({ toast: () => undefined })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([])
  const toast = (message: Omit<ToastMessage, 'id'>) => {
    const id = Date.now() + Math.random()
    setMessages(current => [...current, { ...message, id }])
    window.setTimeout(() => setMessages(current => current.filter(item => item.id !== id)), 4500)
  }
  return <ToastContext.Provider value={{ toast }}>
    {children}
    <div className="fixed right-4 top-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {messages.map(message => <div key={message.id} className={`rounded-lg border px-4 py-3 shadow-lg bg-card ${message.variant === 'error' ? 'border-error/40 text-error' : message.variant === 'success' ? 'border-success/40 text-success' : 'border-border text-foreground'}`}>
        <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="font-semibold text-sm">{message.title}</p><p className="text-xs text-muted-fg">{message.description}</p></div><button type="button" onClick={() => setMessages(current => current.filter(item => item.id !== message.id))} title="Đóng thông báo"><X size={14} /></button></div>
      </div>)}
    </div>
  </ToastContext.Provider>
}

export const useToast = () => useContext(ToastContext)

export function TablePagination({ pageIndex, pageCount, pageSize, total, onPageChange, onPageSizeChange }: { pageIndex: number; pageCount: number; pageSize: number; total: number; onPageChange: (index: number) => void; onPageSizeChange: (size: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-fg">
    <div className="flex items-center gap-3"><span>Tổng {total} mục</span><label className="flex items-center gap-2">Hiển thị<select value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))} className="h-8 rounded-md border border-border bg-surface px-2 text-foreground"><option value={10}>10</option><option value={50}>50</option><option value={100}>100</option></select>/ trang</label></div>
    <span>Trang {total === 0 ? 0 : pageIndex + 1} / {pageCount}</span>
    <div className="flex items-center gap-1"><Button variant="outline" size="icon" disabled={pageIndex === 0} onClick={() => onPageChange(pageIndex - 1)} title="Trang trước"><ChevronLeft size={15} /></Button><Button variant="outline" size="icon" disabled={pageIndex >= pageCount - 1} onClick={() => onPageChange(pageIndex + 1)} title="Trang sau"><ChevronRight size={15} /></Button></div>
  </div>
}

export function DataTable<TData>({ columns, data, loading, empty, pageSize = 10, getRowId }: {
  columns: ColumnDef<TData>[]; data: TData[]; loading?: boolean; empty?: ReactNode; pageSize?: number; getRowId?: (row: TData) => string
}) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize })
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  const table = useReactTable({ data, columns, state: { pagination, columnVisibility }, onPaginationChange: setPagination, onColumnVisibilityChange: setColumnVisibility, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel(), getRowId })
  const rows = table.getRowModel().rows
  return <div className="overflow-hidden rounded-xl border border-border bg-card">
    <div className="flex items-center justify-between border-b border-border px-4 py-2"><span className="text-xs text-muted-fg">{data.length} mục</span><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm">Cột hiển thị</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Chọn cột</DropdownMenuLabel><DropdownMenuSeparator />{table.getAllLeafColumns().filter(column => column.getCanHide()).map(column => <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={value => column.toggleVisibility(!!value)} onSelect={event => event.preventDefault()}>{typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu></div>
    <Table><TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
      <TableBody>{loading ? <TableRow><TableCell colSpan={table.getVisibleLeafColumns().length} className="py-16 text-center text-muted-fg">Đang tải dữ liệu...</TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={table.getVisibleLeafColumns().length} className="py-16 text-center text-muted-fg">{empty ?? 'Chưa có dữ liệu.'}</TableCell></TableRow> : rows.map(row => <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody>
    </Table><TablePagination pageIndex={pagination.pageIndex} pageCount={table.getPageCount()} pageSize={pagination.pageSize} total={data.length} onPageChange={index => table.setPageIndex(index)} onPageSizeChange={size => setPagination(current => ({ ...current, pageIndex: 0, pageSize: size }))} />
  </div>
}

export function CommonTabs({ value, onValueChange, items }: { value: string; onValueChange: (value: string) => void; items: { value: string; label: string; icon?: ReactNode }[] }) {
  return <div role="tablist" className="flex flex-wrap gap-2 border-b border-border">{items.map(item => <button key={item.value} role="tab" aria-selected={value === item.value} type="button" onClick={() => onValueChange(item.value)} className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${value === item.value ? 'border-brand text-brand-light' : 'border-transparent text-muted-fg hover:text-foreground'}`}>{item.icon}{item.label}</button>)}</div>
}

export function CommonBadge(props: BadgeProps) { return <Badge {...props} /> }
