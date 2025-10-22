# Vercel 환경변수 설정 가이드

## 필요한 환경변수 목록

### 1. Cafe24 API 설정 (필수)
```
NEXT_PUBLIC_CAFE24_MALL_ID=sopexkorea
NEXT_PUBLIC_CAFE24_CLIENT_ID=카페24_앱_클라이언트_ID
NEXT_PUBLIC_CAFE24_CLIENT_SECRET=카페24_앱_클라이언트_시크릿
NEXT_PUBLIC_CAFE24_REDIRECT_URI=https://spx-price.vercel.app/api/auth/callback
```

### 2. Firebase 설정 (선택 - 현재 하드코딩됨)
현재 Firebase 설정이 코드에 하드코딩되어 있어서 환경변수로 설정할 필요가 없습니다.

만약 환경변수로 관리하고 싶다면:
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDruR-6zx9lP26r8Omc1BzNa2inAKhPr54
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=spx-price.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=spx-price
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=spx-price.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=751338163184
NEXT_PUBLIC_FIREBASE_APP_ID=1:751338163184:web:6a86de741b4d8437c5ab35
```

## Vercel 대시보드에서 설정 방법

1. [Vercel 대시보드](https://vercel.com/neuron-architecture/spx-price) 접속
2. **Settings** 탭 클릭
3. **Environment Variables** 섹션으로 이동
4. **Add New** 버튼 클릭
5. 다음 변수들을 추가:

### Production 환경에 추가할 변수들:

| Variable Name | Value | Environment |
|---------------|-------|-------------|
| `NEXT_PUBLIC_CAFE24_MALL_ID` | `sopexkorea` | Production |
| `NEXT_PUBLIC_CAFE24_CLIENT_ID` | 카페24에서 발급받은 클라이언트 ID | Production |
| `NEXT_PUBLIC_CAFE24_CLIENT_SECRET` | 카페24에서 발급받은 클라이언트 시크릿 | Production |
| `NEXT_PUBLIC_CAFE24_REDIRECT_URI` | `https://spx-price.vercel.app/api/auth/callback` | Production |
| `ADMIN_USERNAME` | 관리자 아이디 (예: sopex_admin) | Production |
| `ADMIN_PASSWORD` | 관리자 비밀번호 | Production |

## 주의사항

1. **NEXT_PUBLIC_** 접두사가 붙은 변수들은 클라이언트 사이드에서 접근 가능합니다.
2. **Client Secret**은 절대 공개되지 않도록 주의하세요.
3. 환경변수 설정 후 **재배포**가 필요합니다.
4. **Production** 환경에만 설정하면 됩니다 (Preview/Development는 선택사항).

## 테스트 방법

1. 환경변수 설정 후 재배포
2. https://spx-price.vercel.app 접속
3. "Cafe24로 로그인" 버튼 클릭
4. OAuth 인증 플로우 테스트

## 현재 하드코딩된 값들

- **Cafe24 Mall ID**: `sopexkorea` (소펙스코리아)
- **Firebase 설정**: 모든 값이 `lib/firebase.ts`에 하드코딩됨
- **API 버전**: `2025-06-01` (최신 버전) 