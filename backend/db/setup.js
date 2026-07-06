/**
 * db/setup.js
 * Applies MongoDB JSON schema validators and creates key indexes for all collections.
 * Run: node db/setup.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/iam_poc';
const VALIDATORS_DIR = path.join(__dirname, 'validators');

const COLLECTIONS = [
  {
    name: 'source_systems',
    validator: 'source_systems.json',
    indexes: [
      { key: { systemId: 1 }, unique: true },
    ],
  },
  {
    name: 'ingestion_jobs',
    validator: 'ingestion_jobs.json',
    indexes: [
      { key: { jobId: 1 }, unique: true },
      { key: { sourceSystem: 1, createdAt: -1 } },
      { key: { idempotencyKey: 1 } },
    ],
  },
  {
    name: 'inbound_events',
    validator: 'inbound_events.json',
    indexes: [
      { key: { eventId: 1 }, unique: true },
      { key: { 'identity.email': 1, createdAt: -1 } },
      { key: { sourceSystem: 1, status: 1, createdAt: -1 } },
      { key: { correlationId: 1 } },
      { key: { idempotencyKey: 1 } },
      { key: { jobId: 1 } },
    ],
  },
  {
    name: 'identity_links',
    validator: 'identity_links.json',
    indexes: [
      { key: { canonicalEmail: 1 }, unique: true },
      { key: { 'identifiers.psEmplid': 1 } },
      { key: { 'identifiers.cadsEmployeeId': 1 } },
    ],
  },
  {
    name: 'midpoint_transactions',
    validator: 'midpoint_transactions.json',
    indexes: [
      { key: { transactionId: 1 }, unique: true },
      { key: { inboundEventId: 1 } },
      { key: { email: 1, createdAt: -1 } },
      { key: { status: 1, nextRetryAt: 1 } },
    ],
  },
  {
    name: 'dead_letters',
    validator: 'dead_letters.json',
    indexes: [
      { key: { deadLetterId: 1 }, unique: true },
      { key: { inboundEventId: 1 } },
      { key: { email: 1, status: 1 } },
    ],
  },
  {
    name: 'audit_logs',
    validator: 'audit_logs.json',
    indexes: [
      { key: { auditId: 1 }, unique: true },
      { key: { correlationId: 1 } },
      { key: { 'resource.email': 1, createdAt: -1 } },
      // TTL: keep audit logs for 730 days (~2 years)
      { key: { createdAt: 1 }, expireAfterSeconds: 63072000 },
    ],
  },
  {
    name: 'sync_status_by_email',
    validator: 'sync_status_by_email.json',
    indexes: [
      { key: { email: 1 }, unique: true },
      { key: { lastProcessingStatus: 1 } },
      { key: { 'activeFlags.hasRecentFailure': 1 } },
    ],
  },
];

async function setup() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  console.log(`Connected to MongoDB: ${MONGO_URI}\n`);

  const existingCollections = await db.listCollections().toArray();
  const existingNames = new Set(existingCollections.map((c) => c.name));

  for (const col of COLLECTIONS) {
    const validator = JSON.parse(
      fs.readFileSync(path.join(VALIDATORS_DIR, col.validator), 'utf8')
    );

    if (!existingNames.has(col.name)) {
      await db.createCollection(col.name, { validator });
      console.log(`✓ Created collection: ${col.name}`);
    } else {
      await db.command({
        collMod: col.name,
        validator,
        validationLevel: 'moderate',
        validationAction: 'warn',
      });
      console.log(`✓ Updated validator: ${col.name}`);
    }

    // Apply indexes
    const collection = db.collection(col.name);
    for (const idxSpec of col.indexes) {
      const { key, ...options } = idxSpec;
      try {
        await collection.createIndex(key, options);
        console.log(`  → Index on ${JSON.stringify(key)}`);
      } catch (err) {
        console.warn(`  ⚠ Index warning on ${col.name}:`, err.message);
      }
    }
  }

  // Seed source systems if empty
  const sourceSystemsCol = db.collection('source_systems');
  const count = await sourceSystemsCol.countDocuments();
  if (count === 0) {
    await sourceSystemsCol.insertMany([
      { systemId: 'CADS',        displayName: 'CADS HR System',           active: true, schemaVersion: 'v1', createdAt: new Date(), updatedAt: new Date() },
      { systemId: 'PEOPLESOFT',  displayName: 'PeopleSoft (SIS/FMS/HRMS)', active: true, schemaVersion: 'v1', createdAt: new Date(), updatedAt: new Date() },
      { systemId: 'ECM',         displayName: 'ECM Document Management',   active: true, schemaVersion: 'v1', createdAt: new Date(), updatedAt: new Date() },
      { systemId: 'JSPM',        displayName: 'Java/JSPM Project Mgmt',    active: true, schemaVersion: 'v1', createdAt: new Date(), updatedAt: new Date() },
    ]);
    console.log('\n✓ Seeded source_systems with CADS, PEOPLESOFT, ECM, JSPM');
  }

  // Seed mock IAM users if empty
  const iamUsersCol = db.collection('iam_users');
  const iamCount = await iamUsersCol.countDocuments();
  if (iamCount === 0) {
    const now = new Date();
    await iamUsersCol.insertMany([
      {
        userId: 'U001', displayName: 'Alice Chan', email: 'alice.chan@ust.hk',
        emplid: '90001001', department: 'ISD', jobcode: 'ITMGR',
        roles: ['CADS:STAFF_PROFILE_VIEW', 'PEOPLESOFT:HR_ADMIN', 'ECM:DOC_REVIEWER'], lifecycleState: 'active',
        createdAt: now, updatedAt: now,
      },
      {
        userId: 'U002', displayName: 'Bob Lee', email: 'bob.lee@ust.hk',
        emplid: '90001002', department: 'Finance', jobcode: 'FINOFF',
        roles: ['CADS:STAFF_PROFILE_VIEW', 'PEOPLESOFT:FINANCE_ENQUIRY'], lifecycleState: 'active',
        createdAt: now, updatedAt: now,
      },
      {
        userId: 'U003', displayName: 'Carol Wong', email: 'carol.wong@ust.hk',
        emplid: '90001003', department: 'ISD', jobcode: 'SYSADM',
        roles: ['CADS:ORG_ADMIN', 'ECM:RECORDS_ADMIN', 'JSPM:PROJECT_ADMIN'], lifecycleState: 'active',
        createdAt: now, updatedAt: now,
      },
      {
        userId: 'U004', displayName: 'David Ng', email: 'david.ng@ust.hk',
        emplid: '90001004', department: 'Research', jobcode: 'RESR',
        roles: ['PEOPLESOFT:STUDENT_DATA_VIEW', 'JSPM:PROJECT_MEMBER'], lifecycleState: 'active',
        createdAt: now, updatedAt: now,
      },
      {
        userId: 'U005', displayName: 'Eva Lam', email: 'eva.lam@ust.hk',
        emplid: '90001005', department: 'HR', jobcode: 'HRMGR',
        roles: ['CADS:STAFF_PROFILE_VIEW', 'PEOPLESOFT:HR_MANAGER', 'JSPM:PROJECT_APPROVER'], lifecycleState: 'inactive',
        createdAt: now, updatedAt: now,
      },
    ]);
    await iamUsersCol.createIndex({ userId: 1 }, { unique: true });
    console.log('\n✓ Seeded iam_users with 5 mock users');
  }

  console.log('\n✅ Database setup complete.');
  await mongoose.disconnect();
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
