# Firebase Client SDK → Admin SDK 마이그레이션 가이드

## 📋 목차
- [배경 및 목적](#배경-및-목적)
- [보안 이슈 분석](#보안-이슈-분석)
- [마이그레이션 단계](#마이그레이션-단계)
- [발생한 에러 및 해결 방법](#발생한-에러-및-해결-방법)
- [최종 구조](#최종-구조)
- [체크리스트](#체크리스트)

---

## 배경 및 목적

### 문제 상황
클라이언트 사이드에서 Firebase SDK를 직접 사용하여 민감한 토큰 데이터를 저장/조회하고 있었습니다.

```typescript
// ❌ 기존 코드 (클라이언트에서 직접 Firebase 접근)
import { getToken } from '@/lib/firebase';

const token = await getToken(); // 브라우저에서 직접 Firestore 접근
```

### 보안 위험
1. **데이터 노출**: 브라우저 개발자 도구에서 Firebase API 호출 확인 가능
2. **보안 규칙 우회**: 클라이언트에서 실행되므로 Firestore 보안 규칙 제한 필요
3. **API 키 노출**: Firebase 설정이 클라이언트 번들에 포함됨
4. **XSS 취약점**: 클라이언트에서 토큰 처리 시 공격 가능성

### 해결 목표
- ✅ 모든 민감한 데이터 처리를 서버 사이드로 이동
- ✅ Firestore 보안 규칙으로 클라이언트 접근 완전 차단
- ✅ Firebase Admin SDK를 사용한 서버 전용 인증
- ✅ 기존 기능 100% 유지

---

## 보안 이슈 분석

### 1. Git 히스토리에 민감 정보 노출
```bash
# 발견된 파일
VERCEL_ENV_VARS.md
- Firebase API Key 노출
- 환경변수 설정 가이드 (비밀번호 등 언급)
```

**해결:**
```bash
# 1. .gitignore에 추가
echo "VERCEL_ENV_VARS.md" >> .gitignore

# 2. Git 추적에서 제거
git rm --cached VERCEL_ENV_VARS.md

# 3. 히스토리에서 완전 삭제
pip3 install git-filter-repo
git-filter-repo --path VERCEL_ENV_VARS.md --invert-paths --force

# 4. 원격 저장소에 강제 푸시
git remote add origin <URL>
git push --force origin main
```

### 2. Firestore 보안 규칙 설정
```javascript
// ❌ 기존: 모든 접근 허용
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tokens/{document} {
      allow read, write: if true;  // 누구나 접근 가능!
    }
  }
}

// ✅ 변경: 클라이언트 접근 차단
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tokens/{document} {
      allow read, write: if false;  // 클라이언트 차단
    }
    match /cafe24_tokens/{document} {
      allow read, write: if false;
    }
    match /cafe24_shops/{document} {
      allow read, write: if false;
    }
  }
}
```

---

## 마이그레이션 단계

### Step 1: Firebase Admin SDK 설치

```bash
npm install firebase-admin
```

### Step 2: Firebase Admin 모듈 생성

**파일: `lib/firebase-admin.ts`**

```typescript
import * as admin from 'firebase-admin';

// Private Key 파싱 함수
function parsePrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;

  let parsedKey = key.trim();
  // 따옴표 제거
  if ((parsedKey.startsWith('"') && parsedKey.endsWith('"')) ||
      (parsedKey.startsWith("'") && parsedKey.endsWith("'"))) {
    parsedKey = parsedKey.slice(1, -1);
  }

  // \n을 실제 개행 문자로 변환
  return parsedKey.replace(/\\n/g, '\n');
}

// Firebase Admin 초기화
if (!admin.apps.length) {
  const privateKey = parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL) {
    console.warn('⚠️ Firebase Admin 환경변수가 설정되지 않았습니다.');
    if (process.env.NODE_ENV === 'production' && process.env.VERCEL) {
      throw new Error('Firebase Admin credentials are not configured');
    }
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: "your-project-id",
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
      databaseURL: "https://your-project.firebaseio.com"
    });
    console.log('✅ Firebase Admin SDK 초기화 완료');
  }
}

// 안전한 Firestore 접근
const getDb = () => {
  if (!admin.apps.length) {
    throw new Error('Firebase Admin is not initialized.');
  }
  return admin.firestore();
};

const db = new Proxy({} as admin.firestore.Firestore, {
  get: (_target, prop) => {
    const firestore = getDb();
    return (firestore as any)[prop];
  }
});

// 토큰 관리 함수들
export interface Cafe24Token {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

export const saveToken = async (token: Cafe24Token): Promise<boolean> => {
  try {
    await db.collection('tokens').doc('cafe24').set(token);
    return true;
  } catch (error) {
    console.error('❌ Firestore 저장 에러:', error);
    return false;
  }
};

export const getToken = async (): Promise<Cafe24Token | null> => {
  try {
    const docSnap = await db.collection('tokens').doc('cafe24').get();
    if (docSnap.exists) {
      return docSnap.data() as Cafe24Token;
    }
    return null;
  } catch (error) {
    console.error('토큰 조회 에러:', error);
    return null;
  }
};

export const deleteToken = async (): Promise<boolean> => {
  try {
    await db.collection('tokens').doc('cafe24').delete();
    return true;
  } catch (error) {
    console.error('❌ 토큰 삭제 실패:', error);
    return false;
  }
};

export { db };
```

### Step 3: API 라우트 생성

**파일: `app/api/auth/status/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getToken } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const token = await getToken();

    if (token) {
      return NextResponse.json({
        authenticated: true,
        expiresAt: token.expires_at
      });
    }

    return NextResponse.json({ authenticated: false });
  } catch (error) {
    console.error('Auth status check error:', error);
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
```

**파일: `app/api/auth/logout/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { deleteToken } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const deleted = await deleteToken();

    if (deleted) {
      return NextResponse.json({
        success: true,
        message: '인증 정보가 삭제되었습니다.'
      });
    }

    return NextResponse.json({
      success: false,
      message: '인증 정보 삭제에 실패했습니다.'
    }, { status: 500 });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({
      success: false,
      message: '인증 정보 삭제 중 오류가 발생했습니다.'
    }, { status: 500 });
  }
}
```

### Step 4: 클라이언트 코드 수정

```typescript
// ❌ 기존 코드
import { getToken, deleteToken } from '@/lib/firebase';

const checkAuthStatus = async () => {
  const token = await getToken();  // 클라이언트에서 직접 호출
  if (token) {
    setIsAuthenticated(true);
  }
};

const handleReauth = async () => {
  await deleteToken();  // 클라이언트에서 직접 호출
};

// ✅ 변경 후
import axios from 'axios';

const checkAuthStatus = async () => {
  const response = await axios.get('/api/auth/status');  // API 통해 호출
  if (response.data.authenticated) {
    setIsAuthenticated(true);
  }
};

const handleReauth = async () => {
  await axios.post('/api/auth/logout');  // API 통해 호출
};
```

### Step 5: 기존 API 라우트 수정

```bash
# 모든 API 라우트에서 firebase → firebase-admin으로 변경
find app/api -name "*.ts" -type f -exec sed -i '' "s|from '@/lib/firebase'|from '@/lib/firebase-admin'|g" {} \;
```

### Step 6: 환경변수 설정

**Firebase Console에서 Service Account Key 발급:**

1. Firebase Console → Project Settings → Service Accounts
2. "Generate new private key" 클릭
3. JSON 파일 다운로드

**Vercel 환경변수 설정:**

```bash
# FIREBASE_CLIENT_EMAIL
firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# FIREBASE_PRIVATE_KEY (따옴표 제외하고 전체 복사)
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCB...
-----END PRIVATE KEY-----
```

**로컬 개발용 `.env.local`:**

```bash
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIB...\n-----END PRIVATE KEY-----\n"
```

---

## 발생한 에러 및 해결 방법

### 에러 1: PERMISSION_DENIED

```
7 PERMISSION_DENIED: Missing or insufficient permissions.
```

**원인:**
- Firestore 보안 규칙이 `allow read, write: if false;`로 설정됨
- 일부 코드가 여전히 클라이언트 Firebase SDK 사용

**해결:**
```typescript
// cafe24-api.ts에서 여전히 클라이언트 firebase import하고 있었음
import { getToken } from './firebase';  // ❌

// 수정
import { getToken } from './firebase-admin';  // ✅
```

### 에러 2: DECODER routines::unsupported

```
error:1E08010C:DECODER routines::unsupported
```

**원인:**
- Private Key의 개행 문자(\n)가 제대로 파싱되지 않음
- Vercel 환경변수에 따옴표가 포함되어 있음

**해결:**
```typescript
function parsePrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;

  let parsedKey = key.trim();

  // 따옴표 제거
  if ((parsedKey.startsWith('"') && parsedKey.endsWith('"')) ||
      (parsedKey.startsWith("'") && parsedKey.endsWith("'"))) {
    parsedKey = parsedKey.slice(1, -1);
  }

  // \n을 실제 개행 문자로 변환
  return parsedKey.replace(/\\n/g, '\n');
}
```

### 에러 3: Module not found: Can't resolve 'net'

```
Module not found: Can't resolve 'net'
Import trace:
./lib/firebase-admin.ts
./lib/cafe24-api.ts
./components/LoginForm.tsx
```

**원인:**
- Firebase Admin SDK는 Node.js 전용 (`net` 모듈 사용)
- 클라이언트 컴포넌트에서 import되면 번들링 시도

**해결 1: 조건부 import**

```typescript
// lib/cafe24-api.ts
import axios from 'axios';

// Cafe24Token 타입을 먼저 정의 (클라이언트/서버 공통)
export interface Cafe24Token {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

// 서버 사이드에서만 firebase-admin import
let getToken: any, saveToken: any, updateToken: any, isTokenExpired: any;

if (typeof window === 'undefined') {
  // 서버 사이드
  const firebaseAdmin = require('./firebase-admin');
  getToken = firebaseAdmin.getToken;
  saveToken = firebaseAdmin.saveToken;
  updateToken = firebaseAdmin.updateToken;
  isTokenExpired = firebaseAdmin.isTokenExpired;
} else {
  // 클라이언트 사이드 - 명확한 에러 메시지
  getToken = async () => {
    throw new Error('getToken은 서버에서만 사용 가능합니다');
  };
  saveToken = async () => {
    throw new Error('saveToken은 서버에서만 사용 가능합니다');
  };
  updateToken = async () => {
    throw new Error('updateToken은 서버에서만 사용 가능합니다');
  };
  isTokenExpired = () => {
    throw new Error('isTokenExpired는 서버에서만 사용 가능합니다');
  };
}
```

**해결 2: 클라이언트 전용 유틸리티 분리**

```typescript
// lib/cafe24-client.ts
const CAFE24_BASE_URL = `https://sopexkorea.cafe24api.com/api/v2`;

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.NEXT_PUBLIC_CAFE24_CLIENT_ID || '',
    state: Math.random().toString(36).substring(7),
    redirect_uri: process.env.NEXT_PUBLIC_CAFE24_REDIRECT_URI || '',
    scope: 'mall.read_product,mall.write_product,...',
  });

  return `${CAFE24_BASE_URL}/oauth/authorize?${params.toString()}`;
}
```

```typescript
// components/LoginForm.tsx
import { getAuthUrl } from '@/lib/cafe24-client';  // ✅

const handleLogin = () => {
  const authUrl = getAuthUrl();
  window.location.href = authUrl;
};
```

### 에러 4: Type Error - Cafe24Token

```
'Cafe24Token' refers to a value, but is being used as a type here.
```

**원인:**
- 조건부 import 시 타입이 제대로 export되지 않음

**해결:**
```typescript
// cafe24-api.ts에서 타입을 직접 정의
export interface Cafe24Token {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

// firebase-admin.ts의 Cafe24Token은 중복이지만 호환성 유지
```

### 에러 5: Type Compatibility

```
Type 'Cafe24Product' from cafe24-client is not assignable to
type 'Cafe24Product' from cafe24-api
```

**원인:**
- 두 파일에서 같은 이름의 타입을 다르게 정의

**해결:**
```typescript
// price-management/page.tsx
import type { Cafe24Product } from '@/lib/cafe24-api';  // ✅ 하나만 사용
```

---

## 최종 구조

### 파일 구조

```
lib/
├── firebase.ts              # 클라이언트 Firebase SDK (더 이상 사용 안 함)
├── firebase-admin.ts        # 서버 전용 Firebase Admin SDK
├── cafe24-api.ts            # 서버/클라이언트 공통 (조건부 import)
└── cafe24-client.ts         # 클라이언트 전용 유틸리티

app/api/
├── auth/
│   ├── status/route.ts     # 인증 상태 확인
│   ├── logout/route.ts     # 토큰 삭제
│   └── callback/route.ts   # OAuth 콜백
├── products/route.ts        # 상품 API (firebase-admin 사용)
└── orders/route.ts          # 주문 API (firebase-admin 사용)

components/
├── LoginForm.tsx           # cafe24-client 사용
└── ProductTable.tsx        # cafe24-api 사용 (타입만)

app/
├── price-management/page.tsx   # API 호출
└── order-management/page.tsx   # API 호출
```

### 데이터 흐름

```
[클라이언트]
    ↓ axios.get('/api/auth/status')
[API Route]
    ↓ getToken() from firebase-admin
[Firebase Admin SDK]
    ↓ Firestore Query
[Firestore Database]
```

### 보안 계층

```
클라이언트
    ↓ (차단)
Firestore Rules: allow read, write: if false
    ↓ (허용)
Firebase Admin SDK (서버 인증)
    ↓
Firestore Database
```

---

## 체크리스트

### 마이그레이션 전 체크

- [ ] Git 히스토리에 민감 정보가 있는지 확인
- [ ] 현재 Firestore 보안 규칙 확인
- [ ] 클라이언트에서 Firebase를 직접 사용하는 코드 파악
- [ ] Firebase Admin SDK 서비스 계정 키 발급

### 마이그레이션 중

- [ ] `npm install firebase-admin`
- [ ] `lib/firebase-admin.ts` 생성
- [ ] API 라우트 생성 (`/api/auth/status`, `/api/auth/logout`)
- [ ] 클라이언트 코드를 API 호출로 변경
- [ ] 기존 API 라우트에서 firebase → firebase-admin 변경
- [ ] 환경변수 설정 (Vercel, `.env.local`)

### 마이그레이션 후

- [ ] Firestore 보안 규칙 업데이트 (`allow read, write: if false`)
- [ ] 로컬에서 빌드 테스트
- [ ] Vercel 배포 및 빌드 성공 확인
- [ ] 인증 기능 테스트
- [ ] 재인증 기능 테스트
- [ ] 모든 CRUD 기능 테스트

### 보안 검증

- [ ] 브라우저 개발자 도구에서 Firestore API 호출 확인 (없어야 함)
- [ ] Firebase Console에서 직접 접근 시도 (차단되어야 함)
- [ ] Git 히스토리에 민감 정보 없는지 재확인
- [ ] 환경변수가 `.env.local`에만 있고 Git에 없는지 확인

---

## 참고 자료

- [Firebase Admin SDK 공식 문서](https://firebase.google.com/docs/admin/setup)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [git-filter-repo](https://github.com/newren/git-filter-repo)

---

## 요약

### Before (클라이언트 직접 접근)
```typescript
// 클라이언트
const token = await getToken();  // ⚠️ 브라우저에서 직접 Firestore 접근
```

### After (서버 API 경유)
```typescript
// 클라이언트
const response = await axios.get('/api/auth/status');  // ✅

// 서버 (API Route)
import { getToken } from '@/lib/firebase-admin';
const token = await getToken();  // ✅ 서버에서만 접근
```

### 주요 개선사항
1. ✅ 모든 민감한 데이터 처리가 서버로 이동
2. ✅ Firestore 보안 규칙으로 클라이언트 접근 완전 차단
3. ✅ Git 히스토리에서 민감 정보 완전 제거
4. ✅ 환경변수를 통한 안전한 인증 정보 관리
5. ✅ 기존 기능 100% 유지하면서 보안 강화

이 문서는 다른 프로젝트에서 유사한 마이그레이션을 진행할 때 참고 가이드로 사용할 수 있습니다.
