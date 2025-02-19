const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { plaidClient } = require('./plaidConfig');

async function processDailyRoundups(userId, transactions, startDate, endDate, stripe, admin) {
    try {
        // Group transactions by account
        const accountTransactions = new Map();
        transactions.forEach(tx => {
            const accountId = tx.data().account_id;
            if (!accountTransactions.has(accountId)) {
                accountTransactions.set(accountId, {
                    transactions: [],
                    totalRoundUp: 0
                });
            }
            const roundUpAmount = tx.data().round_up_amount || 0;
            accountTransactions.get(accountId).transactions.push(tx);
            accountTransactions.get(accountId).totalRoundUp += roundUpAmount;
        });

        // Process each account's transactions
        for (const [accountId, accountData] of accountTransactions) {
            console.log(`Processing account ${accountId} with total roundup: ${accountData.totalRoundUp}`);
            
            // Cancel Stripe authorizations first
            for (const tx of accountData.transactions) {
                const txData = tx.data();
                if (txData.stripe_payment_intent_id) {
                    try {
                        console.log(`Cancelling authorization for transaction ${tx.id}`);
                        await stripe.paymentIntents.cancel(txData.stripe_payment_intent_id);
                    } catch (error) {
                        console.error(`Error cancelling auth ${txData.stripe_payment_intent_id}:`, error);
                    }
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
            const remainingFee = subscription.monthly_fee - (subscription.current_period.collected || 0);
            
            let loanAmount = accountData.totalRoundUp;

            // If subscription fee not met, split the amount
            if (remainingFee > 0 && loanAmount > 0) {
                if (loanAmount <= remainingFee) {
                    // All goes to subscription
                    await subscriptionDoc.ref.update({
                        'current_period.collected': admin.firestore.FieldValue.increment(loanAmount)
                    });
                    loanAmount = 0;
                } else {
                    // Split between subscription and loan
                    await subscriptionDoc.ref.update({
                        'current_period.collected': admin.firestore.FieldValue.increment(remainingFee)
                    });
                    loanAmount -= remainingFee;
                }
            }

            if (loanAmount > 0) {
                console.log(`Sending ${loanAmount} to loan`);
                
                try {
                    // Get source account details
                    const plaidItemsSnapshot = await admin.firestore()
                        .collection('users')
                        .doc(userId)
                        .collection('plaidItems')
                        .get();

                    // Find the source account that matches our transactions
                    const sourceItem = plaidItemsSnapshot.docs.find(doc => {
                        const data = doc.data();
                        return data.accountDetails && 
                               data.accountDetails.some(acc => 
                                   acc.purpose === 'source' && 
                                   acc.id === accountId  // Match the account ID from transactions
                               );
                    });

                    if (!sourceItem) {
                        throw new Error(`No source account found for account ID: ${accountId}`);
                    }

                    const sourceAccount = sourceItem.data().accountDetails.find(acc => acc.purpose === 'source');

                    // 1. First create a transfer authorization
                    const authorizationResponse = await plaidClient.transferAuthorizationCreate({
                        access_token: sourceItem.data().access_token,
                        account_id: sourceAccount.id,
                        type: 'credit',
                        network: 'ach',
                        amount: loanAmount.toString(),
                        ach_class: 'ppd',
                        user: {
                            legal_name: 'Test User'
                        }
                    });

                    // 2. Then create the transfer using the authorization
                    const transferResponse = await plaidClient.transferCreate({
                        access_token: sourceItem.data().access_token,
                        account_id: sourceAccount.id,
                        authorization_id: authorizationResponse.data.authorization.id,
                        amount: loanAmount.toString(),
                        description: 'Ease Round-up'
                    });

                    // Store transfer details and update transactions
                    const batch = admin.firestore().batch();
                    
                    // Store transfer record
                    const transferRef = admin.firestore()
                        .collection('users')
                        .doc(userId)
                        .collection('transfers')
                        .doc(transferResponse.data.transfer.id);

                    batch.set(transferRef, {
                        status: transferResponse.data.transfer.status,
                        amount: loanAmount,
                        source_account: sourceAccount.id,
                        created_at: admin.firestore.FieldValue.serverTimestamp()
                    });

                    // Update transactions
                    accountData.transactions.forEach(tx => {
                        batch.update(tx.ref, {
                            round_up_status: 'processing',
                            transfer_id: transferResponse.data.transfer.id,
                            processed_at: admin.firestore.FieldValue.serverTimestamp()
                        });
                    });

                    await batch.commit();

                } catch (error) {
                    console.error('Error creating transfer:', error);
                    throw error;
                }
            }
        }

        return { success: true };

    } catch (error) {
        console.error('Error processing daily round-ups:', error);
        throw error;
    }
}

module.exports = { processDailyRoundups };
