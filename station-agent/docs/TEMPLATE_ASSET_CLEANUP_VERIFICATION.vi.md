# Xác minh xoá asset khi xoá mẫu nhãn

## Phạm vi

Đảm bảo xoá một mẫu nhãn không để lại ảnh/icon không còn được sử dụng trong:

- bảng `label_assets` của SQLite;
- thư mục lưu trữ `sqlite-databases/label-assets`;
- API lấy nội dung asset.

Asset chỉ được xoá vật lý khi không còn được mẫu nhãn active khác tham chiếu.

## Thay đổi đã triển khai

Endpoint `DELETE /api/label-templates/{id}` hiện:

1. Đọc các `assetId`, `labelAssetId`, `imageAssetId`, `iconAssetId` và asset URL trong `template_json`.
2. Kiểm tra các mẫu nhãn active khác trước khi xoá.
3. Xoá file trong storage và bản ghi asset không còn tham chiếu.
4. Deactivate mẫu nhãn.
5. Trả về `assetCleanup` để có thể audit số lượng asset đã xoá hoặc được giữ lại.

Endpoint `DELETE /api/label-assets/{id}` cũng xoá file storage trước khi xoá bản ghi asset.

## Kết quả kiểm chứng API

Đã tạo một asset và một mẫu nhãn tạm thời bằng API, sau đó xoá mẫu nhãn:

- mẫu nhãn tạm: `ed9ecacd-3b04-44e0-af9d-b17f29f5c484`;
- asset tạm: `947a698a-0705-4ad9-9889-7d5e564b6fba`;
- phản hồi cleanup: `referencedCandidates=1`, `removed=1`;
- `GET /api/label-assets/{assetId}/content`: `404`;
- bản ghi mẫu nhãn: inactive;
- bản ghi asset: không còn;
- file vật lý: không còn.

## Dọn dữ liệu thử nghiệm hiện tại

Script thực thi: `scripts/verify-template-asset-cleanup.py`.

Script có guard từ chối xoá nếu asset còn được mẫu nhãn active tham chiếu. Kết quả:

- trước dọn: 1 bản ghi `verify-delete-icon.svg` và 2 file fixture có cùng hash;
- sau dọn: 0 bản ghi `verify-delete-icon.svg`;
- sau dọn: 0 file fixture còn lại;
- asset chính thức trong database không bị xoá.

## Cách chạy lại

```bash
cd print-marking/station-agent
python3 scripts/verify-template-asset-cleanup.py
```

Script này chỉ dành cho fixture kiểm chứng có tên `verify-delete-icon.svg` và hai filename fixture đã khai báo; không dùng để dọn asset production tùy ý.
