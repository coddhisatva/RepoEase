const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { plaidClient, EASE_SANDBOX_ACCOUNT } = require('../server/plaidConfig');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    const serviceAccount = require('../server/firebase-service-account.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

async function createPlaidTransfer(sourceToken, sourceAccountId, isSubscriptionPayment, amount) {
    try {
        // 1. Create transfer authorization
        const authResponse = await plaidClient.transferAuthorizationCreate({
            access_token: sourceToken,
            account_id: sourceAccountId,
            type: 'debit',  // Taking money from source account
            network: 'ach',
            amount: amount.toString(),
            ach_class: 'ppd',
            user: {
                legal_name: 'Ease.Cash User'  // We might want to get actual user name
            }
        });

        if (authResponse.data.authorization.decision !== 'approved') {
            throw new Error(`Transfer authorization not approved: ${authResponse.data.authorization.decision}`);
        }

        // 2. Create the transfer
        const transferResponse = await plaidClient.transferCreate({
            access_token: sourceToken,
            account_id: sourceAccountId,
            authorization_id: authResponse.data.authorization.id,
            type: 'debit',
            network: 'ach',
            amount: amount.toString(),
            description: isSubscriptionPayment ? 'Ease.Cash Subscription' : 'Ease.Cash Loan Payment',
            ach_class: 'ppd',
            destination: {
                account_id: isSubscriptionPayment ? EASE_SANDBOX_ACCOUNT.account_id : destinationAccountId,
                access_token: isSubscriptionPayment ? EASE_SANDBOX_ACCOUNT.access_token : sourceToken
            }
        });

        return transferResponse.data.transfer.id;
    } catch (error) {
        console.error('Error creating Plaid transfer:', error);
        throw error;
    }
}

async function processDailyRoundups(userId, transactions, startDate, endDate, stripe) {
    try {
        // Group transactions by account
        const accountTransactions = {};
        
        transactions.forEach(doc => {
            const transaction = doc.data();
            const accountId = transaction.account_id;
            
            if (!accountTransactions[accountId]) {
                accountTransactions[accountId] = {
                    totalRoundUp: 0,
                    transactions: [],
                    authsToCancel: []
                };
            }

            accountTransactions[accountId].totalRoundUp += transaction.round_up_amount;
            accountTransactions[accountId].transactions.push(doc.ref);
            if (transaction.stripe_auth_id) {
                accountTransactions[accountId].authsToCancel.push(transaction.stripe_auth_id);
            }
        });

        // Process each account's transactions
        for (const [sourceAccountId, accountData] of Object.entries(accountTransactions)) {
            console.log(`Processing account ${sourceAccountId} with total roundup: ${accountData.totalRoundUp}`);
            
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
                console.error(`No plaidItem found for account ${sourceAccountId}`);
                continue;
            }

            const accessToken = sourceItem.access_token;

            // Cancel Stripe auths for this account (skip if test_auth)
            for (const authId of accountData.authsToCancel) {
                try {
                    if (!authId.startsWith('test_')) {
                        await stripe.paymentIntents.cancel(authId);
                    }
                } catch (error) {
                    console.warn(`Warning: Could not cancel auth ${authId}:`, error.message);
                }
            }

            // Get subscription status
            const subscriptionDoc = await admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('subscription')
                .doc('current')
                .get();

            const subscription = subscriptionDoc.data();
            const remainingFee = subscription.monthly_fee - subscription.current_period.collected;

            // Determine how much of this account's round-ups go to subscription vs loan
            if (remainingFee > 0) {
                // Some or all goes to subscription
                const subscriptionAmount = Math.min(accountData.totalRoundUp, remainingFee);
                console.log(`Sending ${subscriptionAmount} to subscription`);
                
                // Update subscription collected amount
                await subscriptionDoc.ref.update({
                    'current_period.collected': FieldValue.increment(subscriptionAmount)
                });

                // If there's remaining amount after subscription, send to loan
                const loanAmount = accountData.totalRoundUp - subscriptionAmount;
                if (loanAmount > 0) {
                    console.log(`Sending ${loanAmount} to loan`);
                    // TODO: Send to loan account
                }
            } else {
                // All goes to loan
                console.log(`Sending all ${accountData.totalRoundUp} to loan`);
                // TODO: Send to loan account
            }

            // Mark transactions as processed
            const db = admin.firestore();
            const batch = db.batch();
            
            for (const transactionRef of accountData.transactions) {
                // Get a fresh reference from our current admin instance
                const freshRef = db.collection('users')
                    .doc(userId)
                    .collection('transactions')
                    .doc(transactionRef.id);
                    
                batch.update(freshRef, {
                    round_up_status: 'processed',
                    processed_at: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            
            await batch.commit();
        }

        return { success: true };

    } catch (error) {
        console.error('Error processing daily round-ups:', error);
        throw error;
    }
}

module.exports = {
    processDailyRoundups
};
