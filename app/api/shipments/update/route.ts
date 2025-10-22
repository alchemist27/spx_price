import { NextRequest, NextResponse } from 'next/server';
import { getToken } from '@/lib/firebase-admin';

// API 라우트에서는 NEXT_PUBLIC_ 접두사 없이 환경변수 사용
const CAFE24_MALL_ID = 'sopexkorea'; // 실제 mall ID 하드코딩
const CAFE24_BASE_URL = `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2`;

// 토큰 만료 확인
function isTokenExpired(token: any): boolean {
  if (!token || !token.expires_at) return true;
  return new Date(token.expires_at) < new Date();
}

// 토큰 갱신
async function refreshToken(refreshToken: string) {
  try {
    const response = await fetch(`${CAFE24_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_CAFE24_CLIENT_ID}:${process.env.NEXT_PUBLIC_CAFE24_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      console.error('토큰 갱신 실패');
      return null;
    }

    const data = await response.json();
    
    // Firebase에 새 토큰 저장
    const { saveToken } = await import('@/lib/firebase');
    await saveToken(data);
    
    return data;
  } catch (error) {
    console.error('토큰 갱신 오류:', error);
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
    return refreshed ? refreshed.access_token : null;
  }

  return token.access_token;
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { orders } = body; // Array of { order_id, shipping_code, status }

    console.log('🚚 배송 상태 변경 요청 받음');
    console.log('📦 처리할 주문:', orders);

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ 
        error: '처리할 주문이 없습니다.' 
      }, { status: 400 });
    }

    // 유효한 토큰 가져오기
    const accessToken = await getValidToken();
    if (!accessToken) {
      console.error('❌ 토큰 획득 실패');
      return NextResponse.json({ 
        error: '인증 토큰이 없습니다.' 
      }, { status: 401 });
    }

    console.log('✅ 토큰 획득 성공');

    // Cafe24 API 요청 payload 생성
    const payload = {
      shop_no: 1,
      requests: orders.map(order => ({
        shipping_code: order.shipping_code,
        order_id: order.order_id,
        status: order.status || 'shipped', // 기본값: shipped (배송완료)
        status_additional_info: null,
        tracking_no: null,
        shipping_company_code: null
      }))
    };

    console.log('📋 배송 상태 업데이트 요청 상세:');
    console.log('  - Order ID:', orders[0]?.order_id);
    console.log('  - Shipping Code:', orders[0]?.shipping_code);
    console.log('  - Target Status:', orders[0]?.status);
    console.log('📤 전체 Payload:', JSON.stringify(payload, null, 2));
    console.log('🔗 API URL:', `${CAFE24_BASE_URL}/admin/shipments`);

    // Cafe24 API 호출
    const response = await fetch(`${CAFE24_BASE_URL}/admin/shipments`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Cafe24-Api-Version': '2025-06-01'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ 배송 상태 업데이트 실패');
      console.error('  - Status Code:', response.status);
      console.error('  - Error Response:', data);
      return NextResponse.json({ 
        error: data.error?.message || '배송 상태 업데이트에 실패했습니다.',
        details: data
      }, { status: response.status });
    }

    console.log('✅ 배송 상태 업데이트 성공');
    console.log('  - 업데이트된 배송 건수:', data.shipments?.length || 0);
    console.log('  - Response:', data);

    return NextResponse.json({
      success: true,
      shipments: data.shipments,
      message: `${data.shipments?.length || 0}개 주문의 배송 상태가 업데이트되었습니다.`
    });

  } catch (error: any) {
    console.error('배송 상태 업데이트 오류 상세:', error);
    console.error('에러 타입:', error.constructor.name);
    console.error('에러 스택:', error.stack);
    
    return NextResponse.json({ 
      error: '배송 상태 업데이트 중 오류가 발생했습니다.',
      details: error.message,
      type: error.constructor.name
    }, { status: 500 });
  }
}