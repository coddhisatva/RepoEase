// Import the Firebase SDK
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, onAuthStateChanged } from "firebase/auth"; // Import the auth module
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
      'password' // Equivalent to firebaseui.auth.EmailAuthProvider.PROVIDER_ID
      // Add other providers here if needed, e.g.,
      // firebaseui.auth.GoogleAuthProvider.PROVIDER_ID
    ],
    signInSuccessUrl: '/dashboard.html', // Redirect to dashboard after sign-in
    // Optional callbacks
    callbacks: {
      signInSuccessWithAuthResult: function(authResult, redirectUrl) {
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
      // Optionally, display user info or perform other actions
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

  console.log('Dashboard script loaded. User should be signed in if they’re here.');
}

// Detect which page is loaded and initialize accordingly
if (document.getElementById('firebaseui-auth-container')) {
  initializeFirebaseUI();
} else if (document.getElementById('sign-out-button')) {
  initializeDashboard();
}
