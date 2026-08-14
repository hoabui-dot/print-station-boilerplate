# Trace luồng in Barcode/QR từ MES đến trạm in

## 1. Mục đích

Tài liệu này mô tả payload mà MES gửi cho trạm in, cách payload đi qua Kafka và cách `printer-adapter` map payload vào Label Template trước khi render ZPL gửi tới máy in Zebra/CUPS.

Phạm vi gồm barcode, QR Code và các text field nằm trong cùng Label Template. Tài liệu phân biệt rõ:

- dữ liệu do `mes-execution-service` gửi;
- dữ liệu do shared outbox relay chuyển tiếp;
- dữ liệu do `printer-adapter` tự bổ sung hoặc ghi đè;
- field nào của template có thể map được và field nào có nguy cơ không có dữ liệu.

## 2. Luồng runtime hiện tại

```text
MES Console / MES execution API
        |
        v
mes-execution-service
  queueReadyOperations()
  tạo event command.printer.print.batch
        |
        v
execution outbox_events (transactional)
        |
        v
shared-kernel OutboxRelayWorker
  logical event: command.printer.print.batch
  physical topic: station.commands.printer
        |
        v
printer-adapter / BatchPrintConsumer
  nhận command.printer.print.batch
  chọn printer và published Label Template
  BuildBaseVariables + BuildLabelVariables
  render JSON template thành ZPL
  đưa ZPL vào IPrintQueue
        |
        v
CUPS / Zebra printer
        |
        v
station.events.printer
  printer-adapter trả kết quả
        |
        v
mes-execution-service / PrinterResultConsumer
```

### Service sở hữu từng bước

| Bước | Service/module | Topic hoặc storage | Trách nhiệm |
|---|---|---|---|
| Tạo lệnh in | `services/mes-execution-service` | `outbox_events` | Tính số label, số bản copy và tạo payload batch |
| Relay | `libs/shared-kernel-go` | Kafka `station.commands.printer` | Đổi event logic thành physical topic và publish payload nguyên dạng |
| Nhận lệnh | `printer-marking/station-agent/services/printer-adapter` | `BatchPrintConsumer` | Chọn printer/template, map field, render ZPL |
| Gửi máy in | `printer-adapter` | `IPrintQueue` -> CUPS | Gửi ZPL tới printer thật hoặc simulator |
| Trả kết quả | `printer-adapter` | `station.events.printer` | Trả success/failure theo batch |
| Cập nhật MES | `mes-execution-service` | `wo_print_job`, `wo_operation` | Ghi nhận kết quả và trạng thái công đoạn in |

## 3. Log trace đã bổ sung

Có thể lọc log bằng chuỗi `MES_PRINT_PIPELINE`.

### 3.1. MES trước khi ghi outbox

File: `services/mes-execution-service/internal/application/usecase/dispatch_execution.go`

Log stage:

```text
[MES_PRINT_PIPELINE] stage=outbox_payload ... payload={...}
```

Log này ghi `event_id`, `job_id`, WO, operation, print station, adapter, số label, số copy và toàn bộ payload JSON mà MES chuẩn bị ghi vào outbox.

### 3.2. Printer Adapter

File: `print-marking/station-agent/services/printer-adapter/src/ND.PrinterAdapter.Infrastructure/Messaging/BatchPrintConsumer.cs`

Các stage:

| Stage | Ý nghĩa |
|---|---|
| `adapter_received` | Payload batch adapter thực sự deserialize được |
| `adapter_label_items` | Danh sách từng label, serial và sequence |
| `template_selected` | Template published được chọn theo printer assignment/default/fallback |
| `template_bindings` | Binding trong template và các key runtime đang có |
| `label_mapping` | Kết quả map từng binding của từng label |
| `printer_queue` | Số label, kích thước ZPL và printer/CUPS queue nhận lệnh |

Correlation chính cần đối chiếu: `event_id` của batch. Với từng label, dùng thêm `label_job_id`.

## 4. Payload MES gửi cho use case WO in sản phẩm

Đây là event `command.printer.print.batch` được tạo khi operation có `execution_target_type = PRINT_STATION`.

### 4.1. Field cấp batch

| Field JSON | Nguồn/ý nghĩa | Có phải giá trị template trực tiếp không |
|---|---|---|
| `event_type` | `command.printer.print.batch` | Không, metadata event |
| `event_id` | UUID command in | Không, dùng trace/correlation |
| `job_id` | `wo_print_job.print_job_id` | Không, idempotency/audit |
| `job_no` | Mã WO | Không, adapter dùng làm `production_order` nếu cần |
| `job_type` | `MES_WO_PRINT` | Có thể map vào `operation` qua adapter |
| `product_code` | Item code của WO | Có, adapter map thành `product_code` |
| `product_serial` | Hiện tại là `null` ở cấp batch | Không nên dùng cấp batch cho serial |
| `status` | `PROCESSING` | Không |
| `source_system` | `mes-execution-service` | Không |
| `timestamp` | Thời điểm tạo command UTC | Không |
| `attempt_no` | Lần in/retry | Không, hiện chưa tự động map vào template |
| `payload_json` | JSON hiện tại gồm `workOrderId`, `woOperationId`, `quantity`, `itemName` | Chưa phải map chuẩn cho template |
| `dispatch_target` | `production-printer` hoặc `simulation` | Không |
| `target_printer` | Hiện tại thường `null`; adapter chọn CUPS khi production | Không |
| `printJobId` | ID print job | Không |
| `workOrderId` | UUID WO | Không trực tiếp, chỉ nằm trong payload nguồn |
| `woOperationId` | UUID WO operation | Không trực tiếp |
| `printStationId` | Mã print station đã resolve từ workstation | Không trực tiếp |
| `adapterId` | Mã adapter, mặc định `PRINT-ADAPTER-01` | Không trực tiếp |
| `operationCode` | Mã operation | Có thể map vào `operation` nếu template binding dùng key tương ứng, nhưng hiện adapter không lấy field này thành runtime variable chuẩn |
| `quantity` | Sản lượng WO | Có thể dùng cho template nếu mapping được bổ sung |
| `requested_quantity` | Sản lượng yêu cầu | Có thể dùng cho template nếu mapping được bổ sung |
| `production_standard_base_quantity` | Cơ sở tính số label | Không |
| `calculated_cycles` | Số chu kỳ tính được | Không |
| `required_labels` | Số label cần in | Không |
| `labels_per_cycle` | Số label trên một chu kỳ | Không |
| `units_per_label` | Số đơn vị trên một label | Không |
| `label_quantity_method` | Phương pháp tính số label | Không |
| `label_count` | Số label logic | Không |
| `copies_per_label` | Số bản copy mỗi label | Không |
| `print_copies` | Tổng số bản in | Không |
| `total_copies` | Tổng số bản in | Không |
| `demo_mode` | Cờ demo/approval | Không |
| `label_items` | Danh sách label cụ thể | Xem bảng dưới |
| `batch_size` | Kích thước chunk gửi máy in | Không |
| `production_order_no` | Mã WO | Có thể map vào `production_order` |
| `correlationId` | Trace của flow MES | Có thể dùng làm `trace_id` |

### 4.2. Field từng label trong `label_items`

```json
{
  "job_id": "<print-job-id>-label-001-copy-01",
  "product_serial": "<WO_CODE>-001",
  "sequence": 1
}
```

| Field | Ý nghĩa | Adapter map thành |
|---|---|---|
| `job_id` | ID duy nhất của bản label | `trace_id` của label |
| `product_serial` | Serial được sinh từ `WO_CODE-sequence` | `serial_number` và `work_order` |
| `sequence` | Thứ tự label | Hiện chưa expose thành runtime key riêng |

**Lưu ý quan trọng:** `product_serial` cấp batch đang là `null`, nhưng serial thật nằm trong từng `label_items[].product_serial`. Barcode/QR theo serial phải bind qua `serial_number`, không bind vào field cấp batch `product_serial`.

## 5. Runtime variables thực tế tại printer-adapter

`BatchPrintConsumer` không truyền nguyên payload vào template. Adapter tạo một dictionary runtime.

### 5.1. Giá trị lấy từ MES hoặc label item

| Runtime key | Nguồn hiện tại | Ghi chú |
|---|---|---|
| `production_order` | `cmd.ProductionOrderNo` | Mã WO |
| `product_code` | `cmd.ProductCode` | Item code |
| `serial_number` | `label_items[].product_serial` | Giá trị đúng theo từng label |
| `work_order` | `label_items[].product_serial` | Hiện đang trùng serial, không phải mã WO thuần |
| `trace_id` | `label_items[].job_id` | Trace theo từng label |
| `operation` | `cmd.JobType` | Hiện là `MES_WO_PRINT`, không phải operation code |
| các key trong `payload_json.data[]` | `tag -> value` | Hiện payload MES của WO không tạo mảng `data[]` |

### 5.2. Giá trị mặc định hoặc suy ra tại adapter

Các giá trị dưới đây **không phải field authoritative do MES gửi xuống**:

| Runtime key | Giá trị mặc định hiện tại |
|---|---|
| `workflow` | `Default Workflow` |
| `station` | `STATION-01` |
| `team` | `Team A` |
| `operator` | `admin.operator` |
| `product_name` | `<product_code> Industrial Part` |
| `revision` | `Rev A` |
| `customer` | `Won Seal Tech` |
| `material` | `NBR-70` |
| `rubber_type` | `Synthetic Rubber` |
| `lot_number` | `LOT-2026-07-A` |
| `batch_number` | `BATCH-01` |
| `manufacture_date` | ngày UTC hiện tại |
| `expiry_date` | ngày UTC hiện tại + 2 năm |
| `country` | `Vietnam` |

Đây là rủi ro nghiệp vụ: nếu Label Template hiển thị revision, lot, batch, customer, material hoặc ngày sản xuất, màn hình có thể hiển thị dữ liệu giả/mặc định thay vì dữ liệu của WO.

## 6. Mapping cho Barcode và QR Code

### Barcode

Template phải có element dạng:

```json
{
  "type": "barcode",
  "symbology": "CODE128",
  "binding": "serial_number"
}
```

Với WO batch hiện tại, `serial_number` được lấy từ `label_items[].product_serial` và mỗi label có giá trị khác nhau theo sequence.

### QR Code

Template có thể dùng binding đơn:

```json
{
  "type": "qr",
  "binding": "serial_number"
}
```

Hoặc dùng `payloadTemplate`, ví dụ:

```json
{
  "type": "qr",
  "payloadTemplate": "{\"serial\":\"{serial_number}\",\"product\":\"{product_code}\",\"revision\":\"{revision}\"}"
}
```

Mọi placeholder trong `payloadTemplate` phải tồn tại trong runtime dictionary. Nếu không, QR payload không phản ánh đúng dữ liệu cấu hình.

### Quy tắc kiểm tra mapping

1. Tên `binding` trong template phải trùng key runtime, không trùng tên hiển thị tiếng Việt.
2. Barcode/QR phải có giá trị khác rỗng tại `label_mapping` log.
3. Template được chọn phải là bản `published`, active và đúng printer assignment/default.
4. Không dùng `defaultValue` của template như dữ liệu sản xuất; đó chỉ là giá trị preview/fallback.
5. Với serial, kiểm tra từng `label_job_id`, không chỉ kiểm tra batch.

## 7. Các use case hiện tại

### Use case A: WO chạy thật có công đoạn in

Điều kiện: operation có `execution_target_type = PRINT_STATION`, workstation resolve được print station readiness.

Flow:

1. MES tính `label_count` từ quantity/base quantity hoặc policy của operation.
2. MES tạo `label_items` cho từng label/copy.
3. MES ghi event batch vào outbox trong cùng transaction với trạng thái dispatch.
4. Relay publish lên `station.commands.printer`.
5. Adapter chọn published template và in từng label trong các chunk.

### Use case B: Demo/approval print hoặc queue trực tiếp các operation in

`QueueDemoPrintOperationsTx` dùng cùng cơ chế `queueReadyOperations` để tạo batch print payload. Khác biệt nằm ở thời điểm gọi và cờ `demo_mode`; cấu trúc field template vẫn phải tuân theo mapping ở tài liệu này.

### Use case C: Retry print

Khi print job ở trạng thái `Failed` hoặc `RetryPending`, MES dùng lại print job, tăng `attempt_no`, tạo command event mới và gửi lại batch. Adapter vẫn chọn template hiện hành theo assignment/default. Vì vậy cần lưu ý version/template có thể khác lần in trước nếu template đã được thay đổi hoặc assignment bị đổi.

### Use case D: Nhánh Job Processing cũ/legacy

`JobProcessingConsumer` là nhánh contract khác dùng `JobProcessingEvent` trên `station.job-events`. Nhánh này tự dựng thêm nhiều default variables và không phải payload batch `command.printer.print.batch` của flow WO hiện tại. Khi trace production WO, ưu tiên log `BatchPrintConsumer`; chỉ dùng log legacy nếu event thực tế có `event_type = JobProcessing`.

## 8. Các mismatch đã xác định

1. MES gửi `payload_json` hiện chỉ có `workOrderId`, `woOperationId`, `quantity`, `itemName`; chưa phải canonical template data map.
2. MES gửi `product_serial: null` ở cấp batch; serial thực tế chỉ có ở `label_items`.
3. `operationCode`, `itemName`, revision, lot, batch, customer và ngày sản xuất chưa được chuyển đầy đủ thành runtime variables authoritative.
4. Adapter đang dùng nhiều giá trị default cố định cho các field có thể xuất hiện trên tem.
5. MES command hiện không gửi `template_id`/`template_version`; template được chọn theo printer assignment, system default hoặc published template mới nhất.
6. `job_type` đang được map thành `operation`, nhưng giá trị là `MES_WO_PRINT`, không phải mã công đoạn sản xuất.

## 9. Cách trace một lệnh cụ thể

```bash
# MES execution log
docker compose logs -f mes-execution-service | rg 'MES_PRINT_PIPELINE'

# Printer adapter log tại station-agent/Mac deployment
docker compose logs -f printer-adapter | rg 'MES_PRINT_PIPELINE'
```

Đối chiếu theo thứ tự:

1. `event_id` và payload tại `stage=outbox_payload`.
2. Cùng `event_id` tại `stage=adapter_received`.
3. Template/version tại `stage=template_selected`.
4. Danh sách template binding và runtime keys tại `stage=template_bindings`.
5. `mapped=true/false` cho barcode/QR tại `stage=label_mapping`.
6. Printer/CUPS queue và kích thước ZPL tại `stage=printer_queue`.

## 10. Kiến nghị chuẩn hóa tiếp theo

Để loại bỏ dữ liệu giả và đảm bảo tem phản ánh đúng WO, nên bổ sung một canonical `label_variables` vào command, tối thiểu gồm:

```text
production_order
work_order_id
operation_code
operation_name
product_code
product_name
revision
serial_number
quantity
batch_number
lot_number
manufacture_date
expiry_date
trace_id
```

Nếu QR cần payload có cấu trúc, MES nên gửi explicit `qr_payload` đã xác định schema thay vì để adapter tự ghép chuỗi từ default variables. Việc chọn `template_id` và `template_version` cũng nên được xác định rõ trong master data/print station nếu nhiều loại tem cùng chạy trên một printer.

## 11. Kết luận

Payload trace và log mapping đã được bổ sung ở MES producer và adapter consumer. Từ thời điểm deploy bản này, có thể xác định chính xác field nào MES gửi, field nào adapter tự sinh, template nào được chọn và barcode/QR binding nào không map được.

`MES_PRINT_PIPELINE_TRACE_COMPLETE`
