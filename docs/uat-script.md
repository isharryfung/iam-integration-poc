# UAT Test Script — IAM Integration POC
**For non-technical testers** | Version 1.0 | HKUST IAM Team

---

## Before You Start

### Prerequisites
1. The system is running (ask your technical contact to run `docker compose up --build`)
2. Open your browser and go to: **http://localhost:3000**
3. You should see the IAM Integration Platform dashboard
4. Keep this document open while you test

### Test Accounts (Sample Emails)
Use these sample `@ust.hk` email addresses during testing:

| Person | Email | Role |
|--------|-------|------|
| John Doe (Staff) | john.doe@ust.hk | Finance Officer |
| Jane Smith (Staff) | jane.smith@ust.hk | IT Analyst |
| Alice Chan (Staff) | alice.chan@ust.hk | Document Manager |
| Bob Lee (Staff) | bob.lee@ust.hk | Project Manager |
| Sam Wong (Student) | sam.wong@ust.hk | Student |

### API Key (for direct API testing only)
```
api_key: poc-dev-key-1234
```

---

## Scenario 1 — CADS HR System Ingestion

**Goal:** Confirm that a CADS staff record can be sent to the platform and is stored correctly.

### Steps

1. In the browser, click **"📤 Test Ingest"** in the top navigation bar.

2. Click the **CADS** button (it should turn blue/highlighted).

3. The form will pre-fill with a sample CADS payload. Review it:
   ```json
   {
     "employeeId": "E12345",
     "employeeEmail": "john.doe@ust.hk",
     "employeeName": "John Doe",
     "department": "Finance Management Office",
     "orgUnit": "FMO",
     "jobTitle": "Finance Officer",
     "role": "APPROVER",
     "validFrom": "2025-01-01",
     "validUntil": "2099-12-31",
     "action": "provision",
     "permissions": {
       "enquireReqPoReceipt": true,
       "certifyReceiptForPayment": true,
       "approveBudgetCommitmentEproReq": true,
       "approveBudgetCommitmentExpense": true
     },
     "limits": {
       "certifyReceiptForPaymentMaxAmountHkd": 50000,
       "approveEproReqMaxAmountHkd": 100000,
       "approveExpenseMaxAmountHkd": 50000
     }
   }
   ```
   > **Tip:** You can click **"↺ Load CADS Sample"** at any time to reset the editor to this sample.

4. Click **"Submit to CADS"**.

5. ✅ **Expected result:** A green confirmation box appears with:
   - `Event Accepted!`
   - An Event ID (e.g. `abc12345-...`)
   - Status: `validated` or `received`

6. Copy the **Event ID** shown — you will need it in Scenario 3.

### Verify in Events Search

7. Click **"🔍 Events Search"** in the nav bar.
8. Enter `john.doe@ust.hk` in the email box.
9. Click **"Search"**.
10. ✅ **Expected result:** At least 1 event appears, showing:
    - Source: **CADS**
    - Status: **✅ Success** (may take a few seconds to update)
    - Action: provision

**Pass / Fail:** ☐ Pass &nbsp;&nbsp; ☐ Fail  
**Tester notes:** _______________________________________________

---

## Scenario 2 — PeopleSoft SIS/HRMS Ingestion

**Goal:** Send a PeopleSoft HRMS (staff) and a PeopleSoft SIS (student) event.

### 2A — PeopleSoft HRMS (Staff)

1. Go to **Test Ingest**, click **PEOPLESOFT**.

2. Update the payload to use `"module": "HRMS"`:
   ```json
   {
     "module": "HRMS",
     "emplid": "P98765",
     "email": "jane.smith@ust.hk",
     "name": "Jane Smith",
     "jobCode": "IT_ANALYST",
     "department": "Information Technology",
     "action": "update"
   }
   ```

3. Click **"Submit to PEOPLESOFT"**.
4. ✅ Expected: Green confirmation with Event ID.

### 2B — PeopleSoft SIS (Student)

1. Still on Test Ingest / PEOPLESOFT.
2. Change the payload to a student record:
   ```json
   {
     "module": "SIS",
     "emplid": "S20240001",
     "email": "sam.wong@ust.hk",
     "name": "Sam Wong",
     "studentId": "S20240001",
     "action": "provision"
   }
   ```
3. Click **"Submit to PEOPLESOFT"**.
4. ✅ Expected: Green confirmation with Event ID.

### Verify Sync Status

5. Go to **"🔄 Sync Status"**.
6. Enter `jane.smith@ust.hk` and click **Check Status**.
7. ✅ Expected:
   - Last Source System: **PEOPLESOFT**
   - Processing Status: ✅ **Success**
   - Source Contributions → PEOPLESOFT shows a recent timestamp

**Pass / Fail:** ☐ Pass &nbsp;&nbsp; ☐ Fail  
**Tester notes:** _______________________________________________

---

## Scenario 3 — ECM Document Management Ingestion

**Goal:** Provision a user in ECM and verify their access status.

### Steps

1. Go to **Test Ingest**, click **ECM**.

2. Review the pre-filled payload:
   ```json
   {
     "userId": "ECM-001",
     "userEmail": "alice.chan@ust.hk",
     "userName": "Alice Chan",
     "documentClass": "FINANCE_CONTRACTS",
     "role": "READER",
     "accessLevel": "L2",
     "action": "provision"
   }
   ```

3. Click **"Submit to ECM"**.
4. ✅ Expected: Green confirmation.

### Verify Access

5. Go to **"🔑 Access Check"**.
6. Enter `alice.chan@ust.hk` and select service **ECM**.
7. Click **"Check Access"**.
8. ✅ Expected result:
   - Decision: **✅ ALLOW**
   - Status: ACTIVE
   - Source Systems includes **ECM**

**Pass / Fail:** ☐ Pass &nbsp;&nbsp; ☐ Fail  
**Tester notes:** _______________________________________________

---

## Scenario 4 — JSPM Project Assignment Ingestion

**Goal:** Assign a user to a project in JSPM.

### Steps

1. Go to **Test Ingest**, click **JSPM**.

2. Review the pre-filled payload:
   ```json
   {
     "projectCode": "PROJ-2026-001",
     "userEmail": "bob.lee@ust.hk",
     "userName": "Bob Lee",
     "projectRole": "PROJECT_MANAGER",
     "action": "assign"
   }
   ```

3. Click **"Submit to JSPM"**.
4. ✅ Expected: Green confirmation.

5. Go to **Events Search**, search `bob.lee@ust.hk`.
6. ✅ Expected: 1 event, Source: **JSPM**, Status: ✅ Success.

**Pass / Fail:** ☐ Pass &nbsp;&nbsp; ☐ Fail  
**Tester notes:** _______________________________________________

---

## Scenario 5 — Event Status Check

**Goal:** Verify that you can look up the status of a specific event by its ID.

### Steps

1. Take the **Event ID** you copied in Scenario 1 (e.g. `abc12345-1234-...`).

2. Open a new browser tab and go to:
   ```
   http://localhost:4000/api/v1/inbound/events/{YOUR_EVENT_ID}/status
   ```
   (replace `{YOUR_EVENT_ID}` with your actual Event ID)

   Add the API key header. If using a REST tool like Postman or curl:
   ```bash
   curl -H "api_key: poc-dev-key-1234" \
     http://localhost:4000/api/v1/inbound/events/{YOUR_EVENT_ID}/status
   ```

3. ✅ Expected response:
   ```json
   {
     "eventId": "...",
     "sourceSystem": "CADS",
     "status": "success",
     "identity": { "email": "john.doe@ust.hk", ... },
     "receivedAt": "...",
     "processedAt": "..."
   }
   ```

**Pass / Fail:** ☐ Pass &nbsp;&nbsp; ☐ Fail  
**Tester notes:** _______________________________________________

---

## Scenario 6 — Domain Validation (Negative Test)

**Goal:** Confirm the system rejects emails outside the allowed domain.

### Steps

1. Go to **Test Ingest**, click **CADS**.

2. Change the `employeeEmail` in the payload to an external email:
   ```json
   {
     "employeeEmail": "external.user@gmail.com",
     "employeeId": "E99999",
     "action": "provision"
   }
   ```

3. Click **"Submit to CADS"**.

4. ✅ **Expected:** Red error message saying the email domain is not allowed
   (something like: "Email domain 'gmail.com' is not in the allowed list. Allowed: ust.hk")

5. Also try with `john.doe@connect.ust.hk` — this should also be **rejected** for now
   (connect.ust.hk is not yet enabled; only `ust.hk` is allowed at this stage).

**Pass / Fail:** ☐ Pass &nbsp;&nbsp; ☐ Fail  
**Tester notes:** _______________________________________________

---

## Scenario 7 — Idempotency Check

**Goal:** Confirm that submitting the same event twice does not create duplicates.

### Steps

1. Go to **Test Ingest**, click **CADS**.

2. In the payload, add an idempotency key note (we will set it via header in the API call).
   If you use the UI, the system auto-generates keys. Instead, use this curl command:

   ```bash
   curl -X POST http://localhost:4000/api/v1/inbound/cads \
     -H "api_key: poc-dev-key-1234" \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: test-dedup-12345" \
     -d '{"employeeEmail":"john.doe@ust.hk","employeeId":"E12345","action":"provision"}'
   ```

3. Run the same command a **second time** with the **identical** `Idempotency-Key`.

4. ✅ Expected on second call:
   - HTTP status: **200** (not 202)
   - Message: `"Duplicate event — already processed"`
   - The same `eventId` is returned

**Pass / Fail:** ☐ Pass &nbsp;&nbsp; ☐ Fail  
**Tester notes:** _______________________________________________

---

## Scenario 8 — Sync Status and Replay

**Goal:** View a user's sync history and replay a failed event (if any).

### Steps

1. Go to **"🔄 Sync Status"**.

2. Enter the email of a user who has had multiple events (e.g. `john.doe@ust.hk`).

3. ✅ Verify the following fields are populated:
   - Last Source System
   - Last Event Time
   - Processing Status
   - Total Events Received
   - Source Contributions (CADS section should show recent activity)

4. If there is a yellow warning panel at the bottom saying "has failed events":
   - Click **"🔄 Replay Last Failed Event"**
   - ✅ Expected: Green confirmation with a new Replay Event ID

5. Go to **Events Search** for the same email and verify a new event appears with the same source system.

**Pass / Fail:** ☐ Pass &nbsp;&nbsp; ☐ Fail  
**Tester notes:** _______________________________________________

---

## Scenario 9 — Access Decision (Allow & Deny)

**Goal:** Verify the access check works for both allowed and unknown users.

### 9A — Known User (should ALLOW)

1. Go to **"🔑 Access Check"**.
2. Enter `john.doe@ust.hk`, select service **ECM**.
3. Click **"Check Access"**.
4. ✅ Expected: **✅ ALLOW** (green panel) — user was provisioned in Scenario 1.

### 9B — Unknown User (should return 404)

1. Enter `unknown.person@ust.hk`, select service **ECM**.
2. Click **"Check Access"**.
3. ✅ Expected: Red error: "User not found in IAM system".

### 9C — Invalid API Key (negative test, curl only)

```bash
curl -H "api_key: invalid-key" \
  "http://localhost:4000/user/access?email=john.doe@ust.hk" \
  -H "service_id: ECM"
```

4. ✅ Expected: HTTP 401 — `"Invalid api_key"`

**Pass / Fail:** ☐ Pass &nbsp;&nbsp; ☐ Fail  
**Tester notes:** _______________________________________________

---

## Scenario 10 — Batch Ingestion (Optional / Technical)

**Goal:** Submit multiple events in a single API call.

Run this curl command:

```bash
curl -X POST http://localhost:4000/api/v1/inbound/events:batch \
  -H "api_key: poc-dev-key-1234" \
  -H "Content-Type: application/json" \
  -H "X-Source-System: CADS" \
  -d '{
    "events": [
      {"employeeEmail": "john.doe@ust.hk",  "employeeId": "E12345", "action": "update"},
      {"employeeEmail": "jane.smith@ust.hk", "employeeId": "E67890", "action": "provision"},
      {"employeeEmail": "bad@gmail.com",     "action": "provision"}
    ]
  }'
```

✅ Expected response:
```json
{
  "summary": { "total": 3, "accepted": 2, "rejected": 1 },
  "rejected": [{ "index": 2, "reason": "Email domain 'gmail.com' is not in the allowed list..." }]
}
```

**Pass / Fail:** ☐ Pass &nbsp;&nbsp; ☐ Fail  
**Tester notes:** _______________________________________________

---

## Sign-Off Checklist

Review and tick each item when confirmed:

| # | Check | Result |
|---|-------|--------|
| 1 | CADS event ingested and visible in Events Search | ☐ Pass ☐ Fail |
| 2 | PeopleSoft HRMS event ingested | ☐ Pass ☐ Fail |
| 3 | PeopleSoft SIS (student) event ingested | ☐ Pass ☐ Fail |
| 4 | ECM event ingested | ☐ Pass ☐ Fail |
| 5 | JSPM event ingested | ☐ Pass ☐ Fail |
| 6 | Event status endpoint returns correct lifecycle | ☐ Pass ☐ Fail |
| 7 | Non-ust.hk emails are rejected | ☐ Pass ☐ Fail |
| 8 | Duplicate idempotency key returns 200 not 202 | ☐ Pass ☐ Fail |
| 9 | Sync Status shows correct data per user | ☐ Pass ☐ Fail |
| 10 | Access Check returns ALLOW for provisioned user | ☐ Pass ☐ Fail |
| 11 | Access Check returns 404 for unknown user | ☐ Pass ☐ Fail |
| 12 | Invalid API key returns 401 | ☐ Pass ☐ Fail |
| 13 | Batch ingestion handles partial failures correctly | ☐ Pass ☐ Fail |

---

**UAT Sign-Off**

| Field | Value |
|-------|-------|
| Tester Name | |
| Test Date | |
| Environment | Local Docker (localhost) |
| Overall Result | ☐ Pass ☐ Fail ☐ Pass with issues |
| Issues Found | |
| Signed By | |

---

*End of UAT Script — IAM Integration POC v1.0*
