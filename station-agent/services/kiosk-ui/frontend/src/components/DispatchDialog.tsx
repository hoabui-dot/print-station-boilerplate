import { useEffect, useState, useCallback } from 'react'
import { Printer as PrinterIcon, Cpu, CheckCircle2, XCircle, Loader2, Wifi, WifiOff, AlertTriangle, Zap } from 'lucide-react'
import { printerApi } from '@/api/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DispatchTarget = 'simulation' | 'production-printer'

export interface DispatchDialogProps {
  open: boolean
  onClose: () => void
  /** Called when operator confirms dispatch. Receives the chosen target. */
  onConfirm: (target: DispatchTarget, notes: string) => void
  /** Number of items / jobs to be dispatched */
  itemCount: number
  jobType: string
  isSubmitting?: boolean
}

interface PrinterHealth {
  printerCode: string
  displayName: string
  driverType: string
  cupsQueueName?: string
  status: string
  isReady: boolean
}

// ── CUPS printer code (physical Zebra ZD421, 300 dpi) ─────────────────────────
const PHYSICAL_PRINTER_CODE = 'Zebra-GK420t-CUPS'

// ── Status helpers ─────────────────────────────────────────────────────────────

function StatusDot({ ready, status }: { ready: boolean; status: string }) {
  const s = status?.toLowerCase()
  if (s === 'idle' || s === 'printing' || ready)
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-status-success shadow-md mr-1.5 animate-pulse" />
  if (s === 'offline' || s === 'disconnected')
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-status-error mr-1.5" />
  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-status-warning mr-1.5 animate-pulse" />
}

function statusColor(ready: boolean, status: string) {
  const s = status?.toLowerCase()
  if (s === 'idle' || s === 'printing' || ready) return 'text-status-success'
  if (s === 'offline' || s === 'disconnected') return 'text-status-error'
  return 'text-status-warning'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DispatchDialog({
  open, onClose, onConfirm, itemCount, jobType, isSubmitting = false
}: DispatchDialogProps) {
  const savedTarget = (localStorage.getItem('dispatch-target') ?? 'simulation') as DispatchTarget
  const [target, setTarget] = useState<DispatchTarget>(savedTarget)
  const [notes, setNotes] = useState('')
  const [printerHealth, setPrinterHealth] = useState<PrinterHealth | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  // Persist last chosen target
  useEffect(() => {
    localStorage.setItem('dispatch-target', target)
  }, [target])

  // Fetch printer health when Production Printer is selected
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true)
    setHealthError(null)
    setTestResult(null)
    try {
      const res = await printerApi.health(PHYSICAL_PRINTER_CODE)
      setPrinterHealth(res.data)
    } catch {
      setHealthError('Cannot reach printer adapter service. Is it running?')
      setPrinterHealth(null)
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && target === 'production-printer') {
      fetchHealth()
    }
    if (!open) {
      // Reset transient state on close
      setTestResult(null)
      setHealthError(null)
    }
  }, [open, target, fetchHealth])

  const handleTestConnection = async () => {
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await printerApi.testConnection(PHYSICAL_PRINTER_CODE)
      setTestResult(res.data.isReachable ? 'success' : 'fail')
      // Refresh status
      await fetchHealth()
    } catch {
      setTestResult('fail')
    } finally {
      setTestLoading(false)
    }
  }

  const canDispatch =
    target === 'simulation' ||
    (target === 'production-printer' && printerHealth?.isReady === true)

  const handleConfirm = () => {
    if (!canDispatch || isSubmitting) return
    onConfirm(target, notes)
  }

  const jobTypeLabel = () => {
    const jt = jobType?.toUpperCase()
    if (jt === 'PRINT_ONLY' || jt === 'PRINT_LABEL') return 'In nhãn (Print Label)'
    if (jt === 'PRINT_AND_MARK' || jt === 'FULL_PROCESS') return 'In & Khắc (Print + Mark)'
    return jobType || 'Standard'
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !isSubmitting) onClose() }}>
      <DialogContent
        className="max-w-lg bg-card border border-border text-foreground shadow-2xl rounded-2xl overflow-hidden p-0"
        style={{ maxWidth: 540 }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border bg-gradient-to-r from-surface-3 to-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-on-strong">
              <Zap size={18} className="text-brand" />
              Dispatch Production Jobs
            </DialogTitle>
            <DialogDescription className="text-sm text-on-strong/50 mt-1">
              Select the execution target before dispatching.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ── Execution Target ── */}
          <div>
            <p className="text-xs font-semibold text-on-strong/40 uppercase tracking-widest mb-3">
              Execution Target
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* Simulation */}
              <button
                onClick={() => setTarget('simulation')}
                className={`relative flex flex-col items-start gap-1.5 p-4 rounded-xl border transition-all duration-200 text-left cursor-pointer
                  ${target === 'simulation'
                    ? 'border-brand bg-brand/10 shadow-md'
                    : 'border-on-strong/10 bg-overlay/5 hover:border-on-strong/25 hover:bg-overlay/8'}`}
                id="dispatch-target-simulation"
              >
                <div className={`flex items-center gap-2 ${target === 'simulation' ? 'text-brand-light' : 'text-on-strong/70'}`}>
                  <Cpu size={16} />
                  <span className="font-semibold text-sm">Simulation</span>
                </div>
                <p className="text-xs text-on-strong/40 leading-relaxed">
                  Device Simulator — no physical labels printed.
                </p>
                {target === 'simulation' && (
                  <span className="absolute top-3 right-3">
                    <CheckCircle2 size={14} className="text-brand" />
                  </span>
                )}
              </button>

              {/* Production Printer */}
              <button
                onClick={() => setTarget('production-printer')}
                className={`relative flex flex-col items-start gap-1.5 p-4 rounded-xl border transition-all duration-200 text-left cursor-pointer
                  ${target === 'production-printer'
                    ? 'border-status-success/60 bg-status-success/10 shadow-md'
                    : 'border-on-strong/10 bg-overlay/5 hover:border-on-strong/25 hover:bg-overlay/8'}`}
                id="dispatch-target-production-printer"
              >
                <div className={`flex items-center gap-2 ${target === 'production-printer' ? 'text-status-success' : 'text-on-strong/70'}`}>
                  <PrinterIcon size={16} />
                  <span className="font-semibold text-sm">Production Printer</span>
                </div>
                <p className="text-xs text-on-strong/40 leading-relaxed">
                  Zebra ZD421 (300 dpi) — physical labels via CUPS.
                </p>
                {target === 'production-printer' && (
                  <span className="absolute top-3 right-3">
                    <CheckCircle2 size={14} className="text-status-success" />
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ── Connection Info (Physical Printer only) ── */}
          {target === 'production-printer' && (
            <div className="rounded-xl border border-on-strong/10 bg-overlay/5 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-on-strong/10 bg-overlay/3">
                <span className="text-xs font-semibold text-on-strong/50 uppercase tracking-widest">
                  Connection
                </span>
                <button
                  onClick={fetchHealth}
                  disabled={healthLoading}
                  className="text-xs text-brand-light hover:text-brand transition-colors flex items-center gap-1"
                >
                  {healthLoading
                    ? <><Loader2 size={11} className="animate-spin" /> Checking...</>
                    : <><Wifi size={11} /> Refresh</>
                  }
                </button>
              </div>

              {healthLoading && !printerHealth ? (
                <div className="flex items-center justify-center py-6 gap-2 text-on-strong/40 text-sm">
                  <Loader2 size={16} className="animate-spin" />
                  Checking printer status...
                </div>
              ) : healthError ? (
                <div className="flex items-center gap-2 px-4 py-4 text-status-error text-sm">
                  <WifiOff size={14} />
                  {healthError}
                </div>
              ) : printerHealth ? (
                <div className="divide-y divide-on-strong/5">
                  {[
                    ['Printer', printerHealth.displayName],
                    ['Protocol', 'IPP / CUPS'],
                    ['Host', 'localhost'],
                    ['Port', '631'],
                    ['Queue', printerHealth.cupsQueueName ?? '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-on-strong/40">{label}</span>
                      <span className="text-xs text-on-strong/80 font-mono">{value}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-on-strong/40">Status</span>
                    <span className={`text-xs font-semibold flex items-center ${statusColor(printerHealth.isReady, printerHealth.status)}`}>
                      <StatusDot ready={printerHealth.isReady} status={printerHealth.status} />
                      {printerHealth.status}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Test connection */}
              <div className="px-4 py-3 border-t border-on-strong/10 flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testLoading || healthLoading}
                  className="h-7 text-xs border-on-strong/15 bg-transparent hover:bg-overlay/10 text-on-strong/70"
                  id="btn-test-connection"
                >
                  {testLoading ? <><Loader2 size={11} className="animate-spin mr-1" />Testing...</> : 'Test Connection'}
                </Button>
                {testResult === 'success' && (
                  <span className="text-xs text-status-success flex items-center gap-1">
                    <CheckCircle2 size={12} /> Connection OK
                  </span>
                )}
                {testResult === 'fail' && (
                  <span className="text-xs text-status-error flex items-center gap-1">
                    <XCircle size={12} /> Connection failed
                  </span>
                )}
              </div>

              {/* Validation warning */}
              {!printerHealth?.isReady && !healthLoading && !healthError && (
                <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-status-error/10 border border-status-error/20 px-3 py-2.5">
                  <AlertTriangle size={13} className="text-status-error mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-status-error">
                    Printer is not ready. Dispatch is disabled until the printer is Online.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Dispatch Summary ── */}
          <div className="rounded-xl border border-on-strong/10 bg-overlay/5 divide-y divide-on-strong/5">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-on-strong/40">Jobs to dispatch</span>
              <Badge variant="outline" className="text-xs border-on-strong/20 text-on-strong/70">{itemCount} items</Badge>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-on-strong/40">Job Type</span>
              <span className="text-xs text-on-strong/70">{jobTypeLabel()}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-on-strong/40">Target</span>
              <span className={`text-xs font-semibold ${target === 'production-printer' ? 'text-status-success' : 'text-brand-light'}`}>
                {target === 'production-printer' ? 'Production Printer' : 'Simulation Environment'}
              </span>
            </div>
          </div>

          {/* ── Notes ── */}
          <div>
            <label htmlFor="dispatch-notes" className="block text-xs text-on-strong/40 mb-1.5">
              Dispatch Notes <span className="text-on-strong/25">(optional)</span>
            </label>
            <textarea
              id="dispatch-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Add notes for this dispatch..."
              className="w-full rounded-lg bg-overlay/5 border border-on-strong/10 text-sm text-on-strong/80 placeholder-white/25 px-3 py-2 resize-none focus:outline-none focus:border-brand/50 focus:bg-overlay/8 transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border bg-surface-2 flex items-center gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 border-on-strong/15 bg-transparent hover:bg-overlay/10 text-on-strong/70 h-10"
            id="btn-dispatch-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canDispatch || isSubmitting}
            className={`flex-1 h-10 font-semibold transition-all duration-200 ${
              target === 'production-printer'
                ? 'bg-status-success hover:bg-status-success text-on-strong disabled:bg-status-success disabled:text-status-success'
                : 'bg-brand hover:bg-brand/90 text-on-strong disabled:opacity-40'
            }`}
            id="btn-dispatch-confirm"
          >
            {isSubmitting ? (
              <><Loader2 size={14} className="animate-spin mr-2" />Dispatching...</>
            ) : (
              <>
                {target === 'production-printer' ? <PrinterIcon size={14} className="mr-2" /> : <Cpu size={14} className="mr-2" />}
                Dispatch {itemCount > 0 ? `${itemCount} Job${itemCount !== 1 ? 's' : ''}` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
