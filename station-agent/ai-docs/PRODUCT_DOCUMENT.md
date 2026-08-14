# Product Document — ND Print Station

Canonical product and operational description. Updated 2026-08-14.

## Product purpose

ND Print Station is an edge application deployed beside factory equipment. It receives manufacturing
orders from a Factory Gateway, executes print/mark/verify work locally, exposes an operator kiosk, and
keeps traceable state when the upstream network is unavailable.

The product protects three outcomes: the correct identifier is applied to the correct item, duplicate
physical output is avoided, and every automated or manual decision can be audited.

## Users and capabilities

| User/system | Needs |
|---|---|
| Factory Gateway/MES | Submit orders, receive durable results and correlate by IDs |
| Operator | See station/device/job state, dispatch work, inspect failures and request rework |
| Supervisor/Admin | Manage users/permissions, approve or execute controlled overrides, manage printers/templates |
| Maintenance | Diagnose device health, printer queues, alarms and simulator behavior |
| Hardware | Receive print/laser/PLC commands and emit status/results |

The kiosk supports local JWT authentication and RBAC. Common business actions include job history,
manual dispatch, reprint/remark requests, alarm handling, printer activation/health, label-template
versioning/publish, preview, asset management and print tests.

## Production workflow

```text
Order ingress → validate/deduplicate → persist locally → queue job
→ execute print and/or mark → optional vision/PLC steps
→ persist result/history → publish event → update projection/kiosk
```

Supported operational shapes are print-only, mark-only, print-and-mark, verification and rework/manual
override flows. A retry or rework must preserve the original attempt and create a traceable new attempt
or job according to the owning domain rules; never overwrite a failed physical-action record.

## Product invariants

- A job is durable before asynchronous execution begins.
- Duplicate inbound messages and command re-delivery must not create duplicate physical output.
- A physical success/failure and the actor responsible for a manual action are auditable.
- Device state is eventually reflected in the projection and kiosk; a stale UI is not proof of hardware state.
- Label templates are versioned. Validate/render the stored definition used by the print path, not an unrelated UI copy.
- Offline operation means local execution and later message delivery; it does not remove the need for operator visibility or reconciliation.

## Product language

Use the constants in `shared/ND.UnifiedContracts/Constants/BusinessConstants.cs` and the domain enums as
the contract. Do not copy older values from historical requirement files. Current job lifecycle values
include `CREATED`, `QUEUED`, `PREPARING`, `PROCESSING`, `PRINTING`, `VERIFYING`, `COMPLETED`, `FAILED`,
`WAITING`, `WAIT_REWORK` and `CANCELLED` where supported by the owning domain.

## Scope boundaries

This repository is a standalone Print Station boilerplate, not the central MES. It owns edge execution,
local operator control, device integration and projections. It does not own enterprise order planning,
master-data governance or cloud identity.

## Evidence and delivery status

Source code demonstrates APIs, persistence, messaging components, simulator paths and UI integration.
Physical hardware behavior remains environment-dependent. Mark claims as implemented only after a
repeatable build/test/runtime check; document hardware-only checks separately.

Detailed legacy contracts under `station-agent/docs/product/` are supporting references and must be
checked against source before use. Empty or historical product files are not authoritative.
