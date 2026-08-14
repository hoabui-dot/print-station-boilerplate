# Kế hoạch cải thiện UX tạo/sửa Mẫu nhãn tại Trạm in

## 1. Mục tiêu

Thay đổi trải nghiệm tạo và sửa Label Template theo hướng người dùng nghiệp vụ không cần biết JSON, ZPL hoặc cấu trúc `elements`. Người dùng chỉ cần:

1. Chọn loại nội dung chính: **Barcode** hoặc **QR Code**.
2. Chọn thông tin sẽ được encode/hiển thị từ field catalog của MES.
3. Kéo thả, căn chỉnh và thay đổi kích thước trong khung tem.
4. Xem preview gần với output ZPL thực tế.
5. Validate trước khi publish/in test.

JSON vẫn có thể tiếp tục là format lưu trữ nội bộ và contract renderer, nhưng không còn là công cụ chỉnh sửa chính trên UI.

## 2. Căn cứ codebase hiện tại

### Frontend kiosk

- `services/kiosk-ui/frontend/src/components/LabelTemplatesTab.tsx` hiện tạo/sửa `templateJson` bằng chuỗi JSON và đang có preview riêng.
- `LabelPreview.tsx` đọc `templateJson`, hỗ trợ text, barcode, QR và `payloadTemplate`.
- `jsbarcode` và `qrcode.react` hiện chỉ phù hợp cho preview browser, không phải renderer cuối cùng cho Zebra.
- `@tanstack/react-table` đã có trong project, nhưng chưa có canvas editor chuyên dụng.

### Printer adapter

- `LabelTemplate.TemplateJson` vẫn là field bắt buộc trong domain/database.
- `ZplRenderer` nhận JSON template và runtime dictionary rồi sinh ZPL.
- `ZplLabelCompiler` đã có hướng compiler canonical, tọa độ theo mm và lỗi rõ cho barcode/QR value rỗng.
- API hiện có `POST /api/label-templates/render`, `POST /api/label-templates/{id}/render-with-data` và `POST /api/label-templates/{id}/print-test`.
- API create/update hiện vẫn yêu cầu `templateJson`; đây là điểm cần giữ tương thích trong phase đầu.

### Payload MES

Theo [MES_PRINT_PIPELINE_FIELD_MAPPING.vi.md](./MES_PRINT_PIPELINE_FIELD_MAPPING.vi.md), field có nguồn ổn định cho template hiện tại gồm:

- `production_order`;
- `product_code`;
- `serial_number` từ `label_items[].product_serial`;
- `trace_id` từ `label_items[].job_id`;
- `quantity` và `requested_quantity` nếu được expose đúng vào runtime map.

Các field như `revision`, `customer`, `material`, `lot_number`, `batch_number`, `manufacture_date` và `expiry_date` hiện còn là default do adapter tự sinh. Không được đưa các field này vào nhóm “dữ liệu sản xuất đảm bảo” cho đến khi backend canonical hóa nguồn.

## 3. Quyết định UX

### 3.1. Barcode mode

Barcode mode là flow đơn giản, không phải một canvas designer đầy đủ.

UI gồm:

- chọn symbology, mặc định `CODE128`;
- chọn một field encode từ allowlist, mặc định `serial_number`;
- preview barcode;
- hiển thị code dạng text ngay dưới barcode;
- điều chỉnh width, height, vị trí trái/phải, trên/dưới;
- xem sample value và test scan;
- không cho user tự nhập binding key.

Best practice: barcode phải đi kèm human-readable code bên dưới để người vận hành vẫn đối chiếu được khi scan thất bại.

### 3.2. QR Code mode

QR mode là flow designer có canvas.

UI gồm:

- danh sách field được phép đưa vào QR payload;
- field text hiển thị ngoài QR nếu cần;
- canvas tem theo kích thước mm;
- kéo thả QR, text và các field;
- resize width/height;
- căn trái/phải/trung tâm và trên/giữa/dưới;
- panel thuộc tính cho phần tử đang chọn;
- thứ tự lớp, xoá, nhân bản và undo/redo;
- preview payload thực tế trước khi render;
- QR error correction level và quiet zone được kiểm soát bởi hệ thống, không cho cấu hình vượt ngưỡng an toàn.

### 3.3. Có cho một template chứa cả Barcode và QR không?

Trong phase UX đầu tiên, mỗi template chọn một `contentMode` chính:

```text
BARCODE | QR
```

Text field và logo/icon có thể là thành phần phụ của cả hai mode. Không cho tạo đồng thời barcode và QR trong cùng template ở phase đầu để giảm nhầm lẫn và tránh tăng diện tích/độ phức tạp kiểm thử. Nếu nghiệp vụ cần cả hai, mở một phase riêng với validation kích thước và scanability.

## 4. Library đề xuất

### Quyết định: `react-konva` + `konva`

Chọn `react-konva` làm canvas editor, dùng `konva.Transformer` cho resize và pointer interaction. Konva có object model, event handling, hit detection và Transformer cho resize theo canvas; đây là năng lực phù hợp với designer 2D hơn việc tự quản lý DOM absolute-position. Tài liệu chính thức: [Konva React drag and drop](https://konvajs.org/docs/react/Drag_and_Drop.html), [Konva Transformer](https://konvajs.org/docs/select_and_transform/Basic_demo.html).

### Không dùng `dnd-kit` làm canvas engine

`dnd-kit` phù hợp cho kéo thả giữa các vùng UI, nhưng không phải renderer/transform engine cho các phần tử có tọa độ mm, resize và hit-testing trên tem. Có thể dùng dnd-kit sau này cho palette nếu cần, nhưng không đưa nó vào lõi canvas. Tài liệu chính thức: [dnd-kit React quickstart](https://dndkit.com/react/quickstart/).

### Vì sao không dùng preview SVG hiện tại làm output chính

`jsbarcode`, `qrcode.react` và SVG/canvas browser chỉ là preview. Máy Zebra nhận ZPL; output cuối cùng phải tiếp tục đi qua `ZplRenderer` hoặc `ZplLabelCompiler`. Canvas chỉ là công cụ tương tác, không được serialize pixel canvas thành ảnh để in barcode/QR.

## 5. Kiến trúc đề xuất

```text
Field Catalog API
        |
        v
Template Editor State (typed domain model)
        |
        +--> Canvas Preview (react-konva, mm -> px)
        |
        +--> Client validation
        |
        v
Canonical Template DTO
        |
        +--> Backend validation + compiler validation
        |
        +--> Serialize to legacy-compatible templateJson
        |
        v
ZplRenderer / ZplLabelCompiler
        |
        +--> Labelary preview
        +--> printer-adapter print-test
        +--> Zebra/CUPS
```

## 6. Model dữ liệu UI typed, không chỉnh JSON trực tiếp

Đề xuất model frontend:

```ts
type TemplateContentMode = 'BARCODE' | 'QR'

type TemplateFieldKey =
  | 'production_order'
  | 'product_code'
  | 'serial_number'
  | 'trace_id'
  | 'quantity'
  | 'requested_quantity'

type LabelElement = {
  id: string
  type: 'barcode' | 'qr' | 'text' | 'icon'
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
  horizontalAlign: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  binding?: TemplateFieldKey
  selectedFields?: TemplateFieldKey[]
  text?: string
  visibleCode?: boolean
}

type LabelTemplateDraft = {
  name: string
  templateCode?: string
  contentMode: TemplateContentMode
  dpi: 203 | 300 | 600
  widthMm: number
  heightMm: number
  elements: LabelElement[]
}
```

`xMm`, `yMm`, `widthMm`, `heightMm` là source of truth. Pixel/canvas coordinates chỉ là giá trị render tạm thời.

## 7. Field Catalog

Không hardcode field option rải rác trong UI. Tạo một catalog có metadata:

```ts
type PrintableField = {
  key: string
  label: LocalizedText
  source: 'MES' | 'ADAPTER_DERIVED'
  authoritative: boolean
  allowedFor: Array<'BARCODE' | 'QR' | 'TEXT'>
  sampleValue: string
  requiredForProduction: boolean
}
```

### Nhóm được bật mặc định

| Field | Barcode | QR | Trạng thái |
|---|---:|---:|---|
| `serial_number` | Có | Có | MES label item, authoritative |
| `product_code` | Có | Có | MES, authoritative |
| `production_order` | Có | Có | MES, authoritative |
| `trace_id` | Có | Có | MES label job, authoritative |
| `quantity` | Không khuyến nghị | Có | Cần expose canonical runtime |
| `requested_quantity` | Không khuyến nghị | Có | Cần expose canonical runtime |

### Nhóm không bật mặc định

`revision`, `customer`, `material`, `lot_number`, `batch_number`, `manufacture_date`, `expiry_date`, `station`, `operator` chỉ được enable sau khi backend đánh dấu `authoritative=true`. UI phải hiển thị cảnh báo nếu field là adapter-derived.

## 8. API/backend plan

### Phase backend tối thiểu

1. Thêm DTO canonical `LabelTemplateDefinition` hoặc equivalent trong printer adapter application.
2. Thêm `contentMode` và schema version, ví dụ `schemaVersion: 2`.
3. Thêm endpoint `GET /api/label-templates/field-catalog` trả field key, translation, source, authoritative flag và sample value.
4. Thêm endpoint `POST /api/label-templates/validate-definition`.
5. Cho POST/PUT nhận `definition` typed; backend serialize definition thành `template_json` tương thích renderer.
6. Giữ `templateJson` legacy trong response và read path để không làm hỏng template cũ.
7. Khi update, snapshot version cũ như logic hiện tại.

### Không tạo Data Warehouse hoặc truy cập database MES từ kiosk

Field catalog chỉ là contract API. Printer adapter không truy vấn PostgreSQL MES để lấy dữ liệu in. Runtime values vẫn đến từ print command như flow hiện tại.

## 9. Canonical JSON sinh ra từ editor

Editor không cho sửa JSON, nhưng backend có thể lưu JSON tương thích dạng:

```json
{
  "schemaVersion": 2,
  "contentMode": "QR",
  "width": 60,
  "height": 40,
  "dpi": 203,
  "elements": [
    {
      "id": "qr-1",
      "type": "qr",
      "x": 35,
      "y": 5,
      "width": 20,
      "height": 20,
      "fields": ["serial_number", "product_code", "production_order"]
    },
    {
      "id": "text-1",
      "type": "text",
      "x": 5,
      "y": 28,
      "width": 50,
      "height": 5,
      "binding": "serial_number",
      "align": "center"
    }
  ]
}
```

Renderer adapter chịu trách nhiệm biến `fields` thành payload QR deterministic. Không để frontend tự build QR payload bằng format không được version hóa.

## 10. Validation bắt buộc

### General

- label width/height > 0 và không vượt giới hạn API hiện tại;
- mọi element nằm trong vùng tem;
- không có phần tử kích thước 0;
- tọa độ và kích thước làm tròn theo độ chính xác mm được hỗ trợ;
- không overlap vùng quiet zone của barcode/QR;
- không publish khi còn lỗi mapping.

### Barcode

- phải có một `binding`;
- sample value không rỗng;
- CODE128 chỉ nhận dữ liệu hợp lệ theo renderer;
- hiển thị human-readable code bắt buộc;
- chiều cao và quiet zone đạt ngưỡng tối thiểu;
- render thử phải tạo được ZPL.

### QR

- phải có ít nhất một selected field;
- payload sample sau khi resolve không rỗng;
- không có placeholder không map được;
- quiet zone tối thiểu được giữ cố định;
- kích thước module sau quy đổi DPI phải đủ để scanner đọc;
- error correction mặc định M, chỉ cho đổi khi có test scan;
- render thử phải tạo được ZPL và QR payload preview.

## 11. Accuracy và kiểm soát lệch khi in

Không thể cam kết “độ chính xác UI trên 95%” chỉ bằng việc chọn một thư viện. Độ lệch còn phụ thuộc DPI, media, calibration, driver CUPS, darkness, print speed và offset của từng Zebra.

Mục tiêu kỹ thuật nên đo được:

1. Canvas dùng cùng `widthMm`, `heightMm`, `dpi` với compiler.
2. Chỉ dùng một hàm quy đổi `dots = round(mm * dpi / 25.4)`.
3. Preview browser chỉ để bố trí; preview xác thực phải render ZPL bằng adapter.
4. Gọi API Labelary hoặc endpoint preview nội bộ để xem bitmap từ ZPL.
5. In test trên từng model/printer thật với fixture cố định.
6. Dùng thước đo các điểm chuẩn trên tem: cạnh, QR/barcode bounding box, baseline text.
7. Lưu printer calibration offset theo printer code, không sửa template để bù lỗi riêng của máy.
8. Dùng golden fixture để so sánh template definition, ZPL và ảnh preview.

Acceptance target đề xuất:

- sai lệch tọa độ phần tử <= 0.5 mm trong preview render;
- sai lệch physical print <= 1 mm sau calibration;
- barcode/QR scan pass 100% trên bộ fixture chuẩn trước publish;
- không có field bị fallback silent.

## 12. UI layout đề xuất

### Header

- tên mẫu nhãn;
- mã mẫu auto-generated/view-only;
- mode Barcode/QR dạng segmented control;
- trạng thái draft/published;
- Preview ZPL, Lưu nháp, Publish, Print test.

### Left panel: Field library

- search field theo tên/code;
- field hiển thị name translation dòng 1, key/source dòng 2;
- badge `MES` hoặc `Adapter-derived`;
- kéo field vào canvas hoặc click “Thêm vào tem”.

### Center: Canvas

- grid theo mm;
- zoom 50/75/100/150%;
- ruler ngang/dọc;
- snap theo 1 mm hoặc 0.5 mm;
- preview sample data;
- vùng quiet zone được hiển thị khi chọn barcode/QR;
- không cho canvas thay đổi kích thước ngoài form label.

### Right panel: Properties

- x/y/width/height theo mm;
- align controls;
- binding/selected fields;
- font size, weight, max lines cho text;
- barcode symbology hoặc QR error correction;
- nút reset vị trí và duplicate.

## 13. Backward compatibility

1. Template cũ không có `schemaVersion` hoặc có version `1` vẫn render như hiện tại.
2. UI đọc JSON cũ và chuyển sang editor model nếu nhận diện được `elements`.
3. Nếu có element không hỗ trợ, hiển thị read-only warning, không tự xoá.
4. Save từ editor mới ghi schema version mới và giữ snapshot cũ.
5. Không cho sửa JSON raw trong flow thường; chỉ admin/debug route mới có thể xem raw JSON read-only.

## 14. Kế hoạch triển khai theo phase

### Phase 0: Contract audit

- khóa danh sách field authoritative;
- xác nhận `quantity`, `requested_quantity`, `operation_code` có được expose runtime hay chưa;
- thống nhất Barcode/QR content mode;
- viết test fixture cho payload MES hiện tại.

### Phase 1: Typed editor foundation

- thêm `react-konva` và `konva`;
- tạo `LabelTemplateEditorState`, field catalog adapter và mm coordinate utilities;
- tạo canvas static render từ template JSON cũ;
- chưa thay API.

### Phase 2: Barcode flow

- form chọn field;
- barcode + human-readable code;
- validation và render preview ZPL;
- migrate create/edit barcode template.

### Phase 3: QR flow

- palette field;
- drag/drop và Transformer;
- selected field list;
- QR payload preview;
- undo/redo, snapping, align.

### Phase 4: Backend canonical definition

- field catalog API;
- validate-definition API;
- typed definition DTO;
- serializer tương thích `template_json`;
- snapshot/version regression.

### Phase 5: Print verification

- Labelary/adapter bitmap preview;
- print-test fixture;
- test trên printer thật;
- calibration profiles;
- scan verification.

### Phase 6: Migration and rollout

- đọc template cũ;
- đánh dấu template không chuyển đổi được;
- không tự publish template đã migrate;
- rollout feature flag theo station;
- theo dõi logs `MES_PRINT_PIPELINE` và render errors.

## 15. Test plan

### Unit

- mm-to-dot conversion;
- bounds/snap/align;
- serializer typed definition -> JSON;
- QR payload field resolution;
- barcode value resolution;
- reject missing required binding;
- preserve legacy template JSON.

### Component

- đổi Barcode/QR mode;
- pick field;
- drag, resize, align;
- keyboard focus và thao tác không dùng chuột;
- validation hiển thị đúng;
- không mất draft khi đổi sample data.

### API/renderer

- definition validation;
- ZPL output deterministic;
- `BARCODE_VALUE_REQUIRED` và `QR_VALUE_REQUIRED`;
- template version snapshot;
- print-test không làm thay đổi template.

### Browser E2E

1. Tạo barcode template với `serial_number`.
2. Preview barcode và code text.
3. Lưu draft, refresh, edit lại không mất layout.
4. Tạo QR template với `serial_number`, `product_code`, `production_order`.
5. Kéo field, resize QR, căn giữa, lưu và mở lại.
6. Tạo template với field không authoritative, UI phải cảnh báo.
7. Xóa binding bắt buộc, không cho save/publish.
8. Render ZPL bằng backend và kiểm tra bitmap preview.
9. Print test trên simulator.
10. Print test trên printer thật theo fixture khi có thiết bị.

## 16. Acceptance criteria

- User không cần mở/chỉnh JSON để tạo hoặc sửa template.
- Barcode mode chỉ yêu cầu chọn field, hiển thị barcode và code đọc được.
- QR mode hỗ trợ chọn field, kéo thả, resize và align theo mm.
- Template cũ vẫn render được.
- Backend vẫn là nơi validate cuối và render ZPL.
- Không có field default giả được dùng silent cho production template.
- Preview xác thực dùng ZPL output, không chỉ dùng SVG/canvas.
- E2E kiểm tra create/edit/reopen/render/print-test.
- Barcode/QR fixture scan pass trước khi publish.
- Mỗi binding được trace qua `MES_PRINT_PIPELINE`.

## 17. Rủi ro và quyết định cần chốt

| Vấn đề | Quyết định đề xuất |
|---|---|
| Có hỗ trợ barcode + QR trong cùng template? | Chưa hỗ trợ ở phase đầu; dùng một mode chính |
| Field default adapter-derived có cho chọn? | Không bật mặc định; chỉ cho chọn khi backend xác nhận authoritative |
| Có lưu canvas image không? | Không; lưu typed definition/JSON, renderer sinh ZPL |
| Có dùng Labelary làm production dependency? | Chỉ preview/UAT; printer adapter là renderer chính |
| Có cho user đổi DPI tự do? | Chỉ option 203/300/600, validate theo printer capability |
| Có cần template id/version trong print command? | Nên bổ sung sau khi canonical field contract ổn định |
| Có tự migrate mọi JSON cũ? | Không; template không nhận diện được phải read-only warning |

## 18. Kết luận

Chiến lược phù hợp với codebase là giữ JSON/ZPL ở backend nhưng thay hoàn toàn raw JSON editor bằng typed visual editor. `react-konva` phù hợp cho canvas kéo thả/resizing; tuy nhiên độ chính xác in phải được đảm bảo bằng model tọa độ mm, cùng công thức DPI, render ZPL backend, calibration và test scan thật.

Không nên bắt đầu bằng việc thêm nhiều tính năng UI. Thứ tự đúng là khóa field contract authoritative, xây typed definition, làm Barcode mode đơn giản trước, sau đó mới triển khai QR canvas và physical print verification.

`LABEL_TEMPLATE_UX_IMPROVEMENT_PLAN_COMPLETE`
