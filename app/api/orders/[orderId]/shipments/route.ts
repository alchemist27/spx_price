import { NextRequest, NextResponse } from 'next/server';
import { getToken, isTokenExpired, saveToken, Cafe24Token } from '@/lib/firebase-admin';
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
    let { tracking_no, shipping_company_code = '0018', status = 'standby' } = body;

    console.log('📨 송장 등록 요청 받음:', {
      orderId,
      original_tracking_no: tracking_no,
      shipping_company_code,
      status
    });

    if (!tracking_no) {
      return NextResponse.json(
        { error: '송장번호는 필수입니다.' },
        { status: 400 }
      );
    }

    // 송장번호 형식 정리 (공백, 하이픈, 특수문자 제거)
    tracking_no = tracking_no.toString().replace(/[\s\-\._]/g, '').trim();
    
    console.log('🔄 송장번호 정리:', {
      before: body.tracking_no,
      after: tracking_no,
      length: tracking_no.length
    });
    
    // 송장번호 길이 검증 (더 유연하게 - 대부분 택배사는 10-20자리)
    if (tracking_no.length < 8 || tracking_no.length > 25) {
      console.error('❌ 송장번호 형식 오류:', {
        original: body.tracking_no,
        cleaned: tracking_no,
        length: tracking_no.length
      });
      return NextResponse.json(
        { 
          error: `송장번호 형식이 올바르지 않습니다. (길이: ${tracking_no.length}자리)`,
          details: {
            original: body.tracking_no,
            cleaned: tracking_no,
            expected: '8-25자리 숫자',
            received_length: tracking_no.length
          }
        },
        { status: 422 }
      );
    }

    // 숫자만 포함되어 있는지 확인
    if (!/^\d+$/.test(tracking_no)) {
      console.error('❌ 송장번호에 숫자 외 문자 포함:', tracking_no);
      return NextResponse.json(
        { 
          error: '송장번호는 숫자만 포함해야 합니다.',
          details: {
            tracking_no,
            invalid_chars: tracking_no.replace(/\d/g, '')
          }
        },
        { status: 422 }
      );
    }

    console.log('📋 송장번호 검증 통과:', {
      orderId,
      tracking_no,
      shipping_company_code,
      status
    });

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
    console.log('📝 송장 등록 API 호출:', apiUrl);
    console.log('📌 요청 데이터:', {
      tracking_no,
      shipping_company_code,
      status
    });

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
      console.error('❌ 송장 등록 실패');
      console.error('  Status Code:', response.status);
      console.error('  Response:', data);
      console.error('  Request Body:', {
        tracking_no,
        shipping_company_code,
        status
      });
      
      // 송장번호 형식 오류 처리
      if (response.status === 422) {
        const errorDetail = data.error?.message || '송장번호 형식이 올바르지 않습니다.';
        console.error('  Cafe24 Error Detail:', errorDetail);
        return NextResponse.json(
          { 
            error: errorDetail,
            cafe24_error: data.error,
            tracking_no_info: {
              original: body.tracking_no,
              cleaned: tracking_no,
              length: tracking_no.length
            }
          },
          { status: 422 }
        );
      }
      
      return NextResponse.json(
        { 
          error: data.error?.message || '송장 등록 실패',
          details: data
        },
        { status: response.status }
      );
    }

    console.log('✅ 송장 등록 성공:', data);
    
    // shipping_code가 없으면 조회해서 가져오기
    let shippingCode = data.shipment?.shipping_code;
    
    if (!shippingCode && data.shipment) {
      console.log('⚠️ shipping_code가 응답에 없음, 조회 시도...');
      // 등록 후 즉시 조회하여 shipping_code 가져오기
      const getShipmentsUrl = `${CAFE24_BASE_URL}/admin/orders/${orderId}/shipments`;
      const getResponse = await fetch(getShipmentsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Cafe24-Api-Version': '2025-06-01'
        }
      });
      
      if (getResponse.ok) {
        const getResult = await getResponse.json();
        // 방금 등록한 송장번호와 일치하는 shipment 찾기
        const matchedShipment = getResult.shipments?.find(
          (s: any) => s.tracking_no === tracking_no
        );
        if (matchedShipment) {
          shippingCode = matchedShipment.shipping_code;
          console.log('✅ shipping_code 조회 성공:', shippingCode);
        }
      }
    }

    return NextResponse.json({
      success: true,
      shipment: {
        ...data.shipment,
        shipping_code: shippingCode // 확실히 shipping_code 포함
      }
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
    '0003': '우체국택배',
    '0004': 'KG로지스',
    '0005': '대신택배',
    '0006': 'GTX로지스',
    '0007': '롯데택배',
    '0008': 'GSPostbox택배',
    '0009': '일양로지스',
    '0010': 'EMS',
    '0011': 'DHL',
    '0012': 'FedEx',
    '0013': 'UPS',
    '0014': 'TNT',
    '0015': '경동택배',
    '0016': 'CVSnet편의점택배',
    '0017': 'CJGLS',
    '0018': '한진택배',  // 한진택배 코드 수정
    '0019': '한의사랑택배',
    '0020': '천일택배',
    '0021': '건영택배',
    '0022': '애경택배'
  };
  return companyMap[code] || `배송업체(${code})`;
}