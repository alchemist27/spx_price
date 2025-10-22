import * as admin from 'firebase-admin';

// Private Key 처리: 따옴표 제거 및 개행 문자 처리
function parsePrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;

  // 따옴표로 감싸져 있으면 제거
  let parsedKey = key.trim();
  if ((parsedKey.startsWith('"') && parsedKey.endsWith('"')) ||
      (parsedKey.startsWith("'") && parsedKey.endsWith("'"))) {
    parsedKey = parsedKey.slice(1, -1);
  }

  // \n을 실제 개행 문자로 변환
  return parsedKey.replace(/\\n/g, '\n');
}

// Firebase Admin 초기화 (서버 사이드 전용)
if (!admin.apps.length) {
  const privateKey = parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL) {
    console.error('❌ Firebase Admin 초기화 실패: 환경변수가 설정되지 않았습니다');
    throw new Error('Firebase Admin credentials are not configured');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: "spx-price",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
    databaseURL: "https://spx-price.firebaseio.com"
  });

  console.log('✅ Firebase Admin SDK 초기화 완료');
}

const db = admin.firestore();

export interface Cafe24Token {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

export const saveToken = async (token: Cafe24Token): Promise<boolean> => {
  try {
    console.log('🔥 Firestore 저장 시도 (Admin SDK):', {
      collection: 'tokens',
      document: 'cafe24',
      hasToken: !!token.access_token,
      expiresAt: new Date(token.expires_at).toISOString()
    });

    await db.collection('tokens').doc('cafe24').set(token);
    console.log('✅ Firestore 저장 완료');
    return true;
  } catch (error) {
    console.error('❌ Firestore 저장 에러:', error);
    if (error instanceof Error) {
      console.error('에러 메시지:', error.message);
      console.error('에러 스택:', error.stack);
    }
    return false;
  }
};

export const getToken = async (): Promise<Cafe24Token | null> => {
  try {
    const docRef = db.collection('tokens').doc('cafe24');
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      return docSnap.data() as Cafe24Token;
    }
    return null;
  } catch (error) {
    console.error('토큰 조회 에러:', error);
    return null;
  }
};

export const updateToken = async (token: Partial<Cafe24Token>): Promise<boolean> => {
  try {
    const docRef = db.collection('tokens').doc('cafe24');
    await docRef.update(token);
    return true;
  } catch (error) {
    console.error('Error updating token:', error);
    return false;
  }
};

export const isTokenExpired = (token: Cafe24Token): boolean => {
  return Date.now() >= token.expires_at;
};

export const deleteToken = async (): Promise<boolean> => {
  try {
    console.log('🗑️ Cafe24 토큰 삭제 시도 (Admin SDK)');
    await db.collection('tokens').doc('cafe24').delete();
    console.log('✅ Cafe24 토큰 삭제 완료');
    return true;
  } catch (error) {
    console.error('❌ 토큰 삭제 실패:', error);
    return false;
  }
};

export { db };
