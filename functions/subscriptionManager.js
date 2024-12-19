const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const DEFAULT_SUBSCRIPTION_FEE = 5.00;

async function initializeUserSubscription(userId) {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('subscription')
        .doc('current')
        .set({
            monthly_fee: DEFAULT_SUBSCRIPTION_FEE,
            status: 'active',
            current_period: {
                start_date: FieldValue.serverTimestamp(),
                end_date: endOfMonth,
                collected: 0.00
            }
        });
} 