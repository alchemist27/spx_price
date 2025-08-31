import { NextRequest, NextResponse } from 'next/server';
import { getToken, isTokenExpired, saveToken, Cafe24Token } from '@/lib/firebase';
import axios from 'axios';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CAFE24_BASE_URL = `https://sopexkorea.cafe24api.com/api/v2`;

async function refreshToken(refreshTokenValue: string): Promise<Cafe24Token | null> {
  try {
    console.log('🔄 배송 정보 API - 토큰 갱신 시도...');
    
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

    console.log('✅ 배송 정보 API - 토큰 갱신 성공');
    await saveToken(newToken);
    return newToken;
  } catch (error) {
    console.error('❌ 배송 정보 API - 토큰 갱신 실패:', error);
    return null;
  }
}

async function getValidToken(): Promise<string | null> {
  const token = await getToken();
  if (!token) return null;

  if (isTokenExpired(token)) {
    console.log('🔄 배송 정보 API - 토큰이 만료됨, 갱신 시도...');
    const refreshed = await refreshToken(token.refresh_token);
    return refreshed ? refreshed.access_token : null;
  }

  return token.access_token;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const orderId = params.orderId;
    
    const accessToken = await getValidToken();
    if (!accessToken) {
      return NextResponse.json({ error: '인증 토큰이 없습니다.' }, { status: 401 });
    }

    const apiUrl = `${CAFE24_BASE_URL}/admin/orders/${orderId}/shipments`;
    console.log('배송 정보 조회 API 호출:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Cafe24-Api-Version': '2025-06-01'
      },
    });

    let data;
    const responseText = await response.text();
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('배송 정보 응답 파싱 실패:', responseText);
      return NextResponse.json({ 
        error: '배송 정보 API 응답을 파싱할 수 없습니다.',
        details: responseText,
        url: apiUrl
      }, { status: 500 });
    }

    if (!response.ok) {
      console.error('배송 정보 조회 실패:', data);
      console.error('요청 URL:', apiUrl);
      return NextResponse.json({ 
        error: data.error?.message || '배송 정보 조회에 실패했습니다.',
        details: data,
        statusCode: response.status,
        url: apiUrl
      }, { status: response.status });
    }

    // 배송 정보 정리
    const shipments = data.shipments?.map((shipment: any) => ({
      shop_no: shipment.shop_no,
      shipping_code: shipment.shipping_code,
      order_id: shipment.order_id,
      tracking_no: shipment.tracking_no,
      tracking_no_updated_date: shipment.tracking_no_updated_date,
      shipping_company_code: shipment.shipping_company_code,
      shipping_company_name: getShippingCompanyName(shipment.shipping_company_code),
      items: shipment.items?.map((item: any) => ({
        order_item_code: item.order_item_code,
        status: item.status
      })) || []
    })) || [];

    return NextResponse.json({ 
      shipments,
      count: shipments.length
    });

  } catch (error) {
    console.error('배송 정보 조회 오류:', error);
    
    if (error instanceof Error) {
      console.error('에러 메시지:', error.message);
      console.error('에러 스택:', error.stack);
    }
    
    return NextResponse.json({ 
      error: '배송 정보 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : '알 수 없는 오류',
      errorType: error instanceof Error ? error.name : 'Unknown'
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const orderId = params.orderId;
    const body = await request.json();
    const { tracking_no, shipping_company_code = '0003', status = 'standby' } = body;

    if (!tracking_no) {
      return NextResponse.json(
        { error: '송장번호는 필수입니다.' },
        { status: 400 }
      );
    }

    const accessToken = await getValidToken();
    if (!accessToken) {
      return NextResponse.json({ error: '인증 토큰이 없습니다.' }, { status: 401 });
    }

    // 먼저 기존 배송 정보 확인
    const checkUrl = `${CAFE24_BASE_URL}/admin/orders/${orderId}/shipments`;
    const checkResponse = await fetch(checkUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Cafe24-Api-Version': '2025-06-01'
      }
    });

    if (checkResponse.ok) {
      const checkData = await checkResponse.json();
      
      // 이미 등록된 송장번호가 있는지 확인
      if (checkData.shipments && checkData.shipments.length > 0) {
        const existingShipment = checkData.shipments.find(
          (s: any) => s.tracking_no === tracking_no
        );
        
        if (existingShipment) {
          return NextResponse.json(
            { error: '이미 등록된 송장번호입니다.' },
            { status: 409 }
          );
        }
      }
    }

    // 송장 등록
    const apiUrl = `${CAFE24_BASE_URL}/admin/orders/${orderId}/shipments`;
    console.log('송장 등록 API 호출:', apiUrl);

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
          tracking_no,
          shipping_company_code,
          status
        }
      })
    });

    let data;
    const responseText = await response.text();
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('송장 등록 응답 파싱 실패:', responseText);
      return NextResponse.json({ 
        error: '송장 등록 API 응답을 파싱할 수 없습니다.',
        details: responseText
      }, { status: 500 });
    }

    if (!response.ok) {
      console.error('송장 등록 실패:', data);
      
      // 송장번호 형식 오류 처리
      if (response.status === 422) {
        return NextResponse.json(
          { error: '송장번호 형식이 올바르지 않습니다.' },
          { status: 422 }
        );
      }
      
      return NextResponse.json(
        { error: data.error?.message || '송장 등록 실패' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      shipment: data.shipment
    });
  } catch (error) {
    console.error('송장 등록 오류:', error);
    return NextResponse.json(
      { error: '송장 등록 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 배송업체 코드를 이름으로 변환
function getShippingCompanyName(code: string): string {
  const companyMap: Record<string, string> = {
    '0001': 'CJ대한통운',
    '0002': '로젠택배',
    '0003': '한진택배',
    '0004': '우체국택배',
    '0005': 'KG로지스',
    '0006': '대신택배',
    '0007': 'GTX로지스',
    '0008': '롯데택배',
    '0009': 'GSPostbox택배',
    '0010': '일양로지스',
    '0011': 'EMS',
    '0012': 'DHL',
    '0013': 'FedEx',
    '0014': 'UPS',
    '0015': 'TNT',
    '0016': '경동택배',
    '0017': 'CVSnet편의점택배',
    '0018': 'CJGLS',
    '0019': '한의사랑택배',
    '0020': '천일택배',
    '0021': '건영택배',
    '0022': '애경택배'
  };
  return companyMap[code] || `배송업체(${code})`;
}