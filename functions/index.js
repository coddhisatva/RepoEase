const admin = require('firebase-admin');
admin.initializeApp();

const { processDailyRoundups } = require('./roundupProcessor');
const { onSchedule } = require("firebase-functions/v2/scheduler");

exports.processEndOfDay = onSchedule({
    schedule: '59 23 * * *',
    timeZone: 'America/Los_Angeles',
    retryCount: 3,
    timeoutSeconds: 540,
    minInstances: 0
}, async (event) => {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 1);

    try {
        // Get all pending transactions
        const pendingTransactions = await admin.firestore()
            .collectionGroup('transactions')
            .where('round_up_status', '==', 'pending')
            .where('created_at', '>=', startDate)
            .where('created_at', '<=', endDate)
            .get();

        const result = await processDailyRoundups('test-user-123', pendingTransactions.docs, startDate, endDate, stripe, admin);
        console.log('End-of-day processing complete:', result);
        return null;
    } catch (error) {
        console.error('Error in end-of-day processing:', error);
        throw error;
    }
});
