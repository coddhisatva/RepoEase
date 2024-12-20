const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('../server/firebase-service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

async function initializeTestSubscription() {
    try {
        const userId = 'test-user-123';
        const now = new Date();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('subscription')
            .doc('current')
            .set({
                monthly_fee: 5.00,
                status: 'active',
                current_period: {
                    start_date: FieldValue.serverTimestamp(),
                    end_date: endOfMonth,
                    collected: 0.00
                }
            });

        console.log('Test user subscription initialized!');
    } catch (error) {
        console.error('Error initializing test subscription:', error);
    }
}

initializeTestSubscription(); 