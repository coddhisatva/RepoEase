const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

async function processDailyRoundups(userId, pendingTransactions, startDate, endDate, stripe) {
    console.log(`Processing round-ups for user ${userId} between:`, startDate, 'and', endDate);
    
    try {
        // Check for destination account first
        const userAccounts = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('plaidItems')
            .where('accountDetails.purpose', '==', 'destination')
            .get();

        if (userAccounts.empty) {
            console.log(`User ${userId} has no student loan account linked - skipping processing`);
            return {
                success: false,
                message: 'No student loan account linked',
                userId
            };
        }

        if (pendingTransactions.empty) {
            return { 
                success: true, 
                message: 'No pending round-ups found',
                processed: 0
            };
        }

        // 1. Calculate total round-up amount for this user
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
        console.log(`Total round-up amount for user ${userId}: $${totalRoundUp}`);
        console.log(`Found ${authsToCancel.length} auths to cancel`);

        // 2. Cancel individual auth holds
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

        // 3. Get user's subscription status
        const subscriptionDoc = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('subscription')
            .doc('current')
            .get();

        const subscription = subscriptionDoc.data();
        const remainingFee = subscription.monthly_fee - subscription.current_period.collected;

        // 4. Create appropriate transfer(s)
        if (remainingFee > 0) {
            // Some or all goes to subscription
            const subscriptionAmount = Math.min(totalRoundUp, remainingFee);
            
            // Create subscription transfer
            await admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('transfers')
                .add({
                    amount: subscriptionAmount,
                    date: FieldValue.serverTimestamp(),
                    type: 'subscription_fee',
                    status: 'pending',
                    plaid_transfer_id: null  // Will be set when transfer is created
                });

            // Update subscription collected amount
            await subscriptionDoc.ref.update({
                'current_period.collected': FieldValue.increment(subscriptionAmount)
            });

            // If there's remaining amount after subscription, create loan payment
            const loanAmount = totalRoundUp - subscriptionAmount;
            if (loanAmount > 0) {
                // Get destination account ID from first linked loan account
                const destinationAccount = userAccounts.docs[0].data().accountDetails
                    .find(account => account.purpose === 'destination');

                await admin.firestore()
                    .collection('users')
                    .doc(userId)
                    .collection('transfers')
                    .add({
                        amount: loanAmount,
                        date: FieldValue.serverTimestamp(),
                        type: 'loan_payment',
                        status: 'pending',
                        plaid_transfer_id: null,
                        loan_account_id: destinationAccount.id  // Use actual account ID
                    });
            }
        } else {
            // All goes to loan payment
            await admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('transfers')
                .add({
                    amount: totalRoundUp,
                    date: FieldValue.serverTimestamp(),
                    type: 'loan_payment',
                    status: 'pending',
                    plaid_transfer_id: null,
                    loan_account_id: 'xxx'  // TODO: Get from user's settings
                });
        }

        // 5. Update transaction statuses
        const batch = admin.firestore().batch();
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
