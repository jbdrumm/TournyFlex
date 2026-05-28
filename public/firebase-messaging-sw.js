// TournyFlex — Firebase Cloud Messaging Service Worker
// Placeholder for future push notification support.
// This file sits silently and does nothing until FCM is configured.
//
// To activate in the future:
//   1. Add Firebase project config below
//   2. Initialize firebase/app and firebase/messaging
//   3. Add VITE_FIREBASE_* env vars to Netlify
//   4. Wire up permission request flow in the app

// importScripts('https://www.gstatic.com/firebasejs/10.x.x/firebase-app-compat.js');
// importScripts('https://www.gstatic.com/firebasejs/10.x.x/firebase-messaging-compat.js');

// firebase.initializeApp({ ... });
// const messaging = firebase.messaging();
// messaging.onBackgroundMessage((payload) => { ... });

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
