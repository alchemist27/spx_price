import { NextRequest, NextResponse } from 'next/server';
import { getToken, isTokenExpired, saveToken, Cafe24Token } from '@/lib/firebase';
import axios from 'axios';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CAFE24_BASE_URL = `https://sopexkorea.cafe24api.com/api/v2`;

async function refreshToken(refreshTokenValue: string): Promise<Cafe24Token | null> {
  try {
    console.log('🔄 배송 일괄 등록 API - 토큰 갱신 시도...');
    
    const response = await axios.post(
      `https://sopexkorea.cafe24api.com/api/v2/oauth/token`,
      `grant_type=refresh_token&refresh_token=${refreshTokenValue}`,
      {
        headers: {
          'Authorization': `Basic ${btoa(`${process.env.NEXT_PUBLIC_CAFE24_CLIENT_ID || 'your_client_id'}:${process.env.NEXT_PUBLIC_CAFE24_CLIENT_SECRET || 'your_client_secret'}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const expiresIn = response.data.expires_in || 3600;
    const newToken: Cafe24Token = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || refreshTokenValue,
      expires_at: Date.now() + (expiresIn * 1000),
      token_type: response.data.token_type || 'Bearer',
    };

    console.log('✅ 배송 일괄 등록 API - 토큰 갱신 성공');
    await saveToken(newToken);
    return newToken;
  } catch (error) {
    console.error('❌ 배송 일괄 등록 API - 토큰 갱신 실패:', error);
    return null;
  }
}

async function getValidToken(): Promise<string | null> {
  const token = await getToken();
  if (!token) return null;

  if (isTokenExpired(token)) {
    console.log('🔄 배송 일괄 등록 API - 토큰이 만료됨, 갱신 시도...');
    const refreshed = await refreshToken(token.refresh_token);
    return refreshed ? refreshed.access_token : null;
  }

  return token.access_token;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orders } = body;

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json(
        { error: '주문 목록이 필요합니다.' },
        { status: 400 }
      );
    }

    // 최대 100개씩 처리
    if (orders.length > 100) {
      return NextResponse.json(
        { error: '한 번에 최대 100개의 주문만 처리할 수 있습니다.' },
        { status: 400 }
      );
    }

    const accessToken = await getValidToken();
    if (!accessToken) {
      return NextResponse.json({ error: '인증 토큰이 없습니다.' }, { status: 401 });
    }

    // 대량 송장 등록 API 호출
    const apiUrl = `${CAFE24_BASE_URL}/admin/shipments`;
    console.log('대량 송장 등록 API 호출:', apiUrl);
    console.log('등록할 주문 수:', orders.length);

    const shipments = orders.map(order => ({
      order_id: order.order_id,
      tracking_no: order.tracking_no,
      shipping_company_code: order.shipping_company_code || '0003', // 한진택배가 기본
      status: order.status || 'standby'
    }));

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Cafe24-Api-Version': '2025-06-01'
      },
      body: JSON.stringify({
        shop_no: 1,
        request: {
          shipments
        }
      })
    });

    let data;
    const responseText = await response.text();
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('대량 송장 등록 응답 파싱 실패:', responseText);
      return NextResponse.json({ 
        error: '대량 송장 등록 API 응답을 파싱할 수 없습니다.',
        details: responseText
      }, { status: 500 });
    }

    if (!response.ok) {
      console.error('대량 송장 등록 실패:', data);
      
      // 송장번호 형식 오류 처리
      if (response.status === 422) {
        return NextResponse.json(
          { 
            error: '일부 송장번호 형식이 올바르지 않습니다.',
            details: data.error?.details || data
          },
          { status: 422 }
        );
      }
      
      return NextResponse.json(
        { 
          error: data.error?.message || '대량 송장 등록 실패',
          details: data
        },
        { status: response.status }
      );
    }

    // 성공/실패 결과 분석
    const result = {
      success: true,
      total: orders.length,
      succeeded: data.shipments?.length || 0,
      failed: [],
      shipments: data.shipments || []
    };

    // 실패한 주문 확인
    if (data.failed_orders) {
      result.failed = data.failed_orders;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('대량 송장 등록 오류:', error);
    return NextResponse.json(
      { error: '대량 송장 등록 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}