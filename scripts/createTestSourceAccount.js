const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const admin = require('firebase-admin');
require('dotenv').config();

async function createTestSourceAccount() {
    const configuration = new Configuration({
        basePath: PlaidEnvironments.sandbox,
        baseOptions: {
            headers: {
                'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
                'PLAID-SECRET': process.env.PLAID_SECRET,
            },
        },
    });

    const plaidClient = new PlaidApi(configuration);

    try {
        // Create a sandbox bank account
        const createResponse = await plaidClient.sandboxPublicTokenCreate({
            institution_id: 'ins_109508',  // Chase Bank in sandbox
            initial_products: ['auth', 'transactions']
        });

        // Exchange public token for access token
        const exchangeResponse = await plaidClient.itemPublicTokenExchange({
            public_token: createResponse.data.public_token
        });

        // Get account ID
        const accountsResponse = await plaidClient.accountsGet({
            access_token: exchangeResponse.data.access_token
        });

        const checkingAccount = accountsResponse.data.accounts.find(
            acc => acc.type === 'depository' && acc.subtype === 'checking'
        );

        // Store in Firestore for our test user
        const serviceAccount = require('../server/firebase-service-account.json');
        
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }

        await admin.firestore()
            .collection('users')
            .doc('test-user-123')
            .collection('plaidItems')
            .add({
                access_token: exchangeResponse.data.access_token,
                accountDetails: [{
                    id: checkingAccount.account_id,
                    name: checkingAccount.name,
                    type: checkingAccount.type,
                    subtype: checkingAccount.subtype,
                    mask: checkingAccount.mask,
                    purpose: 'source'
                }]
            });

        console.log('Test source account created and stored!');
        console.log('Account ID:', checkingAccount.account_id);

    } catch (error) {
        console.error('Error creating test source account:', error);
    }
}

createTestSourceAccount(); 