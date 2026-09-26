import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore'
import { connectAuthEmulator } from 'firebase/auth'

// Web config is not a secret (it only identifies the project). Access is protected by
// Firebase Auth + firestore.rules. Values can be overridden with VITE_FIREBASE_* env vars.
const env = import.meta.env
export const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'AIzaSyB8gjqJvHXEjGylXU_u-_00O7icJxwyiRU',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? 'punjadarapos.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'punjadarapos',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? 'punjadarapos.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '35929191957',
  appId: env.VITE_FIREBASE_APP_ID ?? '1:35929191957:web:920faadd7c91ef46fa001c',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Offline cache: repeated reads of the same documents are served locally,
// which keeps daily read counts low and lets Sales keep working on a weak signal.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

// `npm run dev:emu` -> talk to the local emulators instead of the real project (no quota used)
if (env.VITE_USE_EMULATOR === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
}
