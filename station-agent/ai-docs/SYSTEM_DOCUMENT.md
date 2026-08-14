# System Document — ND Station Agent

Canonical technical architecture and deployment reference. Updated 2026-08-14.

## Runtime topology

```text
Factory Gateway
      │ HTTP
      ▼
station-gateway ── RabbitMQ ── job-engine ── RabbitMQ/Kafka ── printer-adapter ── TCP/CUPS printer
                                      │             ├──────── laser-adapter ── TCP/SDK device
                                      │             ├──────── vision-service ── camera/storage
                                      │             └──────── plc-adapter ── Modbus/PLC
                                      │
                                      └─ events ── projection-service ── SignalR/HTTP ── kiosk-ui

Redis: locks, idempotency, cache and heartbeat support
SQLite: durable local state, one database owned by each service
device-simulator: replaces physical endpoints for development/E2E
```

Docker Compose creates the `station-net`; the development compose also connects selected services to
`platform-net` for the external Kafka-backed printer integration. The production compose uses named
volumes and external device settings.

## Service ownership

- **Station Gateway** owns inbound order/request persistence and gateway outbox processing.
- **Job Engine** owns job state, attempts, steps, history, overwrite requests, scheduling and execution coordination.
- **Printer Adapter** owns printer registry, label template/version/assets, rendering, print history and physical output. It has RabbitMQ integration in the local stack and Kafka configuration for the deployed printer command/event path; verify the active image/config before changing transport.
- **Laser, Vision and PLC adapters** own their device-facing state and result persistence.
- **Projection Service** consumes events into read models for production, device status, activity and alarms; it is not the transactional owner of jobs.
- **Kiosk UI API** owns local users/RBAC and proxies/coordinates operator-facing calls; its dashboard uses `/hubs/dashboard`.
- **Device Simulator** provides virtual gateway, printer, laser, vision and PLC behavior plus test controls.

## Data and consistency

Each bounded service uses its own SQLite database/path, commonly mounted under `/data`. Cross-service
links are logical IDs such as `jobId`, `deviceId`, `stationId` and `userId`. Messaging is at-least-once;
consumers must be safe to retry. Outbox records bridge local transactions and broker publication.

Redis is not the system of record. It supports distributed locks, deduplication/idempotency and transient
device/heartbeat state. Files such as label assets and vision images are mounted storage and must be
backed up according to the station deployment policy.

## Transport rules

- RabbitMQ exchange used by the core local event path is `station.events`; consumers bind durable queues and routing patterns in their Infrastructure code.
- Kafka topic names and options are defined in `shared/ND.Infrastructure/Messaging/KafkaTopicMap.cs` and Compose `Kafka__*` settings. Do not infer Kafka behavior from old MQTT documents.
- MQTT libraries/configuration and simulator gateway behavior exist, but the current public gateway API is `POST /api/gateway/orders`; verify the owning code before introducing a new ingress path.
- Unified event and device heartbeat contracts live under `shared/ND.UnifiedContracts/Events`; shared job/MQTT DTOs live under `shared/ND.Contracts`.

## HTTP and realtime surface

Every deployed API exposes `/health`. The main public surfaces are:

| Surface | Examples |
|---|---|
| Gateway | `/api/gateway/info`, `/api/gateway/orders` |
| Job engine | `/health`; job commands are consumed through the gateway/kiosk boundaries |
| Kiosk | `/api/auth/*`, `/api/jobs/*`, `/api/overwrite-requests/*`, `/api/label-templates/*`, `/api/printers/*`, `/api/print-history/*` |
| Projection | production/device/activity/alarm read APIs and dashboard SignalR integration |
| Simulator | `/api/gateway/send-*`, `/api/vision/*`, `/api/plc/*`, `/api/jobs`, `/api/test/*` |

The Kiosk API also hosts `/hubs/dashboard`; the simulator hosts `/hubs/simulator`.

## Security and operations

Local Kiosk authentication uses JWT, BCrypt password hashing and SQLite-backed users/RBAC. Production
must replace example secrets and default credentials, restrict exposed management ports, use dedicated
RabbitMQ/Redis credentials and set explicit CORS/device endpoints.

Development:

```bash
cd station-agent
cp .env.example .env                 # edit secrets and endpoints
docker compose config -q
docker compose up -d
```

Production uses `docker-compose.production.yml` and requires `STATION_ID`, credentials, device IPs,
JWT settings and persistent volume/backup policy.

## Failure model

Expect broker/device disconnects, process restarts, duplicate deliveries and stale hardware state.
Persist before publish, retry recoverable work, use idempotency at the physical command boundary, and
surface degraded/offline states. Never report a print as successful solely because a command was queued.
