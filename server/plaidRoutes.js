const express = require('express');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const router = express.Router();
const admin = require('firebase-admin');

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
    const plaidClient = getPlaidClient();
    const { public_token, userId } = req.body;
    
    console.log('Received request with userId:', userId); // Debug log
  
    try {
        const response = await plaidClient.itemPublicTokenExchange({
            public_token: public_token
        });
        
        const access_token = response.data.access_token;
        const item_id = response.data.item_id;

        console.log('Got access token:', access_token); // Debug log
        console.log('Attempting to store in Firestore for user:', userId); // Debug log

        // Store in Firebase
        await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('plaidItems')
            .doc(item_id)
            .set({
                access_token: access_token,
                item_id: item_id,
                institution_id: req.body.institution_id,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            });

        console.log('Successfully stored in Firestore'); // Debug log
        res.json({ success: true });
    } catch (error) {
        console.error('Error in exchange_public_token:', error); // More detailed error log
        res.status(500).json({ 
            error: 'Failed to exchange public token',
            details: error.message 
        });
    }
  });
  
  // Export the router
  module.exports = router;