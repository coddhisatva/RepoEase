const admin = require('firebase-admin');
const serviceAccount = require('../server/firebase-service-account.json');
require('dotenv').config();

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

async function createTestLoanAccount() {
    try {
        const userId = 'test-user-123';
        
        // For testing, we'll use a regular checking account as if it were a loan account
        await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('plaidItems')
            .add({
                access_token: process.env.EASE_PLAID_ACCESS_TOKEN || 'test_token',
                accountDetails: [{
                    id: process.env.EASE_PLAID_ACCOUNT_ID || 'test_account',
                    name: 'Test Student Loan',
                    type: 'loan',
                    subtype: 'student',
                    mask: '0000',
                    purpose: 'destination'
                }]
            });

        console.log('Test loan account created and stored!');
        console.log('Using account ID:', process.env.EASE_PLAID_ACCOUNT_ID);

    } catch (error) {
        console.error('Error creating test loan account:', error);
    }
}

createTestLoanAccount(); 