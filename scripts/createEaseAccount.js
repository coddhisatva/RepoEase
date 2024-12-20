const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
require('dotenv').config();

async function createEaseAccount() {
    // Use existing Plaid credentials
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

        console.log('\nAdd these to your .env file:');
        console.log(`EASE_PLAID_ACCOUNT_ID=${checkingAccount.account_id}`);
        console.log(`EASE_PLAID_ACCESS_TOKEN=${exchangeResponse.data.access_token}`);

    } catch (error) {
        console.error('Error creating Ease account:', error);
    }
}

createEaseAccount(); 