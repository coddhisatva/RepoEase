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

        // Check for pending transactions
        const pendingSnapshot = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('transactions')
            .where('round_up_status', '==', 'pending')
            .get();

        // If no pending transactions, create some test ones
        if (pendingSnapshot.empty) {
            console.log('Creating test transactions...');
            const batch = admin.firestore().batch();
            const transactionsRef = admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('transactions');

            // Create 4 test transactions
            const testTransactions = [
                { amount: 10.50, name: 'Coffee' },
                { amount: 25.75, name: 'Lunch' },
                { amount: 5.20, name: 'Snack' },
                { amount: 15.80, name: 'Taxi' }
            ];

            for (const tx of testTransactions) {
                const docRef = transactionsRef.doc();
                batch.set(docRef, {
                    plaid_transaction_id: `test_${Date.now()}_${Math.random()}`,
                    account_id: sourceAccountId,
                    amount: tx.amount,
                    date: new Date().toISOString().split('T')[0],
                    name: tx.name,
                    round_up_amount: Number((Math.ceil(tx.amount) - tx.amount).toFixed(2)),
                    round_up_status: 'pending',
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            await batch.commit();
            console.log('Created test transactions');
        }

        // Process round-ups
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        const endDate = new Date();
        
        // Get pending transactions (should exist now)
        const snapshot = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('transactions')
            .where('round_up_status', '==', 'pending')
            .get();

        if (snapshot.empty) {
            throw new Error('No pending transactions found even after creation');
        }

        console.log(`Found ${snapshot.docs.length} pending transactions`);

        // Process the transactions
        const result = await processDailyRoundups(userId, snapshot.docs, startDate, endDate, stripe, admin);
        console.log('Processing result:', result);

    } catch (error) {
        console.error('Test failed:', error);
    }
}

createTestScenario(); 