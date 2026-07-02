# IAM Integration Platform — POC

A full-stack Proof of Concept for a HKUST Identity and Access Management (IAM) Integration Platform.

The platform ingests identity events from four upstream source systems — **CADS**, **PeopleSoft (SIS/FMS/HRMS)**, **ECM**, and **JSPM** — normalises them into a canonical format, persists them in MongoDB, and exposes a non-technical web UI for testing and monitoring.

---

## Architecture

```
┌───────────────────┐   events   ┌──────────────────────────────────┐
│  CADS             │ ─────────► │                                  │
│  PeopleSoft       │            │   Express + Mongoose Backend     │
│  (SIS/FMS/HRMS)   │ ─────────► │   (port 4000)                    │
│  ECM              │            │                                  │
│  JSPM             │ ─────────► │  • Ingest / normalise / validate │
└───────────────────┘            │  • Email domain allowlist        │
                                 │  • Idempotency handling          │
                                 │  • Audit logging                 │
                                 │  • Sync status materialisation   │
                                 └────────────┬─────────────────────┘
                                              │ Mongoose
                                              ▼
                                 ┌────────────────────────┐
                                 │   MongoDB (port 27017) │
                                 │                        │
                                 │  Collections:          │
                                 │  · source_systems      │
                                 │  · ingestion_jobs      │
                                 │  · inbound_events      │
                                 │  · identity_links      │
                                 │  · midpoint_transact.  │
                                 │  · dead_letters        │
                                 │  · audit_logs          │
                                 │  · sync_status_by_email│
                                 └────────────────────────┘

                                 ┌────────────────────────┐
                                 │  Next.js Frontend      │
                                 │  (port 3000)           │
                                 │                        │
                                 │  Pages:                │
                                 │  · Dashboard           │
                                 │  · Events Search       │
                                 │  · Test Ingest         │
                                 │  · Sync Status         │
                                 │  · Access Check        │
                                 └────────────────────────┘
```

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- Or: Node.js 20+, MongoDB 7.0 (for local development without Docker)

---

## Quick Start (Docker — Recommended)

```bash
# 1. Clone the repo
git clone https://github.com/isharryfung/iam-integration-poc.git
cd iam-integration-poc

# 2. (Optional) Copy environment example
cp .env.example .env

# 3. Start everything
docker compose up --build

# 4. Open the UI in your browser
open http://localhost:3000
```

The first build takes ~3–5 minutes. Subsequent starts are fast.

**Services:**
| Service | URL |
|---------|-----|
| Frontend (UI) | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| MongoDB | mongodb://localhost:27017/iam_poc |

---

## Local Development (without Docker)

### Backend

```bash
cd backend
cp .env.example .env       # edit MONGO_URI to point to your local MongoDB
npm install
node db/setup.js            # create collections, validators, indexes, seed data
npm run dev                 # start with hot reload (nodemon)
```

### Frontend

```bash
cd frontend
cp .env.example .env.local  # edit NEXT_PUBLIC_API_URL if needed
npm install
npm run dev
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb://mongo:27017/iam_poc` | MongoDB connection string |
| `PORT` | `4000` | Backend server port |
| `API_KEYS` | `poc-dev-key-1234,poc-dev-key-5678` | Comma-separated valid API keys |
| `ALLOWED_EMAIL_DOMAINS` | `ust.hk` | Allowed email domains (expand for connect/family) |
| `NODE_ENV` | `development` | Node environment |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Backend URL (browser-accessible) |
| `NEXT_PUBLIC_API_KEY` | `poc-dev-key-1234` | API key used by frontend |

---

## API Endpoints

All endpoints require the `api_key` header.  
Default POC key: `poc-dev-key-1234`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `POST` | `/api/v1/inbound/events` | Unified event ingestion |
| `POST` | `/api/v1/inbound/events:batch` | Batch ingestion |
| `GET` | `/api/v1/inbound/events/{eventId}/status` | Event status |
| `POST` | `/api/v1/inbound/cads` | CADS alias |
| `POST` | `/api/v1/inbound/peoplesoft` | PeopleSoft alias |
| `POST` | `/api/v1/inbound/ecm` | ECM alias |
| `POST` | `/api/v1/inbound/jspm` | JSPM alias |
| `GET` | `/api/v1/users/{email}/sync-status` | User sync status |
| `GET` | `/api/v1/users/{email}/events` | User event history |
| `POST` | `/api/v1/users/{email}/replay` | Replay failed event |
| `GET` | `/user/access?email={email}` | Access decision |

Full OpenAPI spec: [`docs/openapi.yaml`](docs/openapi.yaml)

---

## Test Flow (Quick Smoke Test)

```bash
# 1. Check backend is up
curl http://localhost:4000/health

# 2. Ingest a CADS event
curl -X POST http://localhost:4000/api/v1/inbound/cads \
  -H "api_key: poc-dev-key-1234" \
  -H "Content-Type: application/json" \
  -d '{"employeeEmail":"john.doe@ust.hk","employeeId":"E12345","role":"APPROVER","action":"provision"}'

# 3. Check sync status
curl -H "api_key: poc-dev-key-1234" \
  http://localhost:4000/api/v1/users/john.doe@ust.hk/sync-status

# 4. Check access
curl -H "api_key: poc-dev-key-1234" -H "service_id: ECM" \
  "http://localhost:4000/user/access?email=john.doe@ust.hk"
```

For a full test script with step-by-step scenarios, see: [`docs/uat-script.md`](docs/uat-script.md)

---

## Project Structure

```
iam-integration-poc/
├── README.md
├── .env.example
├── docker-compose.yml
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── .env.example
│   ├── db/
│   │   ├── setup.js              # DB setup: validators + indexes + seed
│   │   └── validators/           # MongoDB JSON schema validators
│   │       ├── source_systems.json
│   │       ├── ingestion_jobs.json
│   │       ├── inbound_events.json
│   │       ├── identity_links.json
│   │       ├── midpoint_transactions.json
│   │       ├── dead_letters.json
│   │       ├── audit_logs.json
│   │       └── sync_status_by_email.json
│   └── src/
│       ├── index.js              # App entry point
│       ├── middleware/
│       │   ├── apiKey.js         # API key validation
│       │   └── correlation.js    # Correlation ID handling
│       ├── models/               # Mongoose schemas
│       │   ├── SourceSystem.js
│       │   ├── IngestionJob.js
│       │   ├── InboundEvent.js
│       │   ├── IdentityLink.js
│       │   ├── MidpointTransaction.js
│       │   ├── DeadLetter.js
│       │   ├── AuditLog.js
│       │   └── SyncStatusByEmail.js
│       ├── routes/
│       │   ├── inbound.js        # /api/v1/inbound/* endpoints
│       │   ├── users.js          # /api/v1/users/* endpoints
│       │   └── access.js         # /user/access endpoint
│       └── utils/
│           ├── emailValidation.js
│           ├── ingestHelper.js   # Normalisation + ingestion logic
│           ├── syncStatus.js     # Sync status materialisation
│           └── audit.js          # Audit log writer
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.js
│   ├── .env.example
│   └── src/
│       ├── lib/
│       │   └── api.js            # Shared API client
│       ├── pages/
│       │   ├── _app.js           # Layout + navigation
│       │   ├── index.js          # Dashboard
│       │   ├── events.js         # Events Search
│       │   ├── ingest.js         # Test Ingest
│       │   ├── sync-status.js    # Sync Status Viewer
│       │   └── access.js         # Access Check
│       └── styles/
│           └── globals.css
│
└── docs/
    ├── openapi.yaml              # Full OpenAPI 3.0 specification
    └── uat-script.md             # Step-by-step UAT test script
```

---

## Email Domain Policy

Currently only `@ust.hk` email addresses are accepted.

To expand to additional domains (e.g. `connect.ust.hk`, `family.ust.hk`), update the `ALLOWED_EMAIL_DOMAINS` environment variable:

```env
ALLOWED_EMAIL_DOMAINS=ust.hk,connect.ust.hk,family.ust.hk
```

No code changes are required.

---

## MongoDB Collections

| Collection | Purpose |
|-----------|---------|
| `source_systems` | Registered upstream systems |
| `ingestion_jobs` | Per-call ingestion tracking (single or batch) |
| `inbound_events` | Immutable event history from all source systems |
| `identity_links` | Cross-system identity correlation by email |
| `midpoint_transactions` | Outbound calls to MidPoint (simulated in POC) |
| `dead_letters` | Events that exhausted all retry attempts |
| `audit_logs` | Append-only compliance audit trail |
| `sync_status_by_email` | Materialised view for fast UI queries |

---

## Security Notes (POC)

- API keys are stored in environment variables — do not commit real keys to source control
- Audit logs have a 2-year TTL configured
- Email domain validation prevents ingestion from unknown domains
- In production: add TLS, rotate API keys, enable mTLS for source systems, and restrict CORS origins

---

## Documentation

- **OpenAPI spec:** [`docs/openapi.yaml`](docs/openapi.yaml)
- **UAT test script:** [`docs/uat-script.md`](docs/uat-script.md)
