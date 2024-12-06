// Import the Firebase SDK
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth"; // Import the auth module
import { getFirestore } from "firebase/firestore"; // Import the Firestore module
import firebase from 'firebase/compat/app';
import * as firebaseui from 'firebaseui'
import 'firebaseui/dist/firebaseui.css'

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// Initialize the FirebaseUI Widget using Firebase.
var ui = new firebaseui.auth.AuthUI(auth);

// Configure FirebaseUI.
var uiConfig = {
  signInOptions: [
    'password'
  ],
  signInSuccessUrl: '/dashboard.html'
  // Other config options...
};

// Start FirebaseUI
ui.start('#firebaseui-auth-container', uiConfig);

// ... Your Firebase code here ...
