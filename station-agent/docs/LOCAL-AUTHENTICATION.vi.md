# Authentication local của Print Station Boilerplate

Boilerplate này chạy độc lập và không phụ thuộc Keycloak, Portal hay MOM SSO.

## Luồng đăng nhập

1. Kiosk UI gọi `POST /api/auth/login` với username/password.
2. Backend kiểm tra user và BCrypt hash trong SQLite `kiosk.db`.
3. Backend phát hành JWT HMAC với `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`.
4. Kiosk UI lưu token và gửi `Authorization: Bearer ...` cho API.
5. RBAC lấy role/permission từ SQLite; token hết hạn theo `JWT_EXPIRY_MINUTES`.

## Cấu hình

```env
JWT_SECRET=change_me_to_a_long_random_secret_at_least_32_chars
JWT_ISSUER=nd-station-agent
JWT_AUDIENCE=nd-kiosk
JWT_EXPIRY_MINUTES=480
LOCAL_ADMIN_PASSWORD=admin123
```

User mặc định: `admin123` / `admin123`. Đổi mật khẩu bằng `LOCAL_ADMIN_PASSWORD` trước khi deploy production.

Printer Adapter là service nội bộ của station và không dùng SSO. Production deployment nên giới hạn network access tới adapter bằng firewall hoặc private network.
