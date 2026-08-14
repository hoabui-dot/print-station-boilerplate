# AI Document — ND Station Agent

Canonical working context for AI agents modifying this repository. Updated 2026-08-14.

## Read order and source of truth

1. Read this file.
2. Read [PRODUCT_DOCUMENT.md](./PRODUCT_DOCUMENT.md) for business intent.
3. Read [SYSTEM_DOCUMENT.md](./SYSTEM_DOCUMENT.md) for runtime architecture.
4. Verify the relevant implementation in `services/`, `shared/`, Docker Compose and tests.

When sources disagree, use this precedence: running source code, project/Compose configuration,
database migrations and tests, then documentation. A requirement or old implementation note is not
evidence that behavior exists.

## Repository boundaries

The deployable application is `station-agent/`. The repository root contains the standalone wrapper,
SQL/template fixtures and historical design notes. Do not reintroduce the original MES repository as
a dependency.

The active service set is:

| Service | Responsibility | Main port |
|---|---|---:|
| `station-gateway` (`services/mqtt-adapter`) | Factory Gateway HTTP ingress, validation and local persistence | 5001 |
| `job-engine` | Job lifecycle, scheduling, retries, overwrite/rework and outbox | 5002 |
| `printer-adapter` | Label templates, rendering and physical printer I/O | 5003 |
| `laser-adapter` | Laser device registry and marking execution | 5004 |
| `vision-service` | Camera/verification results | 5005 |
| `plc-adapter` | PLC device and robot/conveyor integration | 5006 |
| `kiosk-ui` | Local JWT/RBAC API, operator UI gateway and SignalR dashboard | 5007 |
| `device-simulator` | Deterministic development and E2E hardware simulator | 5008 externally / 8080 in the container |
| `projection-service` | Read model, alarms, device/job monitoring and realtime projections | 5009 |

## Engineering rules

- Keep Domain free from EF Core, Redis, brokers, HTTP and filesystem dependencies.
- Keep cross-service data references as identifiers; do not add physical foreign keys across service databases.
- Put use-case logic in Application/handlers. API `Program.cs` should compose endpoints and dependencies.
- Treat a physical print/mark as non-idempotent: reserve command IDs before I/O and preserve history.
- Use local SQLite for durable edge state. Use Redis for distributed locks, heartbeat/cache and idempotency where the owning service already does so.
- Publish durable integration messages through the existing outbox/consumer patterns. Do not invent topic, exchange or event names casually.
- Do not silently change a state machine, payload, permission, database table or device protocol. Update the canonical docs and tests together.
- Never use simulator endpoints or seeded credentials as production security or hardware guarantees.

## Implementation conventions

- Runtime target is `net10.0`; package versions are centrally managed in `Directory.Packages.props` and currently use ASP.NET/EF 9 packages in several places.
- Nullable reference types, implicit usings and warnings-as-errors are enabled.
- Each service follows `Api`, `Application`, `Domain`, `Infrastructure` projects where applicable.
- Shared code belongs in `shared/ND.SharedKernel`, `shared/ND.Contracts`, `shared/ND.UnifiedContracts` or `shared/ND.Infrastructure` only when it is truly cross-service.
- Configuration is environment-driven. Never commit secrets; `.env.example` contains development placeholders only.

## Safe change workflow

1. Search for the existing contract/entity/handler before adding one (`rg` is preferred).
2. Trace the request/event from API or consumer to Application, persistence and publisher.
3. Make the smallest compatible change; preserve casing and existing JSON names.
4. Build the solution and run affected tests.
5. Validate Compose configuration if deployment files changed.
6. Record implementation status and any unverified hardware behavior in the relevant canonical document.

## Known verification limits

The repository contains simulator and unit/integration tests, but a green build does not prove physical
printer, laser, camera or PLC behavior. Hardware connectivity, CUPS queues, broker reachability and
production credentials must be verified at the target station.

## Useful commands

```bash
cd station-agent
dotnet restore station-agent.sln
dotnet build station-agent.sln
dotnet test station-agent.sln
docker compose config -q
```

For a focused change, build or test the affected project first, then run the full solution checks before
committing.
