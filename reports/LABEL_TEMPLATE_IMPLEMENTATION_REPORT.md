# Label Template & Icon Printing Implementation Report

## Scope

This increment separates the existing barcode/QR label-template workspace from a
new Icon / Image tab in Kiosk UI. Existing label-template data remains in the
Barcode / QR tab and keeps the current 1UP, 2UP, and 3UP layout filters.

## Implemented

- Added authenticated Kiosk proxy endpoints for label assets.
- Added Printer Adapter asset list, content, multipart upload, and deactivate APIs.
- Added SHA-256 de-duplication for uploaded assets.
- Added PNG signature validation and SVG safety checks.
- Allowed the standard SVG namespace while rejecting scripts, event handlers,
  embedded HTML, XML entities, and remote resource references.
- Added the `Icon / Hình ảnh` tab with search, upload, preview, and deactivate UI.
- Added deterministic seed assets: company logo, QC pass/fail, warning, rework,
  fragile, recycle, keep dry, and orientation arrow.
- Changed local Compose default routing from the remote printer IP to the local
  `printer-adapter:5003` service. The value remains overrideable with
  `PRINTER_ADAPTER_URL`.

## Verification

| Check | Result |
|---|---|
| Kiosk frontend typecheck/build | Passed |
| Printer Adapter Docker build | Passed |
| Kiosk UI Docker build | Passed |
| Full service health after restart | Passed |
| Safe SVG upload | HTTP 201 |
| Duplicate SHA-256 upload | HTTP 200, duplicate=true |
| Unsafe SVG upload | HTTP 400 |
| Asset content proxy | HTTP 200, image/svg+xml |
| Asset deactivation | HTTP 204 |
| Deterministic seed assets | 9 assets returned after restart |

## Remaining phase work

The repository still has broader phased requirements outside this increment:

- Full typed lifecycle and maker-checker approval model.
- Asset variants, DPI rasterization, Z64/hex encoding, and printer asset cache.
- Authoritative canonical compiler wiring for all production paths.
- Server preview/preflight evidence and exact-version production print events.
- Full Job Engine, Projection, SignalR, hardware, security, and Playwright E2E
  coverage required by Phases 2, 3, 5, 7, and 8.

These were not silently represented as complete by this tab implementation.
