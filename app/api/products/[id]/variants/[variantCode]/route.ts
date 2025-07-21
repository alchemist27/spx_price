import { NextRequest, NextResponse } from 'next/server';
import { getToken, isTokenExpired, saveToken, Cafe24Token } from '@/lib/firebase';
import axios from 'axios';

const CAFE24_BASE_URL = `https://sopexkorea.cafe24api.com/api/v2`;

// 토큰 갱신 함수
async function refreshToken(refreshTokenValue: string): Promise<Cafe24Token | null> {
  try {
    console.log('🔄 토큰 갱신 시도...');
    
    const response = await axios.post(
      `${CAFE24_BASE_URL}/oauth/token`,
      `grant_type=refresh_token&refresh_token=${refreshTokenValue}`,
      {
        headers: {
          'Authorization': `Basic ${btoa(`${process.env.NEXT_PUBLIC_CAFE24_CLIENT_ID || 'your_client_id'}:${process.env.NEXT_PUBLIC_CAFE24_CLIENT_SECRET || 'your_client_secret'}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const expiresIn = response.data.expires_in || 3600; // 기본값: 1시간
    const newToken: Cafe24Token = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || refreshTokenValue,
      expires_at: Date.now() + (expiresIn * 1000),
      token_type: response.data.token_type || 'Bearer',
    };

    console.log('✅ 토큰 갱신 성공, Firestore에 저장...');
    await saveToken(newToken);
    return newToken;
  } catch (error) {
    console.error('❌ 토큰 갱신 실패:', error);
    return null;
  }
}

// 유효한 토큰 얻기
async function getValidToken(): Promise<string | null> {
  const token = await getToken();
  if (!token) return null;

  if (isTokenExpired(token)) {
    console.log('🔄 토큰이 만료됨, 갱신 시도...');
    const refreshed = await refreshToken(token.refresh_token);
    if (!refreshed) return null;
    return refreshed.access_token;
  }

  return token.access_token;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; variantCode: string } }
) {
  try {
    const productId = params.id;
    const variantCode = params.variantCode;
    const variantData = await request.json();
    
    console.log('🔄 상품 Variant 업데이트 API 호출 시작:', { productId, variantCode });
    console.log('📝 Variant 데이터:', JSON.stringify(variantData, null, 2));
    
    // 유효한 토큰 확인 (만료 시 자동 갱신)
    const accessToken = await getValidToken();
    if (!accessToken) {
      console.log('❌ 유효한 토큰이 없음 (갱신 실패 포함)');
      return NextResponse.json(
        { error: 'No valid token available' },
        { status: 401 }
      );
    }

    console.log('✅ 유효한 토큰으로 카페24 Variant API 호출');
    
    // 카페24 API 호출
    const response = await axios.put(
      `${CAFE24_BASE_URL}/admin/products/${productId}/variants/${variantCode}`,
      {
        shop_no: 1,
        request: variantData
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Cafe24-Api-Version': '2025-06-01',
        },
      }
    );

    console.log('✅ 상품 Variant 업데이트 성공:', {
      status: response.status,
      productId,
      variantCode
    });

    return NextResponse.json(response.data);

  } catch (error) {
    console.error('❌ 상품 Variant 업데이트 API 에러:', error);
    
    if (axios.isAxiosError(error)) {
      console.error('API 에러 상세:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to update product variant', 
          details: error.response?.data || error.message 
        },
        { status: error.response?.status || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 