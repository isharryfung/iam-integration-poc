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
                                 │  · MidPoint Preview    │
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
| `POST` | `/api/v1/inbound/cads` | CADS alias (raw row or canonical JSON) |
| `POST` | `/api/v1/inbound/cads/transform` | CADS dry-run transform (no persistence) |
| `POST` | `/api/v1/inbound/peoplesoft` | PeopleSoft alias |
| `POST` | `/api/v1/inbound/peoplesoft/preview` | PeopleSoft mapped payload preview (no persistence) |
| `POST` | `/api/v1/inbound/ecm` | ECM alias |
| `POST` | `/api/v1/inbound/ecm/preview` | ECM combined payload preview (no persistence) |
| `POST` | `/api/v1/inbound/jspm` | JSPM alias |
| `GET` | `/api/v1/midpoint/events` | Lightweight event list for preview search |
| `GET` | `/api/v1/midpoint/preview?eventId={eventId}` | Preview MidPoint JSON by event ID |
| `GET` | `/api/v1/midpoint/preview/by-email?email={email}&latest=true` | Preview latest (or selected) event by email |
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

# 5. Preview the standardized MidPoint JSON for the latest event by email
curl -H "api_key: poc-dev-key-1234" \
  "http://localhost:4000/api/v1/midpoint/preview/by-email?email=john.doe@ust.hk&latest=true"
```

For a full test script with step-by-step scenarios, see: [`docs/uat-script.md`](docs/uat-script.md)

---

## ECM Combined Payload Mapping

ECM access data comes from two separate source files that must be merged into a single
canonical payload per user:

| Source file | Purpose | Key columns |
|---|---|---|
| `usergroupnames` | Usergroup ↔ user membership | `USERGROUPNAME`, `USERNAME` |
| `usergroup_items` | Usergroup ↔ document-type entitlement | `USERGROUPNAME`, `ITEMTYPENAME`, `Dept`, `Team`, `Function/ Role?` |

The backend `/api/v1/inbound/ecm/preview` endpoint merges both files and returns
**one combined canonical payload per unique `USERNAME`**.

### Combined payload structure

```json
{
  "meta": {
    "sourceSystem": "ECM",
    "operation": "UPSERT_USER_EFFECTIVE_ACCESS",
    "idempotencyKey": "ECM|COMBINED|ARIVY"
  },
  "identity": {
    "externalUserId": "ARIVY",
    "email": "arivy@ust.hk"
  },
  "entitlement": {
    "application": "ECM"
  },
  "attributes": {
    "memberships": [
      { "groupName": "AR_All_Docs" },
      { "groupName": "AR_RS_MGT" }
    ],
    "groupEntitlements": [
      {
        "groupName": "AR_All_Docs",
        "resourceType": "DOCUMENT_TYPE",
        "resourceName": "AR: Academic Transcript",
        "dept": "ARO",
        "team": null,
        "functionOrRole": null
      },
      {
        "groupName": "AR_RS_MGT",
        "resourceType": "DOCUMENT_TYPE",
        "resourceName": "AR: Special Student Document (Confidential)",
        "dept": "ARO",
        "team": null,
        "functionOrRole": null
      }
    ],
    "effectiveAccessSummary": {
      "totalGroups": 2,
      "totalDocTypes": 2
    }
  }
}
```

### Normalization rules

- Rows with a blank `USERGROUPNAME`, `USERNAME`, or `ITEMTYPENAME` are silently skipped.
- `USERNAME` is lowercased and a default domain (`@ust.hk`) is appended to form `email`.
- `idempotencyKey` is generated as `ECM|COMBINED|<USERNAME>`.
- `groupEntitlements` are resolved by joining each user's group memberships with the
  group-item rows that share the same `USERGROUPNAME`.

### Preview request

```bash
curl -X POST http://localhost:4000/api/v1/inbound/ecm/preview \
  -H "api_key: poc-dev-key-1234" \
  -H "Content-Type: application/json" \
  -d '{
    "membershipRows": [
      { "USERGROUPNAME": "AR_All_Docs", "USERNAME": "ARIVY" },
      { "USERGROUPNAME": "AR_RS_MGT",   "USERNAME": "ARIVY" }
    ],
    "groupItemRows": [
      { "USERGROUPNAME": "AR_All_Docs", "ITEMTYPENAME": "AR: Academic Transcript",                    "Dept": "ARO" },
      { "USERGROUPNAME": "AR_RS_MGT",   "ITEMTYPENAME": "AR: Special Student Document (Confidential)", "Dept": "ARO" }
    ]
  }'
```

On the **Test Ingest** page, selecting **ECM** loads this combined input format and shows
the live merged payload preview automatically.

---

## PeopleSoft Table-Row Mapping

The PeopleSoft ingest flow now accepts either:

- the raw export-row JSON from the PeopleSoft access table, or
- an already-canonical MidPoint-style JSON payload

### Source-row mapping

| PeopleSoft column | Canonical field |
|---|---|
| `Dept` | `entitlement.departmentOrProject` |
| `Rank/ Team` | `attributes.rankOrTeam` |
| `User` | `identity.email` or `identity.displayName` |
| `Role Name` | `entitlement.roleName` |
| `Remarks` | `attributes.remarks` |
| `Data Level Security` | `attributes.dataLevelSecurity` |

### Normalization rules

- user IDs without a domain are normalized to `@ust.hk`
- role names and headers are whitespace-normalized
- known data-level-security values are mapped to canonical scopes such as
  `ALL_STUDENTS`, `SCHOOL_DEPT_STUDENTS`, `ALL_ALUMNI`, and `CMS_ALL_CONTACTS`
- `eventId` and `idempotencyKey` are generated automatically when absent

### Example PeopleSoft ingest request

```bash
curl -X POST http://localhost:4000/api/v1/inbound/peoplesoft \
  -H "api_key: poc-dev-key-1234" \
  -H "Content-Type: application/json" \
  -d '{
    "Dept": "DAO",
    "Rank/ Team": "Alumni Team",
    "User": "dao.alumni.manager",
    "Role Name": "HKUST ALUM ADMIN DOWNLOAD DATA",
    "Remarks": "Access to AAS",
    "Data Level Security": "All alumni"
  }'
```

On the **Test Ingest** page, selecting **PEOPLESOFT** now loads the same table-row JSON sample, and the **MidPoint Preview** page shows both the original row and the transformed canonical payload.

---

## CADS Row-to-Canonical Mapping

CADS source data arrives as a spreadsheet table where each row represents one
user's entitlements.  The backend includes a dedicated transformer that converts
these raw rows into canonical MidPoint JSON before ingestion.

### How it works

1. **Dry-run / preview** — POST a raw CADS row to `POST /api/v1/inbound/cads/transform`
   to preview the canonical payload without persisting anything.
2. **Ingest** — POST the same row (or the canonical payload) directly to
   `POST /api/v1/inbound/cads`.  The endpoint auto-detects raw rows (by looking for
   column headers like `"User Email"`, `"Role"`, `"Valid From"`) and runs the
   transformer automatically before ingestion.

### Column mapping summary

| CADS column | Canonical path | Transform |
|---|---|---|
| User Email | `identity.email` | Append `@ust.hk` if no `@` |
| Role | `entitlement.roleName` | Trim |
| Department / Project | `entitlement.departmentOrProject` | Trim |
| (1) Enquire REQ/PO/Receipt | `attributes.permissions.enquireReqPoReceipt` | Y→true, else false |
| (4) Certify Receipt Max. Amount | `attributes.limits.certifyReceiptForPaymentMaxAmountHkd` | Unlimited→null, else number |
| Allow Further Delegation (proc.) | `attributes.delegation.procurement.allowFurtherDelegation` | Y→true |
| (I)–(III) Enquire BR flags | `attributes.permissions.enquireBr*` | Y→true |
| (A) Budget Commitment ALL | `attributes.permissions.approveEnquireBudgetCommitmentAllSystems` | Y→true |
| Valid From | `entitlement.validFrom` | DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD |
| Valid To | `entitlement.validTo` | DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD |

### Sample dry-run request

```bash
curl -X POST http://localhost:4000/api/v1/inbound/cads/transform \
  -H "api_key: poc-dev-key-1234" \
  -H "Content-Type: application/json" \
  -d '{
    "User Email": "user_a",
    "Role": "BCO",
    "Department / Project": "16500",
    "(1)\nEnquire REQ/PO/\nReceipt ": "Y",
    "(4)\nCertify Receipt for Payment Max. Amount (HKD)": "Unlimited",
    "Allow Further Delegation ": "Y",
    "(I)\nEnquire BR - General (FMS)": "Y",
    "Valid From": "2025-01-07",
    "Valid To": "31/12/2099"
  }'
```

### Sample dry-run response

```json
{
  "isValid": true,
  "errors": [],
  "payload": {
    "meta": {
      "eventId": "CADS-user_a_ust.hk-16500-2025-01-07",
      "eventTime": "2025-01-07T00:00:00.000Z",
      "sourceSystem": "CADS",
      "correlationId": "",
      "idempotencyKey": "CADS|user_a@ust.hk|16500|BCO|2025-01-07",
      "operation": "ASSIGN_ENTITLEMENT"
    },
    "identity": { "email": "user_a@ust.hk" },
    "entitlement": {
      "roleName": "BCO",
      "departmentOrProject": "16500",
      "application": "FMS",
      "validFrom": "2025-01-07",
      "validTo": "2099-12-31"
    },
    "attributes": {
      "permissions": { "enquireReqPoReceipt": true, "enquireBrGeneralFms": true },
      "limits": { "certifyReceiptForPaymentMaxAmountHkd": null },
      "delegation": { "procurement": { "allowFurtherDelegation": true }, "budget": {} }
    }
  }
}
```

### Ingest raw CADS row directly

```bash
curl -X POST http://localhost:4000/api/v1/inbound/cads \
  -H "api_key: poc-dev-key-1234" \
  -H "Content-Type: application/json" \
  -d '{
    "User Email": "user_a",
    "Role": "BCO",
    "Department / Project": "16500",
    "Valid From": "2025-01-07",
    "Valid To": "31/12/2099"
  }'
```

The endpoint returns **422** with `{ error, errors }` if required fields
(`User Email`, `Role`, `Department / Project`, `Valid From`, `Valid To`) are missing.

---

Use the new **MidPoint Preview** page at `http://localhost:3000/midpoint-preview` to:

- search existing inbound events by email, source system, or exact `eventId`
- preview the original source payload and transformed MidPoint input JSON side by side
- review validation results with missing/invalid field details
- copy the transformed JSON to the clipboard

### Example preview request

```bash
curl -H "api_key: poc-dev-key-1234" \
  "http://localhost:4000/api/v1/midpoint/preview?eventId=REPLACE_WITH_EVENT_ID"
```

### Example preview response

```json
{
  "eventId": "3e47bc6f-8f61-4e2d-b4f9-c2553f5a72bd",
  "sourceSystem": "ECM",
  "email": "alice.chan@ust.hk",
  "status": "success",
  "receivedAt": "2026-07-03T03:00:00.000Z",
  "processedAt": "2026-07-03T03:00:00.100Z",
  "transformStatus": "success",
  "sourcePayload": {
    "userId": "ECM-001",
    "userEmail": "alice.chan@ust.hk",
    "documentClass": "FINANCE_CONTRACTS",
    "role": "READER",
    "action": "provision"
  },
  "midpointInput": {
    "meta": {
      "eventId": "3e47bc6f-8f61-4e2d-b4f9-c2553f5a72bd",
      "eventTime": "2026-07-03T03:00:00.000Z",
      "sourceSystem": "ECM",
      "correlationId": "3ca1f6a1-71df-4f29-a7f0-e420ab56b619",
      "idempotencyKey": "ui-1720000000000",
      "operation": "ASSIGN_ENTITLEMENT"
    },
    "identity": {
      "email": "alice.chan@ust.hk",
      "displayName": null,
      "userType": "staff",
      "staffId": null,
      "studentId": null
    },
    "entitlement": {
      "application": "ECM",
      "action": "provision",
      "roleName": "READER",
      "department": null,
      "validFrom": null,
      "validUntil": null,
      "documentClass": "FINANCE_CONTRACTS",
      "projectCode": null
    }
  },
  "validation": {
    "isValid": true,
    "status": "pass",
    "missingFields": [],
    "invalidFields": [],
    "errors": []
  }
}
```

### Example event list request for the UI

```bash
curl -H "api_key: poc-dev-key-1234" \
  "http://localhost:4000/api/v1/midpoint/events?email=john.doe@ust.hk&sourceSystem=CADS&limit=10"
```

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
│       │   ├── midpoint.js       # /api/v1/midpoint/* preview endpoints
│       │   ├── users.js          # /api/v1/users/* endpoints
│       │   └── access.js         # /user/access endpoint
│       └── utils/
│           ├── emailValidation.js
│           ├── ingestHelper.js   # Normalisation + ingestion logic
│           ├── midpointPreview.js# MidPoint preview transform + validation
│           ├── syncStatus.js     # Sync status materialisation
│           └── audit.js          # Audit log writer
│       └── transformers/
│           ├── cads.transformer.js          # CADS row → canonical MidPoint JSON
│           ├── cads.transformer.fixtures.js # Runnable examples / assertions
│           └── ecm.transformer.js           # ECM membership+doctype rows → combined payload
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
│       │   ├── midpoint-preview.js # Source vs MidPoint JSON preview
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
