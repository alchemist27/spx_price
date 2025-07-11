# Cafe24 상품 관리자

카페24 쇼핑몰의 상품 정보를 조회하고 가격을 수정할 수 있는 관리자 웹 애플리케이션입니다.

## 주요 기능

- 🔐 Cafe24 OAuth 인증
- 📊 상품 목록 조회 및 테이블 표시
- ✏️ 상품 가격 실시간 수정
- 🔍 상품 검색 및 필터링
- 📥 엑셀 다운로드
- 🔄 자동 토큰 갱신 (Firebase 저장)

## 기술 스택

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Firebase Firestore (토큰 저장)
- **Deployment**: Vercel
- **Icons**: Lucide React
- **Notifications**: React Hot Toast

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`env.example` 파일을 복사하여 `.env.local` 파일을 생성하고 필요한 값들을 입력하세요:

```bash
cp env.example .env.local
```

#### Cafe24 API 설정
- `NEXT_PUBLIC_CAFE24_MALL_ID`: sopexkorea (소펙스코리아 쇼핑몰)
- `NEXT_PUBLIC_CAFE24_CLIENT_ID`: 카페24 앱 클라이언트 ID (발급 필요)
- `NEXT_PUBLIC_CAFE24_CLIENT_SECRET`: 카페24 앱 클라이언트 시크릿 (발급 필요)
- `NEXT_PUBLIC_CAFE24_REDIRECT_URI`: OAuth 리다이렉트 URI

#### Firebase 설정 (이미 구성됨)
- `NEXT_PUBLIC_FIREBASE_API_KEY`: AIzaSyDruR-6zx9lP26r8Omc1BzNa2inAKhPr54
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`: spx-price.firebaseapp.com
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: spx-price
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`: spx-price.firebasestorage.app
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`: 751338163184
- `NEXT_PUBLIC_FIREBASE_APP_ID`: 1:751338163184:web:6a86de741b4d8437c5ab35

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 애플리케이션을 확인하세요.

## 배포

### Vercel 배포

1. GitHub에 프로젝트를 푸시합니다.
2. [Vercel](https://vercel.com)에 로그인하고 새 프로젝트를 생성합니다.
3. GitHub 저장소를 연결합니다.
4. 환경 변수를 Vercel 대시보드에서 설정합니다.
5. 배포를 완료합니다.

### 환경 변수 설정 (Vercel)

Vercel 대시보드의 프로젝트 설정에서 다음 환경 변수들을 설정하세요:

- `NEXT_PUBLIC_CAFE24_CLIENT_ID`: 카페24 앱 클라이언트 ID
- `NEXT_PUBLIC_CAFE24_CLIENT_SECRET`: 카페24 앱 클라이언트 시크릿
- `NEXT_PUBLIC_CAFE24_REDIRECT_URI`: 배포된 도메인 (예: https://your-app.vercel.app)

Firebase 설정은 이미 코드에 포함되어 있습니다.

## 사용 방법

1. **로그인**: Cafe24 계정으로 OAuth 인증을 진행합니다.
2. **상품 조회**: 인증 후 자동으로 상품 목록이 로드됩니다.
3. **검색 및 필터링**: 상품명, 상품코드, 모델명으로 검색하거나 표시/판매 상태로 필터링할 수 있습니다.
4. **가격 수정**: 각 상품의 편집 버튼을 클릭하여 가격 정보를 수정할 수 있습니다.
5. **엑셀 다운로드**: 현재 필터링된 상품 목록을 엑셀 파일로 다운로드할 수 있습니다.

## 프로젝트 구조

```
├── app/                    # Next.js App Router
│   ├── globals.css        # 전역 스타일
│   ├── layout.tsx         # 루트 레이아웃
│   └── page.tsx           # 메인 페이지
├── components/            # React 컴포넌트
│   ├── LoginForm.tsx      # 로그인 폼
│   └── ProductTable.tsx   # 상품 테이블
├── lib/                   # 유틸리티 및 API
│   ├── firebase.ts        # Firebase 설정
│   └── cafe24-api.ts      # Cafe24 API 클라이언트
├── prd.md                 # 프로젝트 요구사항 문서
└── README.md              # 프로젝트 설명서
```

## 라이선스

MIT License 