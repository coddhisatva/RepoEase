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
            products: ['transactions'],           // Required product
            optional_products: ['liabilities'],   // Optional product
            country_codes: ['US'],
            language: 'en',
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
        // Exchange public token
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

        // Check for existing connections with these accounts
        const existingConnections = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('plaidItems')
            .where('status', '==', 'active')
            .where('institution_id', '==', institution_id)
            .get();

        let hasDuplicate = false;
        existingConnections.forEach(doc => {
            const data = doc.data();
            if (data.accountDetails) {
                // Check for same account types/subtypes instead of IDs
                const existingTypes = data.accountDetails.map(a => `${a.type}-${a.subtype}`);
                const newTypes = accounts.map(a => `${a.type}-${a.subtype}`);
                
                const hasOverlap = existingTypes.some(type => newTypes.includes(type));
                if (hasOverlap) {
                    hasDuplicate = true;
                }
            }
        });

        if (hasDuplicate) {
            return res.status(400).json({
                error: 'Duplicate connection',
                details: 'One or more accounts are already connected'
            });
        }

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
                        ? 'destination'  // Only student loans are destinations
                        : 'source'      // Everything else is a source for round-ups
                })),
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                last_updated: admin.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            });

        // Log the types of accounts connected
        const purposes = accounts.map(a => ({
            type: a.type,
            subtype: a.subtype,
            purpose: (a.type === 'loan' && a.subtype === 'student') 
                ? 'destination' 
                : 'source'
        }));
        console.log('Connected accounts with purposes:', purposes);

        res.json({ success: true });
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