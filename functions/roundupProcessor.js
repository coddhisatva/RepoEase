const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

async function processDailyRoundups(startDate, endDate, stripe) {
    console.log('Processing round-ups between:', startDate, 'and', endDate);
    
    try {
        // 1. Find all pending round-ups
        const pendingTransactions = await admin.firestore()
            .collectionGroup('transactions')
            .where('round_up_status', '==', 'pending')
            .where('created_at', '>=', startDate)
            .where('created_at', '<=', endDate)
            .get();

        if (pendingTransactions.empty) {
            return { 
                success: true, 
                message: 'No pending round-ups found',
                processed: 0
            };
        }

        // 2. Calculate total round-up amount
        let totalRoundUp = 0;
        const authsToCancel = [];
        
        pendingTransactions.forEach(doc => {
            const transaction = doc.data();
            totalRoundUp += transaction.round_up_amount;
            if (transaction.stripe_auth_id) {
                authsToCancel.push(transaction.stripe_auth_id);
            }
        });

        totalRoundUp = Number(totalRoundUp.toFixed(2));
        console.log(`Total round-up amount: $${totalRoundUp}`);
        console.log(`Found ${authsToCancel.length} auths to cancel`);

        // 3. Cancel individual auth holds
        for (const authId of authsToCancel) {
            try {
                const intent = await stripe.paymentIntents.retrieve(authId);
                if (intent.status !== 'canceled') {
                    await stripe.paymentIntents.cancel(authId);
                    console.log(`Cancelled auth: ${authId}`);
                } else {
                    console.log(`Auth ${authId} already cancelled`);
                }
            } catch (error) {
                console.error(`Error cancelling auth ${authId}:`, error);
            }
        }

        // 4. Update transaction statuses
        const batch = admin.firestore().batch();
        console.log('admin exists:', !!admin);
        console.log('admin.firestore exists:', !!admin.firestore);
        console.log('admin.firestore.FieldValue exists:', !!admin.firestore.FieldValue);
        console.log('Full admin.firestore object:', admin.firestore);

        pendingTransactions.forEach(doc => {
            batch.update(doc.ref, { 
                round_up_status: 'processed',
                processed_at: FieldValue.serverTimestamp()
            });
        });
        
        await batch.commit();

        return {
            success: true,
            message: 'Processed daily round-ups',
            total: totalRoundUp,
            count: pendingTransactions.size,
            authsCancelled: authsToCancel.length
        };

    } catch (error) {
        console.error('Error processing daily round-ups:', error);
        throw error;
    }
}

module.exports = { processDailyRoundups };
