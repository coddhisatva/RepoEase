const { Configuration, PlaidApi } = require('plaid');
require('dotenv').config();

const configuration = new Configuration({
    basePath: process.env.PLAID_ENV === 'sandbox' ? 'https://sandbox.plaid.com' : 'https://development.plaid.com',
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
        },
    },
});

const plaidClient = new PlaidApi(configuration);

// Ease.Cash sandbox account info
const EASE_SANDBOX_ACCOUNT = {
    account_id: process.env.EASE_PLAID_ACCOUNT_ID,
    access_token: process.env.EASE_PLAID_ACCESS_TOKEN
};

// Helper function to verify Ease account is set up
async function verifyEaseAccount() {
    try {
        const response = await plaidClient.accountsGet({
            access_token: EASE_SANDBOX_ACCOUNT.access_token
        });
        console.log('Ease.Cash account verified:', response.data.accounts[0].name);
        return true;
    } catch (error) {
        console.error('Error verifying Ease.Cash account:', error);
        return false;
    }
}

module.exports = {
    plaidClient,
    EASE_SANDBOX_ACCOUNT,
    verifyEaseAccount
}; 