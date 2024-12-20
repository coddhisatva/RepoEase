const admin = require('firebase-admin');
const serviceAccount = require('../server/firebase-service-account.json');
require('dotenv').config();

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

async function diagnoseSetup() {
    try {
        const userId = 'test-user-123';

        console.log('\n🔍 Examining Firestore State:\n');

        // 1. Check PlaidItems
        console.log('📂 PlaidItems:');
        const plaidItems = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('plaidItems')
            .get();

        plaidItems.forEach(doc => {
            console.log('\nDocument ID:', doc.id);
            const data = doc.data();
            console.log('Access Token:', data.access_token);
            console.log('Accounts:', JSON.stringify(data.accountDetails, null, 2));
        });

        // 2. Check Subscription
        console.log('\n💳 Subscription:');
        const subscription = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('subscription')
            .doc('current')
            .get();

        console.log(JSON.stringify(subscription.data(), null, 2));

        // 3. Check Pending Transactions
        console.log('\n🧾 Pending Transactions:');
        const transactions = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('transactions')
            .where('round_up_status', '==', 'pending')
            .get();

        transactions.forEach(doc => {
            console.log('\nTransaction ID:', doc.id);
            console.log(JSON.stringify(doc.data(), null, 2));
        });

    } catch (error) {
        console.error('Diagnosis failed:', error);
    }
}

diagnoseSetup(); 