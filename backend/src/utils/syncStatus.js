const SyncStatusByEmail = require('../models/SyncStatusByEmail');

/**
 * Upsert the sync_status_by_email materialized view after an event changes state.
 * @param {object} event - InboundEvent document
 */
async function refreshSyncStatus(event) {
  const email = event.identity && event.identity.email;
  if (!email) return;

  const sourceSystem = event.sourceSystem;
  const now = new Date();

  const isFailure = ['failed', 'dead_letter', 'validation_failed'].includes(event.status);
  const isSuccess = event.status === 'success';

  const sourceContribKey = `sourceContributions.${sourceSystem}`;

  await SyncStatusByEmail.findOneAndUpdate(
    { _id: email },
    {
      $set: {
        email,
        emailDomain: event.identity.emailDomain,
        displayName: event.identity.displayName,
        userType: event.identity.userType,
        lastSourceSystem: sourceSystem,
        lastEventId: event.eventId,
        lastEventTime: event.createdAt || now,
        lastProcessingStatus: event.status,
        lastError: event.lastError || null,
        ...(isSuccess ? { lastSuccessAt: now } : {}),
        ...(isFailure ? { lastFailureAt: now } : {}),
        [`${sourceContribKey}.lastEventAt`]: event.createdAt || now,
        [`${sourceContribKey}.lastStatus`]: event.status,
        ...(sourceSystem === 'PEOPLESOFT' && event.sourceData && event.sourceData.psModule
          ? { [`${sourceContribKey}.psModule`]: event.sourceData.psModule }
          : {}),
        'activeFlags.hasRecentFailure': isFailure,
        'activeFlags.hasPendingRetry': event.status === 'retrying',
        'activeFlags.isInDeadLetter': event.status === 'dead_letter',
      },
      $inc: {
        totalEventsReceived: 1,
        ...(isFailure ? { totalEventsFailed: 1 } : {}),
      },
    },
    { upsert: true, new: true }
  );
}

module.exports = { refreshSyncStatus };
