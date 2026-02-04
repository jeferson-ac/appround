
import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, query, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAOi9kC3IKHNPIzlJbIu0pbq8uiyOaguo0",
  authDomain: "appround-ac.firebaseapp.com",
  projectId: "appround-ac",
  storageBucket: "appround-ac.firebasestorage.app",
  messagingSenderId: "834566090020",
  appId: "1:834566090020:web:f3fec4314d87ac7cafd7b1",
  measurementId: "G-GPJMM4WT65"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Analytics is optional and only works in browser environments
if (typeof window !== 'undefined') {
  getAnalytics(app);
}

export { db, collection, onSnapshot, query, doc, setDoc, deleteDoc, updateDoc };
