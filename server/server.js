// backend/server.js

const express = require('express');
const bodyParser = require('body-parser');
const plaidRoutes = require('./plaidRoutes');
const cors = require('cors');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
console.log('Looking for .env at:', envPath);
require('dotenv').config({ path: envPath });
console.log('Env test - Stripe key:', process.env.STRIPE_SECRET_KEY ? 'exists' : 'missing');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Mount Plaid Routes
app.use('/api/plaid', plaidRoutes);

// Root Endpoint
app.get('/', (req, res) => {
  res.send('Ease.Cash Backend Server');
});

// Start Server
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});

const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
