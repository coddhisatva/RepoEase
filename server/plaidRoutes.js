const express = require('express');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const router = express.Router();
const admin = require('firebase-admin');
const crypto = require('crypto');

// Add this line to declare the client variable
let client;

// Encryption helper functions
function encrypt(text) {
    try {
        // Debug log
        console.log('Encryption key length:', Buffer.from(process.env.ENCRYPTION_KEY, 'base64').length);
        
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
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm', 
        Buffer.from(process.env.ENCRYPTION_KEY),
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
    
    // Input validation
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
            products: ['transactions', 'liabilities'],
            country_codes: ['US'],
            language: 'en',
        });
        
        // Validate response
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
    const plaidClient = getPlaidClient();
    const { public_token, userId, institution_id } = req.body;
    
    // Input validation
    if (!public_token || !userId) {
        console.error('Missing required fields in request');
        return res.status(400).json({ 
            error: 'Missing required fields',
            details: 'public_token and userId are required'
        });
    }

    try {
        const response = await plaidClient.itemPublicTokenExchange({
            public_token: public_token
        });
        
        const access_token = response.data.access_token;
        const item_id = response.data.item_id;

        if (!access_token || !item_id) {
            console.error('Invalid response from Plaid token exchange');
            return res.status(500).json({ 
                error: 'Invalid response from Plaid'
            });
        }

        console.log('Got access token:', access_token);
        console.log('Attempting to store in Firestore for user:', userId);

        try {
            // Encrypt the access token
            const encryptedToken = encrypt(access_token);

            // Store encrypted token in Firebase
            await admin.firestore()
                .collection('users')
                .doc(userId)
                .collection('plaidItems')
                .doc(item_id)
                .set({
                    encrypted_access_token: encryptedToken,
                    item_id: item_id,
                    institution_id: institution_id,
                    created_at: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'active'  // Add a status field
                });

            console.log('Successfully stored encrypted token in Firestore');
            res.json({ success: true });
        } catch (storageError) {
            console.error('Error storing access token:', storageError);
            res.status(500).json({ 
                error: 'Failed to store access token',
                details: 'Database operation failed'
            });
        }
    } catch (error) {
        console.error('Error in exchange_public_token:', error);
        res.status(500).json({ 
            error: 'Failed to exchange public token',
            details: error.message 
        });
    }
  });
  
  // Export the router
  module.exports = router;