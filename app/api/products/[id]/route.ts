import { NextRequest, NextResponse } from 'next/server';
import { getToken, isTokenExpired } from '@/lib/firebase';
import axios from 'axios';

const CAFE24_BASE_URL = `https://sopexkorea.cafe24api.com/api/v2`;

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const productId = params.id;
    const updateData = await request.json();
    
    console.log('🔄 상품 업데이트 API 호출 시작:', { productId });
    
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
    const response = await axios.put(
      `${CAFE24_BASE_URL}/admin/products/${productId}`,
      {
        shop_no: 1,
        request: updateData,
      },
      {
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': 'application/json',
          'X-Cafe24-Api-Version': '2025-06-01',
        },
      }
    );

    console.log('✅ 상품 업데이트 성공:', {
      status: response.status,
      productId
    });

    return NextResponse.json(response.data);

  } catch (error) {
    console.error('❌ 상품 업데이트 API 에러:', error);
    
    if (axios.isAxiosError(error)) {
      console.error('API 에러 상세:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to update product', 
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