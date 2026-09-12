import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDvqrOEPkDfen5o1M8whEuSfO9ixmCC6UU',
  authDomain: 'solar-energy-optimizer.firebaseapp.com',
  projectId: 'solar-energy-optimizer',
  storageBucket: 'solar-energy-optimizer.firebasestorage.app',
  messagingSenderId: '1039248907467',
  appId: '1:1039248907467:web:a6addb42d299eb694c0f4e',
  measurementId: 'G-K7T2DJTH86',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
