const express = require('express');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const router = express.Router();
const admin = require('firebase-admin');
const crypto = require('crypto');
const { processDailyRoundups } = require('../functions/roundupProcessor');

let stripe;

// Initialize after router is created
router.use(async (req, res, next) => {
    if (!stripe) {
        stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    }
    next();
});

// Add this line to declare the client variable
let client;

// Encryption helper functions
function encrypt(text) {
    try {
        const key = Buffer.from(process.env.ENCRYPTION_KEY, 'base64');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            iv: iv.toString('hex'),
            encryptedData: encrypted,
            authTag: authTag.toString('hex')
        };
    } catch (error) {
        console.error('Encryption error details:', error);
        throw error;
    }
}

function decrypt(encrypted) {
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'base64');
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm', 
        key,
        Buffer.from(encrypted.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

// Initialize the client
function getPlaidClient() {
    if (!client) {
        const configuration = new Configuration({
            basePath: PlaidEnvironments[process.env.PLAID_ENV],
            baseOptions: {
                headers: {
                    'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
                    'PLAID-SECRET': process.env.PLAID_SECRET,
                },
            },
        });
        client = new PlaidApi(configuration);
    }
    return client;
}

// Endpoint to create a Link Token
router.post('/create_link_token', async (req, res) => {
    const { user_id } = req.body;
    
    if (!user_id) {
        console.error('Missing user_id in request');
        return res.status(400).json({ 
            error: 'Missing user_id in request body'
        });
    }

    const plaidClient = getPlaidClient();

    try {
        const response = await plaidClient.linkTokenCreate({
            user: { client_user_id: user_id },
            client_name: 'Ease.Cash',
            products: ['transactions', 'auth', 'liabilities'],
            country_codes: ['US'],
            language: 'en'
        });
        
        if (!response.data.link_token) {
            console.error('No link token in Plaid response');
            return res.status(500).json({ 
                error: 'Invalid response from Plaid'
            });
        }
        
        console.log('Link token created successfully for user:', user_id);
        res.json({ link_token: response.data.link_token });
    } catch (error) {
        console.error('Error creating link token:', error);
        res.status(500).json({ 
            error: 'Unable to create link token',
            details: error.message
        });
    }
});
  
  // Endpoint to exchange Public Token for Access Token
  router.post('/exchange_public_token', async (req, res) => {
    try {
        const { public_token, userId, institution_id } = req.body;
        console.log('Exchanging public token for:', { userId, institution_id });
        
        const plaidClient = getPlaidClient();
        const exchangeResponse = await plaidClient.itemPublicTokenExchange({
            public_token: public_token
        });

        const access_token = exchangeResponse.data.access_token;
        const item_id = exchangeResponse.data.item_id;

        // Get account details
        const accountsResponse = await plaidClient.accountsGet({
            access_token: access_token
        });

        const accounts = accountsResponse.data.accounts;
        console.log('Retrieved accounts:', accounts);

        // Store new connection with account details and purposes
        const encryptedToken = encrypt(access_token);
        await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('plaidItems')
            .doc(item_id)
            .set({
                encrypted_access_token: encryptedToken,
                item_id: item_id,
                institution_id: institution_id,
                accountDetails: accounts.map(a => ({
                    id: a.account_id,
                    name: a.name,
                    type: a.type,
                    subtype: a.subtype,
                    mask: a.mask,
                    purpose: (a.type === 'loan' && a.subtype === 'student') 
                        ? 'destination' 
                        : 'source'
                })),
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                last_updated: admin.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            });

        res.json({ success: true });
    } catch (error) {
        console.error('Error in exchange_public_token:', error);
        res.status(500).json({ error: error.message });
    }
  });
  
  // Endpoint to fetch transactions
  router.post('/fetch_transactions', async (req, res) => {
    const { userId } = req.body;
    const plaidClient = getPlaidClient();

    try {
        // Get all active plaidItems for this user
        const plaidItemsSnapshot = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('plaidItems')
            .where('status', '==', 'active')
            .get();

        const allTransactions = [];

        // For each plaidItem, get transactions from source accounts
        for (const doc of plaidItemsSnapshot.docs) {
            const plaidItem = doc.data();
            const sourceAccounts = plaidItem.accountDetails
                .filter(account => account.purpose === 'source')
                .map(account => account.id);

            if (sourceAccounts.length > 0) {
                // Decrypt access token
                const decryptedToken = decrypt(plaidItem.encrypted_access_token);

                // Get transactions for the last 7 days
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 7);
                
                const response = await plaidClient.transactionsGet({
                    access_token: decryptedToken,
                    start_date: startDate.toISOString().split('T')[0],
                    end_date: new Date().toISOString().split('T')[0],
                    options: {
                        account_ids: sourceAccounts
                    }
                });

                allTransactions.push(...response.data.transactions);
            }
        }

        res.json({ transactions: allTransactions });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ 
            error: 'Failed to fetch transactions',
            details: error.message 
        });
    }
  });
  
  // Create a function for the webhook handler logic
  async function handleWebhook(req, res) {
    const { webhook_type, webhook_code, item_id, transfer_id } = req.body;
    console.log('Webhook received:', { webhook_type, webhook_code, item_id, transfer_id });

    try {
        if (webhook_type === 'TRANSACTIONS') {
            // Find plaidItem
            const plaidItemsQuery = await admin.firestore()
                .collectionGroup('plaidItems')
                .where('item_id', '==', item_id)
                .get();

            if (plaidItemsQuery.empty) {
                return res.status(404).json({ 
                    error: 'Plaid item not found',
                    item_id: item_id
                });
            }

            const plaidItemDoc = plaidItemsQuery.docs[0];
            const userId = plaidItemDoc.ref.parent.parent.id;
            const plaidItem = plaidItemDoc.data();

            // Debug log the encrypted token
            console.log('Encrypted token structure:', plaidItem.encrypted_access_token);

            // Get transactions from Plaid
            const plaidClient = getPlaidClient();
            const transactionsResponse = await plaidClient.transactionsGet({
                access_token: decrypt(plaidItem.encrypted_access_token),
                start_date: '2024-01-01',
                end_date: new Date().toISOString().split('T')[0]
            });

            // Store transactions in Firestore
            const batch = admin.firestore().batch();
            const transactionsRef = admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('transactions');

            const userAccounts = await admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('plaidItems')
                .where('accountDetails.purpose', '==', 'destination')
                .get();

            if (!userAccounts.empty) {  // Only create auth holds if SLA exists
                for (const transaction of transactionsResponse.data.transactions) {
                    if (!transaction.pending) {
                        // Calculate round-up
                        const roundUpAmount = transaction.amount > 0 
                            ? Number((Math.ceil(transaction.amount) - transaction.amount).toFixed(2))
                            : 0;
                        
                        let stripeAuthId = null;
                        
                        // Only create auth if there's a round-up amount
                        if (roundUpAmount > 0) {
                            try {
                                // Create Stripe authorization hold
                                const auth = await stripe.paymentIntents.create({
                                    amount: Math.round(roundUpAmount * 100), // Convert to cents
                                    currency: 'usd',
                                    customer: plaidItem.stripe_customer_id, // We'll need this from earlier setup
                                    capture_method: 'manual',
                                    description: `Round-up hold for ${transaction.name}`
                                });
                                stripeAuthId = auth.id;
                                console.log(`Created auth hold: ${stripeAuthId} for $${roundUpAmount}`);
                            } catch (stripeError) {
                                console.error('Stripe auth error:', stripeError);
                                // Continue processing other transactions
                            }
                        }

                        const docRef = transactionsRef.doc(transaction.transaction_id);
                        batch.set(docRef, {
                            plaid_transaction_id: transaction.transaction_id,
                            account_id: transaction.account_id,
                            amount: transaction.amount,
                            date: transaction.date,
                            name: transaction.name,
                            round_up_amount: roundUpAmount,
                            round_up_status: roundUpAmount > 0 ? 'pending' : 'na',
                            stripe_auth_id: stripeAuthId,
                            created_at: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                    }
                }
            }

            await batch.commit();
            console.log(`Stored ${transactionsResponse.data.transactions.length} transactions`);

            return res.json({ 
                success: true, 
                message: 'Processed new transactions',
                count: transactionsResponse.data.transactions.length
            });
        } 
        else if (webhook_type === 'TRANSFER' && transfer_id) {
            console.log('Transfer webhook received:', transfer_id);
            // Update transfer status in Firestore
            const transfersSnapshot = await admin.firestore()
                .collectionGroup('transfers')
                .where('transfer_id', '==', transfer_id)
                .get();

            if (!transfersSnapshot.empty) {
                const transferDoc = transfersSnapshot.docs[0];
                await transferDoc.ref.update({
                    status: webhook_code,
                    updated_at: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`Updated transfer ${transfer_id} status to ${webhook_code}`);

                // If transfer failed, we need to handle it
                if (webhook_code === 'TRANSFER_FAILED') {
                    // Get the original transaction IDs
                    const transferData = transferDoc.data();
                    if (transferData.transactionIds) {
                        // Reset transactions to pending
                        const batch = admin.firestore().batch();
                        for (const txId of transferData.transactionIds) {
                            const txRef = admin.firestore()
                                .collection('users')
                                .doc(transferData.userId)
                                .collection('transactions')
                                .doc(txId);
                            batch.update(txRef, {
                                round_up_status: 'pending'
                            });
                        }
                        await batch.commit();
                    }
                }
            }
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(500).json({ error: error.message });
    }
  }

  // Use the handler in both routes
  router.post('/webhook', handleWebhook);

  router.post('/simulate_webhook', async (req, res) => {
    console.log('Received webhook simulation request');
    
    try {
        // Create a mock webhook payload
        const mockWebhookPayload = {
            webhook_type: 'TRANSACTIONS',
            webhook_code: 'DEFAULT_UPDATE',
            item_id: req.body.item_id,
            new_transactions: 3,
            timestamp: new Date().toISOString()
        };

        // Update request body and forward to handler
        req.body = mockWebhookPayload;
        await handleWebhook(req, res);

    } catch (error) {
        console.error('Error simulating webhook:', error);
        res.status(500).json({ 
            error: 'Failed to simulate webhook',
            details: error.message 
        });
    }
  });

  // The endpoint stays the same, just uses the imported function
  router.post('/process_daily_roundups', async (req, res) => {
    try {
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 1);

        const result = await processDailyRoundups(startDate, endDate, stripe);
        res.json(result);
    } catch (error) {
        console.error('Error in process_daily_roundups endpoint:', error);
        res.status(500).json({
            error: 'Failed to process daily round-ups',
            details: error.message
        });
    }
  });

  // Add this with other Plaid endpoints
  router.post('/transfer/authorize', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const plaidClient = getPlaidClient();
        
        // Format amount to always have 2 decimal places
        const formattedAmount = Number(amount).toFixed(2);
        
        // Get user's Plaid items
        const plaidItemsSnapshot = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('plaidItems')
            .get();

        if (plaidItemsSnapshot.empty) {
            return res.status(400).json({ error: 'No linked bank accounts found' });
        }

        // Use the first linked account for now
        const plaidItem = plaidItemsSnapshot.docs[0].data();
        
        // Decrypt the access token using our existing decrypt function
        const decryptedToken = decrypt(plaidItem.encrypted_access_token);
        
        // Find the first source account
        const sourceAccount = plaidItem.accountDetails.find(acc => acc.purpose === 'source');

        if (!sourceAccount) {
            return res.status(400).json({ error: 'No valid source account found' });
        }

        const authRequest = {
            access_token: decryptedToken,
            account_id: sourceAccount.id,
            type: 'credit',
            network: 'ach',
            amount: formattedAmount,
            ach_class: 'ppd',
            user: {
                legal_name: plaidItem.owner_names?.[0] || 'Account Owner'
            }
        };

        console.log('Auth request prepared:', {
            ...authRequest,
            access_token: 'REDACTED'
        });

        const authResponse = await plaidClient.transferAuthorizationCreate(authRequest);
        console.log('Authorization response from Plaid:', authResponse.data);

        // Store the authorization in Firestore
        await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('transferAuths')
            .doc(authResponse.data.authorization.id)
            .set({
                status: authResponse.data.authorization.decision,
                amount: amount,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
            });

        console.log('Authorization stored in Firestore:', authResponse.data.authorization.id);

        res.json({
            authorization_id: authResponse.data.authorization.id,
            decision: authResponse.data.authorization.decision
        });

    } catch (error) {
        console.error('Transfer authorization error:', error);
        res.status(500).json({ error: error.message });
    }
  });

  router.post('/transfer/create', async (req, res) => {
    try {
        const { userId, authorizationId } = req.body;
        console.log('Creating transfer:', { userId, authorizationId });

        // Get the authorization from Firestore
        const authDoc = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('transferAuths')
            .doc(authorizationId)
            .get();

        if (!authDoc.exists) {
            console.log('Authorization not found:', authorizationId);
            return res.status(404).json({ error: 'Authorization not found' });
        }

        // Get Plaid access token
        const plaidItemsSnapshot = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('plaidItems')
            .get();

        if (plaidItemsSnapshot.empty) {
            console.log('No Plaid items found for user:', userId);
            return res.status(404).json({ error: 'No linked bank accounts found' });
        }

        const plaidItem = plaidItemsSnapshot.docs[0].data();
        const decryptedToken = decrypt(plaidItem.encrypted_access_token);
        
        // Find source account
        const sourceAccount = plaidItem.accountDetails.find(acc => acc.purpose === 'source');
        if (!sourceAccount) {
            console.log('No source account found');
            return res.status(400).json({ error: 'No valid source account found' });
        }

        console.log('Creating transfer with:', {
            access_token: 'REDACTED',
            account_id: sourceAccount.id,
            authorization_id: authorizationId
        });

        try {
            console.log('Sending transfer create request to Plaid...');
            
            // Get Plaid client first
            const plaidClient = getPlaidClient();
            
            // Log what we're about to send
            console.log('Building transfer request...');
            const transferRequest = {
                access_token: decryptedToken,
                account_id: sourceAccount.id,
                authorization_id: authorizationId,
                description: 'Ease roundup'
            };
            
            console.log('Transfer request:', {
                ...transferRequest,
                access_token: 'REDACTED'
            });

            const transferResponse = await plaidClient.transferCreate(transferRequest);
            console.log('Raw Plaid response:', transferResponse);

            if (!transferResponse.data?.transfer) {
                console.error('Unexpected Plaid response format:', transferResponse);
                return res.status(400).json({ 
                    error: 'Invalid Plaid response',
                    details: transferResponse 
                });
            }

            console.log('Transfer created:', transferResponse.data);

            // Store transfer details
            await admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('transfers')
                .doc(transferResponse.data.transfer.id)
                .set({
                    status: transferResponse.data.transfer.status,
                    amount: authDoc.data().amount,
                    created_at: admin.firestore.FieldValue.serverTimestamp(),
                    authorization_id: authorizationId
                });

            res.json({
                transfer_id: transferResponse.data.transfer.id,
                status: transferResponse.data.transfer.status
            });
        } catch (plaidError) {
            // Log the full error structure
            console.error('Detailed Plaid error:', {
                message: plaidError.message,
                stack: plaidError.stack,
                response: {
                    data: plaidError.response?.data,
                    status: plaidError.response?.status,
                    statusText: plaidError.response?.statusText,
                    headers: plaidError.response?.headers
                }
            });

            return res.status(400).json({
                error: 'Plaid API error',
                details: {
                    message: plaidError.message,
                    plaidError: plaidError.response?.data
                }
            });
        }
    } catch (error) {
        console.error('Transfer creation error:', error);
        res.status(500).json({ error: error.message });
    }
  });

  // Add to existing routes
  router.post('/create_transfer', async (req, res) => {
    try {
        const { 
            sourceAccountId, 
            destinationAccountId,
            amount,
            userId
        } = req.body;

        // Get the access tokens for source and destination accounts
        const accountsSnapshot = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('plaidItems')
            .get();

        let sourceToken = null;
        let destinationToken = null;

        accountsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.accountDetails.some(acc => acc.id === sourceAccountId)) {
                sourceToken = data.access_token;
            }
            if (data.accountDetails.some(acc => acc.id === destinationAccountId)) {
                destinationToken = data.access_token;
            }
        });

        if (!sourceToken || !destinationToken) {
            throw new Error('Could not find access tokens for accounts');
        }

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

        // 2. Create the transfer with authorization
        const transferResponse = await plaidClient.transferCreate({
            access_token: sourceToken,
            account_id: sourceAccountId,
            authorization_id: authResponse.data.authorization.id,  // Add authorization ID
            type: 'debit',
            network: 'ach',
            amount: amount.toString(),
            description: 'Ease.Cash Round-up Transfer',
            ach_class: 'ppd',
            user: {
                legal_name: 'Ease.Cash User'
            }
        });

        // Store transfer details in Firestore
        await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('transfers')
            .add({
                transfer_id: transferResponse.data.transfer.id,
                source_account_id: sourceAccountId,
                destination_account_id: destinationAccountId,
                amount: amount,
                status: transferResponse.data.transfer.status,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            });

        res.json({
            success: true,
            transfer_id: transferResponse.data.transfer.id,
            status: transferResponse.data.transfer.status,
            authorization_id: authResponse.data.authorization.id  // Include auth ID in response
        });

    } catch (error) {
        console.error('Transfer creation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
  });

  // Add webhook handler for transfer status updates
  router.post('/webhook', async (req, res) => {
    try {
        const { webhook_type, webhook_code, transfer_id } = req.body;

        if (webhook_type === 'TRANSFER' && transfer_id) {
            // Get transfer details from Firestore
            const transfersSnapshot = await admin.firestore()
                .collectionGroup('transfers')
                .where('transfer_id', '==', transfer_id)
                .get();

            if (!transfersSnapshot.empty) {
                const transferDoc = transfersSnapshot.docs[0];
                
                // Update transfer status
                await transferDoc.ref.update({
                    status: webhook_code,
                    updated_at: admin.firestore.FieldValue.serverTimestamp()
                });

                // Handle specific status updates
                switch (webhook_code) {
                    case 'TRANSFER_COMPLETED':
                        console.log(`Transfer ${transfer_id} completed successfully`);
                        break;
                    case 'TRANSFER_FAILED':
                        console.error(`Transfer ${transfer_id} failed`);
                        // TODO: Implement retry logic or notify user
                        break;
                    case 'TRANSFER_CANCELED':
                        console.log(`Transfer ${transfer_id} was canceled`);
                        break;
                }
            }
        }

        res.json({ received: true });

    } catch (error) {
        console.error('Webhook handling error:', error);
        res.status(500).json({ error: error.message });
    }
  });

  router.post('/get_liabilities', async (req, res) => {
    try {
        const { access_token } = req.body;
        
        const liabilitiesResponse = await plaidClient.liabilitiesGet({
            access_token: access_token
        });

        console.log('Liabilities data:', JSON.stringify(liabilitiesResponse.data, null, 2));
        
        return res.json({
            success: true,
            liabilities: liabilitiesResponse.data
        });
    } catch (error) {
        console.error('Error fetching liabilities:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
  });

  // Export the router
  module.exports = router;