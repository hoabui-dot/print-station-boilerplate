/** Job status codes */
export const JOB_STATUSES = {
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  PROCESSING: 'PROCESSING',
  PREPARING: 'PREPARING',
  WAIT_REWORK: 'WAIT_REWORK',
  QUEUED: 'QUEUED',
  CREATED: 'CREATED',
  CANCELLED: 'CANCELLED',
  RECEIVED: 'RECEIVED',
  PRINTING: 'PRINTING',
  VERIFYING: 'VERIFYING',
} as const

/** Job type codes */
export const JOB_TYPES = {
  PRINT_LABEL: 'PRINT_LABEL',
  LASER_MARK: 'LASER_MARK',
  FULL_PROCESS: 'FULL_PROCESS',
  PRINT_AND_MARK: 'PRINT_AND_MARK',
  VERIFY_ONLY: 'VERIFY_ONLY',
  REWORK: 'REWORK',
} as const

/** Vietnamese labels for job status codes */
export const JOB_STATUS_LABELS: Record<string, string> = {
  [JOB_STATUSES.COMPLETED]: 'Hoàn thành',
  [JOB_STATUSES.FAILED]: 'Thất bại',
  [JOB_STATUSES.PROCESSING]: 'Đang xử lý',
  [JOB_STATUSES.PREPARING]: 'Chuẩn bị nhãn...',
  [JOB_STATUSES.WAIT_REWORK]: 'Chờ làm lại',
  [JOB_STATUSES.QUEUED]: 'Đang trong hàng chờ',
  [JOB_STATUSES.CREATED]: 'Đã tạo',
  [JOB_STATUSES.CANCELLED]: 'Đã hủy',
  [JOB_STATUSES.RECEIVED]: 'Đã nhận yêu cầu',
  [JOB_STATUSES.PRINTING]: 'Đang in/khắc',
  [JOB_STATUSES.VERIFYING]: 'Đang kiểm tra',
}

/** Vietnamese labels for job type codes */
export const JOB_TYPE_LABELS: Record<string, string> = {
  [JOB_TYPES.PRINT_LABEL]: 'In nhãn',
  [JOB_TYPES.LASER_MARK]: 'Khắc laser',
  [JOB_TYPES.FULL_PROCESS]: 'Quy trình đầy đủ',
  [JOB_TYPES.PRINT_AND_MARK]: 'In nhãn & Khắc laser',
  [JOB_TYPES.VERIFY_ONLY]: 'Kiểm tra vision',
  [JOB_TYPES.REWORK]: 'Làm lại',
}

/** Tailwind background color classes for job status badges */
export const JOB_STATUS_COLORS: Record<string, string> = {
  [JOB_STATUSES.COMPLETED]: 'bg-status-success',
  [JOB_STATUSES.FAILED]: 'bg-status-error',
  [JOB_STATUSES.PROCESSING]: 'bg-brand',
  [JOB_STATUSES.PREPARING]: 'bg-accent-color',
  [JOB_STATUSES.WAIT_REWORK]: 'bg-status-warning',
  [JOB_STATUSES.QUEUED]: 'bg-muted',
  [JOB_STATUSES.CREATED]: 'bg-muted',
  [JOB_STATUSES.CANCELLED]: 'bg-muted',
  [JOB_STATUSES.RECEIVED]: 'bg-status-info',
  [JOB_STATUSES.PRINTING]: 'bg-accent-color',
  [JOB_STATUSES.VERIFYING]: 'bg-accent-color',
}
