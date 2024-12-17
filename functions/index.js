const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const functions = require('firebase-functions');
admin.initializeApp();

exports.processEndOfDay = onSchedule({
    schedule: '59 23 * * *',
    timeZone: 'America/Los_Angeles'
}, async (event) => {
    const stripe = require('stripe')(functions.config().stripe.secret_key);
    
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 1);

    try {
        await processDailyRoundups(startDate, endDate, stripe);
        console.log('Successfully processed end-of-day round-ups');
        return null;
    } catch (error) {
        console.error('Error in scheduled round-up processing:', error);
        return null;
    }
});
