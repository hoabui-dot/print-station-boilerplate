import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

client.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    // Axios/browser must generate the multipart boundary. The client-wide JSON
    // default must not leak into file uploads.
    delete config.headers['Content-Type']
    const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    config.headers['X-Request-Id'] = requestId
    if (config.url?.includes('/label-assets')) {
      const files = Array.from(config.data.entries())
        .filter(([key]) => key === 'file' || key === 'files')
        .map(([, value]) => value instanceof File ? { name: value.name, type: value.type, size: value.size } : { type: typeof value })
      console.info('[LabelAssetUpload] request', { requestId, method: config.method?.toUpperCase(), url: config.url, files })
    }
  }
  return config
})

client.interceptors.response.use(
  res => res,
  err => {
    if (err.config?.url?.includes('label-templates') && err.config?.method === 'post') {
      console.error('[LabelTemplateSave] response error', {
        method: err.config.method?.toUpperCase(),
        url: err.config.url,
        status: err.response?.status,
        response: err.response?.data,
      })
    }
    if (err.config?.url?.includes('/label-assets') && err.config?.method === 'post') {
      console.error('[LabelAssetUpload] response error', {
        requestId: err.config.headers?.['X-Request-Id'],
        method: err.config.method?.toUpperCase(),
        url: err.config.url,
        status: err.response?.status,
        response: err.response?.data,
      })
    }
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client

export const authApi = {
  login: (username: string, password: string) =>
    client.post<{ token: string; userId: string; username: string; fullName: string; expiresAt: string }>('/auth/login', { username, password }),
  me: () => client.get<{ userId: string; username: string; roles: string[]; permissions: string[] }>('/auth/me'),
}

export const rbacApi = {
  getUsers: () => client.get<any[]>('/rbac/users'),
  createUser: (data: { username: string; password?: string; fullName: string; roleCode: string }) =>
    client.post('/rbac/users', data),
  deleteUser: (id: string) => client.delete(`/rbac/users/${id}`),
  getPermissions: () => client.get<any[]>('/rbac/permissions'),
  updateUserPermissions: (userId: string, permissionCodes: string[]) =>
    client.post(`/rbac/users/${userId}/permissions`, { permissionCodes }),
  resetPassword: (userId: string, data: { password?: string; reason: string }) =>
    client.post(`/rbac/users/${userId}/reset-password`, data),
  toggleActive: (userId: string) => client.post(`/rbac/users/${userId}/toggle-active`),
  getUserAuditLogs: (userId: string) => client.get<any[]>(`/rbac/users/${userId}/audit-logs`)
}

export const jobsApi = {
  list: (page = 1, pageSize = 20, status?: string) =>
    client.get('/jobs', { params: { page, pageSize, status } }),
  getById: (id: string) => client.get(`/jobs/${id}`),
  getHistory: (id: string) => client.get(`/jobs/${id}/history`),
  getAttempts: (id: string) => client.get(`/jobs/${id}/attempts`),
  getAttemptSteps: (attemptId: string) => client.get(`/jobs/attempts/${attemptId}/steps`),
}

export const overwriteApi = {
  getPending: () => client.get('/overwrite-requests/pending'),
  create: (jobId: string, overwriteType: string, reason: string) =>
    client.post('/overwrite-requests', { jobId, overwriteType, reason }),
}

export const commandsApi = {
  manualOverride: (data: { 
    jobId: string; 
    jobNo: string; 
    productCode: string; 
    parentAttemptId: string; 
    reasonCode: string; 
    reasonDescription: string; 
    overrideType: string; 
  }) =>
    client.post<{ success: boolean; eventId: string }>('/commands/manual-override', data),

  dispatchOrder: (data: {
    orderNo: string
    dispatchTarget: 'simulation' | 'production-printer'
    notes?: string
  }) =>
    client.post<{ success: boolean; orderNo: string; dispatchTarget: string; dispatched: number; total: number }>(
      '/commands/dispatch-order', data
    ),
}


export const printerApi = {
  list: () => client.get<any[]>('/printers'),
  discover: () => client.get<any[]>('/printers/discover'),
  health: (printerCode: string) => client.get<{
    printerCode: string
    displayName: string
    driverType: string
    cupsQueueName?: string
    status: string
    isReady: boolean
    checkedAt: string
  }>(`/printers/${printerCode}/health`),
  testConnection: (printerCode: string) => client.post<{
    printerCode: string
    driverType: string
    cupsQueueName?: string
    status: string
    isReachable: boolean
    checkedAt: string
  }>(`/printers/${printerCode}/test-connection`),
}

export const templateApi = {
  getWmsBarcodeTemplate: () => client.get<any>('/wms-barcode-template'),
  getWmsBarcodeStyle: () => client.get<{ widthMm: number; heightMm: number; xMm: number; yMm: number; symbology: string; source: string }>('/wms-barcode-style'),
  updateWmsBarcodeStyle: (data: { widthMm: number; heightMm: number; xMm: number; yMm: number }) => client.put('/wms-barcode-style', data),
  list: (params?: { search?: string; dpi?: number; status?: string; layoutType?: string; includeArchived?: boolean }) =>
    client.get<any[]>('/label-templates', { params }),
  fieldCatalog: () => client.get<Array<{ key: string; label: string; source: string; authoritative: boolean; allowedFor: string[]; sampleValue: string }>>('/label-templates/field-catalog'),
  validateDefinition: (templateJson: string, contentMode?: string) =>
    client.post<{ valid: boolean; errors: string[] }>('/label-templates/validate-definition', { templateJson, contentMode }),
  getById: (id: string) => client.get<any>(`/label-templates/${id}`),
  getDefault: () => client.get<any>('/label-templates/default'),
  create: (data: {
    name: string; description?: string; note?: string; dpi: number
    labelWidth: number; labelHeight: number; templateJson: string
    templateCode?: string; category?: string; orientation?: string; revision?: string
    supportedBarcodeTypes?: string; supportedPrinterModels?: string; compatibleStationTypes?: string
    // N-Up layout
    layoutType?: string; sheetColumns?: number; sheetRows?: number; gapMm?: number
  }) =>
    client.post<any>('/label-templates', data),
  update: (id: string, data: {
    name: string; description?: string; note?: string; dpi: number
    labelWidth: number; labelHeight: number; templateJson: string
    templateCode?: string; category?: string; orientation?: string; revision?: string
    supportedBarcodeTypes?: string; supportedPrinterModels?: string; compatibleStationTypes?: string
    // N-Up: only gapMm is adjustable after creation
    gapMm?: number
  }) =>
    // Use POST at the browser boundary because some station tunnels reject PUT.
    // The kiosk API still forwards this as PUT to printer-adapter.
    client.post<any>(`/label-templates/${id}/save`, data).then(response => {
      console.info('[LabelTemplateSave] success', { method: 'POST', url: `/label-templates/${id}/save`, status: response.status })
      return response
    }),
  delete: (id: string) => client.delete(`/label-templates/${id}`),
  duplicate: (id: string) => client.post<any>(`/label-templates/${id}/duplicate`),
  publish: (id: string) => client.post<any>(`/label-templates/${id}/publish`),
  archive: (id: string) => client.post<any>(`/label-templates/${id}/archive`),
  setDefault: (id: string) => client.post<any>(`/label-templates/${id}/set-default`),
  exportTemplate: (id: string) => client.get(`/label-templates/${id}/export`, { responseType: 'blob' }),
  importTemplate: (data: object) => client.post<any>('/label-templates/import', data),
  getVersions: (id: string) => client.get<any[]>(`/label-templates/${id}/versions`),
  render: (templateJson: string, data: Record<string, string>) =>
    client.post<{ zpl: string; rendererType: string }>('/label-templates/render', { templateJson, data }),
  previewZpl: (zpl: string, dpi: number, width: number, height: number) =>
    client.post<Blob>('/label-templates/preview', { zpl, dpi, width: width / 25.4, height: height / 25.4 }, { responseType: 'blob' }),
  printTest: (id: string, data: { printerCode?: string; data?: Record<string, string>; correlationId?: string }) =>
    client.post<any>(`/label-templates/${id}/print-test`, data),
  printRawTest: (data: { printerCode: string; zpl: string; correlationId?: string }) =>
    client.post<any>('/print-test/raw', data),
  // Printer assignments
  getAssignments: () => client.get<any[]>('/printer-template-assignments'),
  getAssignment: (printerCode: string) => client.get<any>(`/printer-template-assignments/${printerCode}`),
  assignTemplate: (printerCode: string, templateId: string) =>
    client.post('/printer-template-assignments', { printerCode, templateId }),
  removeAssignment: (printerCode: string) => client.delete(`/printer-template-assignments/${printerCode}`),
  // Print history
  getPrintHistory: (page = 1, pageSize = 50) =>
    client.get<any[]>('/print-history', { params: { page, pageSize } }),
  getPrintHistoryDetail: (id: string) => client.get<any>(`/print-history/${id}`),
  // Printer management (directly backed by the Printer Adapter)
  getPrintersReady: (includeSimulation = false) =>
    client.get<any[]>('/printers/ready', { params: includeSimulation ? { includeSimulation: true } : undefined }),
  getPrintersActive: () => client.get<any[]>('/printers/active'),
  activatePrinter: (printerCode: string, templateId: string, activatedBy?: string) =>
    client.post(`/printers/${printerCode}/activate`, { templateId, activatedBy }),
  deactivatePrinter: (printerCode: string) =>
    client.post(`/printers/${printerCode}/deactivate`),
  getPrinterMaintenance: (printerCode: string) =>
    client.get<any>(`/printers/${printerCode}/maintenance`),
}

export const assetApi = {
  list: (search?: string) => client.get<any[]>('/label-assets', { params: search ? { search } : undefined }),
  content: (id: string) => client.get<Blob>(`/label-assets/${id}/content`, { responseType: 'blob' }),
  updatePrintSettings: (id: string, settings: {
    labelWidthMm: number
    labelHeightMm: number
    dpi: number
    iconWidthMm: number
    iconHeightMm: number
    horizontal: string
    vertical: string
  }) => client.put(`/label-assets/${id}`, settings),
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    // Let the browser/Axios generate the multipart boundary. Setting this header
    // manually can produce a body without a boundary and a misleading 400.
    return client.post('/label-assets', form)
  },
  uploadMany: (files: File[]) => {
    const form = new FormData()
    files.forEach(file => form.append('files', file))
    return client.post('/label-assets', form)
  },
  deactivate: (id: string) => client.delete(`/label-assets/${id}`),
}
