import { NextRequest, NextResponse } from 'next/server';
import { getToken, isTokenExpired, saveToken, Cafe24Token } from '@/lib/firebase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CAFE24_BASE_URL = `https://sopexkorea.cafe24api.com/api/v2`;

async function refreshToken(refreshTokenValue: string): Promise<Cafe24Token | null> {
  try {
    console.log('🔄 배송 상태 변경 API - 토큰 갱신 시도...');
    
    const response = await fetch(
      `https://sopexkorea.cafe24api.com/api/v2/oauth/token`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${process.env.NEXT_PUBLIC_CAFE24_CLIENT_ID || 'your_client_id'}:${process.env.NEXT_PUBLIC_CAFE24_CLIENT_SECRET || 'your_client_secret'}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `grant_type=refresh_token&refresh_token=${refreshTokenValue}`
      }
    );

    const data = await response.json();
    const expiresIn = data.expires_in || 3600;
    const newToken: Cafe24Token = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshTokenValue,
      expires_at: Date.now() + (expiresIn * 1000),
      token_type: data.token_type || 'Bearer',
    };

    console.log('✅ 배송 상태 변경 API - 토큰 갱신 성공');
    await saveToken(newToken);
    return newToken;
  } catch (error) {
    console.error('❌ 배송 상태 변경 API - 토큰 갱신 실패:', error);
    return null;
  }
}

async function getValidToken(): Promise<string | null> {
  const token = await getToken();
  if (!token) return null;

  if (isTokenExpired(token)) {
    console.log('🔄 배송 상태 변경 API - 토큰이 만료됨, 갱신 시도...');
    const refreshed = await refreshToken(token.refresh_token);
    return refreshed ? refreshed.access_token : null;
  }

  return token.access_token;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { orderId: string; shippingCode: string } }
) {
  try {
    const { orderId, shippingCode } = params;
    const body = await request.json();
    const { status = 'shipping', status_additional_info } = body;

    console.log('📨 배송 상태 변경 요청:', {
      orderId,
      shippingCode,
      status,
      status_additional_info
    });

    const accessToken = await getValidToken();
    if (!accessToken) {
      return NextResponse.json({ error: '인증 토큰이 없습니다.' }, { status: 401 });
    }

    // 카페24 공식 API: 배송 상태 수정
    const apiUrl = `${CAFE24_BASE_URL}/admin/orders/${orderId}/shipments/${shippingCode}`;
    console.log('📝 배송 상태 변경 API 호출:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Cafe24-Api-Version': '2025-06-01'
      },
      body: JSON.stringify({
        shop_no: 1,
        request: {
          status,
          status_additional_info: status_additional_info || null,
          tracking_no: null,
          shipping_company_code: null
        }
      })
    });

    let data;
    const responseText = await response.text();
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('배송 상태 변경 응답 파싱 실패:', responseText);
      return NextResponse.json({ 
        error: '배송 상태 변경 API 응답을 파싱할 수 없습니다.',
        details: responseText
      }, { status: 500 });
    }

    if (!response.ok) {
      console.error('❌ 배송 상태 변경 실패');
      console.error('  Status Code:', response.status);
      console.error('  Response:', data);
      
      return NextResponse.json({ 
        error: data.error?.message || '배송 상태 변경에 실패했습니다.',
        details: data,
        statusCode: response.status
      }, { status: response.status });
    }

    console.log('✅ 배송 상태 변경 성공:', data);

    return NextResponse.json({ 
      success: true,
      shipment: data.shipment,
      message: `주문 ${orderId}의 배송 상태가 ${status}로 변경되었습니다.`
    });

  } catch (error) {
    console.error('배송 상태 변경 오류:', error);
    
    if (error instanceof Error) {
      console.error('에러 메시지:', error.message);
      console.error('에러 스택:', error.stack);
    }
    
    return NextResponse.json({ 
      error: '배송 상태 변경 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : '알 수 없는 오류'
    }, { status: 500 });
  }
}