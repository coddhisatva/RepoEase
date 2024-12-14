const express = require('express');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const router = express.Router();

// Move the configuration inside the route handlers
let client;

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
    const plaidClient = getPlaidClient();
    const { user_id } = req.body;
    
    try {
        const response = await plaidClient.linkTokenCreate({
            user: { client_user_id: user_id },
            client_name: 'Ease.Cash',
            products: ['transactions', 'liabilities'],
            country_codes: ['US'],
            language: 'en',
        });
        
        console.log('Plaid response:', response);
        res.json({ link_token: response.data.link_token });
    } catch (error) {
        console.error('Error creating link token:', error);
        res.status(500).json({ error: 'Unable to create link token' });
    }
});
  
  // Endpoint to exchange Public Token for Access Token
  router.post('/exchange_public_token', async (req, res) => {
	const { public_token } = req.body;
  
	try {
	  const response = await client.exchangePublicToken(public_token);
	  const access_token = response.access_token;
	  const item_id = response.item_id;
  
	  // TODO: Store access_token and item_id securely in your database
	  // Example:
	  // await db.savePlaidTokens(userId, access_token, item_id);
  
	  res.json({ access_token, item_id });
	} catch (error) {
	  console.error('Error exchanging public token:', error);
	  res.status(500).json({ error: 'Failed to exchange public token' });
	}
  });
  
  // Export the router
  module.exports = router;