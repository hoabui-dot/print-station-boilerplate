# Print Station Boilerplate

Standalone clone of the MES Print Station under `station-agent/`.

This repository keeps the Print Station capabilities without MOM SSO. Kiosk authentication is local JWT backed by SQLite users/RBAC. The default development account is `admin123` / `admin123`; set `LOCAL_ADMIN_PASSWORD` and `JWT_SECRET` for deployment.

## Build

```bash
cd station-agent
docker compose config -q
docker compose build kiosk-ui printer-adapter
docker compose up -d
```

The original `mes-system/print-marking` directory is not a runtime dependency of this clone.
