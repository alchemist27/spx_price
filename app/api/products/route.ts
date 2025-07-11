import { NextRequest, NextResponse } from 'next/server';
import { getToken, isTokenExpired } from '@/lib/firebase';
import axios from 'axios';

const CAFE24_BASE_URL = `https://sopexkorea.cafe24api.com/api/v2`;

export async function GET(request: NextRequest) {
  try {
    console.log('📦 상품 목록 API 호출 시작');
    
    // 저장된 토큰 확인
    const token = await getToken();
    if (!token) {
      console.log('❌ 저장된 토큰 없음');
      return NextResponse.json(
        { error: 'No valid token available' },
        { status: 401 }
      );
    }

    // 토큰 만료 확인
    if (isTokenExpired(token)) {
      console.log('❌ 토큰 만료됨');
      return NextResponse.json(
        { error: 'Token expired' },
        { status: 401 }
      );
    }

    console.log('✅ 유효한 토큰으로 카페24 API 호출');
    
    // 카페24 API 호출
    const response = await axios.get(`${CAFE24_BASE_URL}/admin/products`, {
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        'X-Cafe24-Api-Version': '2025-06-01',
      },
    });

    console.log('✅ 카페24 API 응답 성공:', {
      status: response.status,
      productCount: response.data.products?.length || 0
    });

    return NextResponse.json(response.data);

  } catch (error) {
    console.error('❌ 상품 목록 API 에러:', error);
    
    if (axios.isAxiosError(error)) {
      console.error('API 에러 상세:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch products', 
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