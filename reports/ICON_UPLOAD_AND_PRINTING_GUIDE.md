# Hướng dẫn tải và in biểu tượng trong trạm in

## Tóm tắt thao tác

1. Đăng nhập Kiosk trạm in.
2. Mở **Mẫu tem** và chọn tab **Icon / Hình ảnh**.
3. Chọn **Tải biểu tượng**, chọn file PNG hoặc SVG an toàn, dung lượng tối đa 2 MB.
4. Kiểm tra ảnh xem trước trong cột **Xem**. Nếu trùng nội dung, hệ thống dùng lại asset hiện có.
5. Hiện tại có thể quản lý và preview biểu tượng trong thư viện. Việc chọn asset trong trình thiết kế mẫu tem cần chờ phần renderer image được nối hoàn chỉnh.
6. Sau khi renderer hỗ trợ asset, lưu/phát hành mẫu tem, gán mẫu tem cho máy in và chạy in thử.

Khi bấm vào ảnh trong cột **Xem**, modal preview cho phép kiểm tra bitmap và render ZPL với:

- kích thước tem và icon theo mm;
- DPI 203/300/600;
- căn trái/giữa/phải;
- căn trên/giữa/dưới.

Nút **Render theo ZPL** tạo bitmap 1-bit và gọi endpoint preview hiện tại để hiển thị ảnh PNG theo kích thước/dpi của tem.

## Vì sao trước đây cột Xem không hiển thị ảnh

API danh sách asset chỉ trả metadata, không trả `previewUrl`. Endpoint nội dung ảnh yêu cầu Bearer token, trong khi thẻ HTML `<img>` không tự gửi token từ `localStorage`. Frontend hiện tải nội dung bằng Axios có interceptor xác thực, tạo `Object URL` từ Blob rồi đưa URL đó vào thẻ ảnh.

## Định dạng và kiểm tra an toàn

- PNG: phù hợp ảnh raster, logo hoặc icon có nền trong suốt.
- SVG: phù hợp icon/vector cần giữ độ nét khi thay đổi kích thước.
- Backend kiểm tra MIME type, giới hạn 2 MB và tính SHA-256.
- SVG có script, JavaScript, event handler HTML, iframe hoặc liên kết/tài nguyên ngoài bị từ chối.
- Asset trùng SHA-256 không tạo bản ghi mới.

## Cách biểu tượng sẽ được in từ PNG

PNG không được gửi trực tiếp đến máy in. Luồng xử lý là:

1. Kiosk tải PNG qua endpoint có xác thực.
2. Renderer đọc asset và chuyển ảnh raster thành bitmap đơn sắc theo DPI của máy in.
3. Bitmap được mã hóa thành lệnh ZPL `^GFA` và chèn vào vị trí/kích thước của trường hình ảnh.
4. Printer Adapter gửi lệnh ZPL hoàn chỉnh đến máy in đã được gán mẫu tem.

Đây là phương pháp raster-to-printer-command, không phải gửi URL ảnh cho máy in. Máy in cần nhận dữ liệu bitmap đã mã hóa theo khả năng của printer; không cần truy cập ngược vào Kiosk hoặc Internet.

## Thư viện và thành phần đang dùng

- Frontend: React + TypeScript.
- HTTP và tải Blob có xác thực: Axios.
- Preview: Web API `URL.createObjectURL`, không dùng thư viện chart hoặc thư viện ảnh ngoài.
- Backend: ASP.NET Core Minimal API, Kiosk UI proxy sang Printer Adapter.
- Lưu metadata và nội dung asset: database của Printer Adapter.
- Render/in: ZPL renderer và Printer Adapter; barcode/QR vẫn dùng pipeline hiện hữu.

## Kiểm tra sau khi tải

- Cột **Xem** phải hiển thị ảnh trên nền trắng.
- Định dạng phải hiển thị PNG hoặc SVG.
- Asset phải có SHA-256 và ngày tải.
- File SVG không an toàn phải bị từ chối với lỗi validation.
- Sau khi phát hành/gán mẫu tem, chạy **In thử** để xác nhận ảnh xuất hiện trên nhãn thực tế.

## Trạng thái triển khai và giới hạn hiện tại

Đã hoàn thành: upload PNG/SVG, kiểm tra an toàn, chống trùng SHA-256, lưu asset, endpoint content có xác thực, preview trong bảng, raster preview 1-bit và render ZPL preview theo vị trí/kích thước đã chọn.

Chưa hoàn thành: `ZplLabelCompiler` hiện trả cảnh báo `ASSET_RENDER_PENDING` cho phần tử `image/icon`, còn `ZplRenderer` chưa tự lấy asset theo `assetId` để chuyển thành `^GFA` trong template đã lưu. Vì vậy modal preview đã mô phỏng đúng bitmap/ZPL, nhưng upload/preview chưa tự động làm icon xuất hiện trong mẫu tem production. Cần nối cấu hình icon vào template JSON và production renderer, sau đó thêm test render/in thử trước khi bật flow production.

Kéo-thả, chỉnh sửa ảnh, crop, chuyển đổi màu và trình thiết kế trực quan chưa thuộc flow hiện tại.
