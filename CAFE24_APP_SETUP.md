# 카페24 앱 등록 가이드

## 배포된 애플리케이션 정보

- **프로덕션 URL**: https://spx-price.vercel.app
- **GitHub 저장소**: https://github.com/alchemist27/spx_price.git

## 카페24 개발자 센터 앱 등록

### 1. 앱 기본 정보
- **앱 이름**: SPX Price Manager
- **앱 설명**: 소펙스코리아 쇼핑몰 상품 가격 관리 시스템
- **앱 URL**: https://spx-price.vercel.app

### 2. OAuth 설정
- **Redirect URI**: https://spx-price.vercel.app/api/auth/callback
- **Scope**: 
  - `mall.read_product` (상품 조회 권한)
  - `mall.write_product` (상품 수정 권한)

### 3. 필요한 권한
- 상품 목록 조회
- 상품 정보 수정 (가격, 표시 여부, 판매 여부)

## 발급받을 정보

카페24 개발자 센터에서 앱 등록 후 다음 정보를 발급받으세요:

1. **Client ID**: 앱의 고유 식별자
2. **Client Secret**: 앱의 비밀키

## 환경 변수 설정

발급받은 정보를 Vercel 대시보드에서 환경 변수로 설정하세요:

1. [Vercel 대시보드](https://vercel.com/neuron-architecture/spx-price) 접속
2. Settings → Environment Variables
3. 다음 변수들을 추가:

```
NEXT_PUBLIC_CAFE24_CLIENT_ID=발급받은_클라이언트_ID
NEXT_PUBLIC_CAFE24_CLIENT_SECRET=발급받은_클라이언트_시크릿
NEXT_PUBLIC_CAFE24_REDIRECT_URI=https://spx-price.vercel.app/api/auth/callback
```

## 테스트 방법

1. 환경 변수 설정 후 애플리케이션 재배포
2. https://spx-price.vercel.app 접속
3. "Cafe24로 로그인" 버튼 클릭
4. OAuth 인증 진행
5. 상품 목록 확인 및 가격 수정 테스트

## 주의사항

- Client Secret은 절대 공개되지 않도록 주의하세요
- Redirect URI는 정확히 일치해야 합니다
- 프로덕션 환경에서는 HTTPS가 필수입니다 