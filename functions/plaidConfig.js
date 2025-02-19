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

module.exports = { plaidClient }; 