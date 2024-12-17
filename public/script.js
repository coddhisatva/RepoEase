// Import the Firebase SDK
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth"; // Import the auth module
import { getFirestore } from "firebase/firestore"; // Import the Firestore module
import * as firebaseui from 'firebaseui'
import 'firebaseui/dist/firebaseui.css'

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDwQb6wHcrjxhmukxz6CAWCdz64zwqPbv0",
  authDomain: "ease-f14d8.firebaseapp.com",
  projectId: "ease-f14d8",
  storageBucket: "ease-f14d8.firebasestorage.app",
  messagingSenderId: "1055001435382",
  appId: "1:1055001435382:web:0074d289f778085ccda0d7",
  measurementId: "G-RY6FXD9FZ0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Access Firebase services
const db = getFirestore(app); // Get Firestore instance
const auth = getAuth(app); // Get Authentication instance


// Function to initialize FirebaseUI on index.html
function initializeFirebaseUI() {
  // Initialize the FirebaseUI Widget using Firebase.
  const ui = new firebaseui.auth.AuthUI(auth);

  // Configure FirebaseUI.
  const uiConfig = {
    signInOptions: [
      'password', // Equivalent to firebaseui.auth.EmailAuthProvider.PROVIDER_ID
      'google.com'
    ],
    signInSuccessUrl: '/dashboard.html', // Redirect to dashboard after sign-in
    // Optional callbacks
    callbacks: {
      signInSuccessWithAuthResult: function(authResult, redirectUrl) {
        console.log('User details:', authResult.user);
        // Return true to continue the redirect.
        return true;
      }
    }
  };

  // Start FirebaseUI
  ui.start('#firebaseui-auth-container', uiConfig);
}


// Function to handle dashboard page logic
function initializeDashboard() {
  // Check authentication state; if no user, redirect to index.html
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = 'index.html';
    } else {
      console.log('User is signed in:', user);
      
      // Add event listener for Plaid Link button
      const linkButton = document.getElementById('link-button');
      if (linkButton) {
        console.log('Link button found, adding click listener');
        linkButton.addEventListener('click', initializePlaidLink);
      } else {
        console.error('Link button not found in the DOM');
      }
    }
  });

  // Sign-out logic
  const signOutButton = document.getElementById('sign-out-button');
  if (signOutButton) {
    signOutButton.addEventListener('click', () => {
      signOut(auth).then(() => {
        // Sign-out successful, redirect to login page
        window.location.href = 'index.html';
      }).catch((error) => {
        console.error('Sign-out error:', error);
        alert('Error signing out. Please try again.');
      });
    });
  }

  // Add webhook test button handler
  const testWebhookButton = document.getElementById('test-webhook-button');
  if (testWebhookButton) {
    console.log('Test webhook button found, adding click listener');
    testWebhookButton.addEventListener('click', async () => {
      try {
        const response = await fetch('http://localhost:3000/api/plaid/simulate_webhook', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            item_id: '6PoLb53xx7Ie6JPyxMqXSvkdyKmzxLcgbjlGl'
          })
        });
        const data = await response.json();
        console.log('Webhook simulation response:', data);
      } catch (error) {
        console.error('Error testing webhook:', error);
      }
    });
  }

  // Add process roundups button handler
  const processRoundupsButton = document.getElementById('processRoundups');
  if (processRoundupsButton) {
    console.log('Process roundups button found, adding click listener');
    processRoundupsButton.addEventListener('click', async () => {
      try {
        const response = await fetch('http://localhost:3000/api/plaid/process_daily_roundups', {
          method: 'POST'
        });
        const data = await response.json();
        console.log('Daily roundups response:', data);
      } catch (error) {
        console.error('Error processing daily round-ups:', error);
      }
    });
  }

  console.log('Dashboard script loaded. User should be signed in if they’re here.');
}

// Detect which page is loaded and initialize accordingly
if (document.getElementById('firebaseui-auth-container')) {
  initializeFirebaseUI();
} else if (document.getElementById('sign-out-button')) {
  initializeDashboard();
}

// Function to create Link Token
async function createLinkToken() {
  try {
    // Get current user ID from Firebase Auth
    const user = auth.currentUser;
    if (!user) {
      console.error('No user is signed in');
      return null;
    }

    const response = await fetch('http://localhost:3000/api/plaid/create_link_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.uid }), // Use Firebase user ID
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log('Link token created successfully:', data);
    return data.link_token;
  } catch (error) {
    console.error('Error creating link token:', error);
    return null;
  }
}

// Function to initialize Plaid Link
async function initializePlaidLink() {
  console.log('Initializing Plaid Link...');
  const linkToken = await createLinkToken();
  if (!linkToken) {
    console.error('Failed to create link token');
    alert('Failed to create link token');
    return;
  }

  // Verify Plaid is available
  if (!window.Plaid) {
    console.error('Plaid script is not loaded');
    return;
  }

  console.log('Current user ID:', auth.currentUser.uid);

  const handler = Plaid.create({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      console.log('Plaid Link success:', metadata);
      try {
        const response = await fetch('http://localhost:3000/api/plaid/exchange_public_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            public_token: public_token,
            userId: auth.currentUser.uid,
            institution_id: metadata.institution.institution_id
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        console.log('Access Token stored successfully');
      } catch (error) {
        console.error('Error exchanging public token:', error);
        alert('Error connecting to bank. Please try again.');
      }
    },
    onExit: (err, metadata) => {
      if (err != null) {
        console.error('Error during Plaid Link:', err);
      }
      console.log('Plaid Link exit:', metadata);
    },
    onLoad: () => {
      console.log('Plaid Link loaded');
    },
    onEvent: (eventName, metadata) => {
      console.log('Plaid Link event:', eventName, metadata);
    },
  });

  console.log('Opening Plaid Link...');
  handler.open();
}

async function fetchTransactions() {
    try {
        const response = await fetch('/api/plaid/fetch_transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: auth.currentUser.uid
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to fetch transactions');
        }

        const data = await response.json();
        console.log('Transactions:', data.transactions);
        return data.transactions;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}