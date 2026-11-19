// Firebase loyiha sozlamalari (Firebase Console → Project settings → Your apps → Web app).
// Bu kalitlar maxfiy emas — xavfsizlikni firestore.rules ta'minlaydi.
export const firebaseConfig = {
  apiKey: "AIzaSyBTOHbFPMPa9v-y9WAW5qSF8ibftyscTK4",
  authDomain: "kanji-dojo-a6cd7.firebaseapp.com",
  projectId: "kanji-dojo-a6cd7",
  storageBucket: "kanji-dojo-a6cd7.firebasestorage.app",
  messagingSenderId: "255317135995",
  appId: "1:255317135995:web:80d3353b1e1502f70048de",
};

// Shu login bilan ro'yxatdan o'tgan odam avtomatik admin bo'ladi (firestore.rules da ham shu nom yozilgan).
export const ADMIN_USERNAME = "okaginam";
export const SITE_NAME = "Kanji Dojo";
