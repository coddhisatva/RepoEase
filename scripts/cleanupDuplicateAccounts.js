const admin = require('firebase-admin');
const serviceAccount = require('../server/firebase-service-account.json');
require('dotenv').config();

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

async function cleanupDuplicateAccounts() {
    try {
        const userId = 'test-user-123';
        
        // Get all plaidItems
        const plaidItems = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('plaidItems')
            .get();

        // Group by account ID
        const accountGroups = new Map();
        
        plaidItems.forEach(doc => {
            const data = doc.data();
            const accountId = data.accountDetails[0].id;
            
            if (!accountGroups.has(accountId)) {
                accountGroups.set(accountId, []);
            }
            accountGroups.get(accountId).push({
                docId: doc.id,
                data: data
            });
        });

        // Remove duplicates, keeping the first entry
        for (const [accountId, docs] of accountGroups) {
            if (docs.length > 1) {
                console.log(`Found ${docs.length} entries for account ${accountId}`);
                console.log('Keeping:', docs[0].docId);
                
                // Delete all but the first one
                for (let i = 1; i < docs.length; i++) {
                    console.log('Deleting:', docs[i].docId);
                    await admin.firestore()
                        .collection('users')
                        .doc(userId)
                        .collection('plaidItems')
                        .doc(docs[i].docId)
                        .delete();
                }
            }
        }

        console.log('Cleanup complete!');

    } catch (error) {
        console.error('Error cleaning up duplicate accounts:', error);
    }
}

cleanupDuplicateAccounts(); 