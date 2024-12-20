const admin = require('firebase-admin');
const { processDailyRoundups } = require('../functions/roundupProcessor');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const serviceAccount = require('../server/firebase-service-account.json');
require('dotenv').config();

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

async function createTestScenario() {
    try {
        const userId = 'test-user-123';
        const sourceAccountId = 'WVEZaR89lms5qln67n4Wtb5vmwKLo1CwZ3MEa';
        
        // Get all plaidItems and find the one with our source account
        const allPlaidItems = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('plaidItems')
            .get();

        let sourceItem = null;
        allPlaidItems.forEach(doc => {
            const data = doc.data();
            if (data.accountDetails && 
                data.accountDetails.some(account => account.id === sourceAccountId)) {
                sourceItem = data;
            }
        });

        if (!sourceItem) {
            console.error('Source account not found in Firestore');
            return;
        }

        console.log('Found source account:', sourceItem);

        // No need to create new transaction since we already have pending ones

        // Process round-ups
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        const endDate = new Date();
        
        // Get pending transactions
        const snapshot = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('transactions')
            .where('round_up_status', '==', 'pending')
            .get();

        // Verify we have transactions
        if (snapshot.empty) {
            throw new Error('No pending transactions found');
        }

        console.log(`Found ${snapshot.size} pending transactions`);

        const result = await processDailyRoundups(
            userId,
            snapshot.docs,
            startDate,
            endDate,
            stripe
        );

        console.log('Processing result:', result);

    } catch (error) {
        console.error('Test failed:', error);
    }
}

createTestScenario(); 