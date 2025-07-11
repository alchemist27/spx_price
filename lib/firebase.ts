import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDruR-6zx9lP26r8Omc1BzNa2inAKhPr54",
  authDomain: "spx-price.firebaseapp.com",
  projectId: "spx-price",
  storageBucket: "spx-price.firebasestorage.app",
  messagingSenderId: "751338163184",
  appId: "1:751338163184:web:6a86de741b4d8437c5ab35"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export interface Cafe24Token {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

export const saveToken = async (token: Cafe24Token) => {
  try {
    await setDoc(doc(db, 'tokens', 'cafe24'), token);
    return true;
  } catch (error) {
    console.error('Error saving token:', error);
    return false;
  }
};

export const getToken = async (): Promise<Cafe24Token | null> => {
  try {
    const docRef = doc(db, 'tokens', 'cafe24');
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as Cafe24Token;
    }
    return null;
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
};

export const updateToken = async (token: Partial<Cafe24Token>) => {
  try {
    const docRef = doc(db, 'tokens', 'cafe24');
    await updateDoc(docRef, token);
    return true;
  } catch (error) {
    console.error('Error updating token:', error);
    return false;
  }
};

export const isTokenExpired = (token: Cafe24Token): boolean => {
  return Date.now() >= token.expires_at;
};

export { db }; 