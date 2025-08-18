import { NextRequest, NextResponse } from 'next/server';
import { getToken, isTokenExpired, saveToken, Cafe24Token } from '@/lib/firebase';
import axios from 'axios';

// API 라우트를 동적으로 설정
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Cafe24 Base URL (상품 API와 동일하게 하드코딩)
const CAFE24_BASE_URL = `https://sopexkorea.cafe24api.com/api/v2`;

// 토큰 갱신 함수 (상품 API와 동일)
async function refreshToken(refreshTokenValue: string): Promise<Cafe24Token | null> {
  try {
    console.log('🔄 주문 API - 토큰 갱신 시도...');
    
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

    console.log('✅ 주문 API - 토큰 갱신 성공');
    await saveToken(newToken);
    return newToken;
  } catch (error) {
    console.error('❌ 주문 API - 토큰 갱신 실패:', error);
    return null;
  }
}

// 유효한 토큰 얻기
async function getValidToken(): Promise<string | null> {
  const token = await getToken();
  if (!token) return null;

  if (isTokenExpired(token)) {
    console.log('🔄 주문 API - 토큰이 만료됨, 갱신 시도...');
    const refreshed = await refreshToken(token.refresh_token);
    return refreshed ? refreshed.access_token : null;
  }

  return token.access_token;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('start_date') || '';
    const endDate = searchParams.get('end_date') || '';
    const limit = searchParams.get('limit') || '500';
    const offset = searchParams.get('offset') || '0';
    const orderStatus = searchParams.get('order_status') || '';
    
    // 유효한 토큰 가져오기 (만료시 자동 갱신)
    const accessToken = await getValidToken();
    if (!accessToken) {
      return NextResponse.json({ error: '인증 토큰이 없습니다.' }, { status: 401 });
    }

    // Cafe24 API URL 구성 (상품 API와 동일한 방식)
    let apiUrl = `${CAFE24_BASE_URL}/admin/orders?limit=${limit}&offset=${offset}`;
    
    // 날짜 필터 추가 (T00:00:00 형식 추가)
    if (startDate) {
      // YYYY-MM-DD 형식을 YYYY-MM-DDTHH:MM:SS+09:00 형식으로 변환
      const formattedStartDate = startDate.includes('T') ? startDate : `${startDate}T00:00:00+09:00`;
      apiUrl += `&start_date=${encodeURIComponent(formattedStartDate)}`;
    }
    if (endDate) {
      // 종료일은 23:59:59로 설정
      const formattedEndDate = endDate.includes('T') ? endDate : `${endDate}T23:59:59+09:00`;
      apiUrl += `&end_date=${encodeURIComponent(formattedEndDate)}`;
    }
    
    // 주문 상태 필터 추가
    if (orderStatus) {
      apiUrl += `&order_status=${orderStatus}`;
    }

    // 배송정보 포함
    apiUrl += '&embed=receivers,items,buyers,cancellation';

    console.log('주문 조회 API 호출:', apiUrl);

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
      console.error('응답 파싱 실패:', responseText);
      return NextResponse.json({ 
        error: 'API 응답을 파싱할 수 없습니다.',
        details: responseText,
        url: apiUrl
      }, { status: 500 });
    }

    if (!response.ok) {
      console.error('주문 조회 실패:', data);
      console.error('요청 URL:', apiUrl);
      return NextResponse.json({ 
        error: data.error?.message || '주문 조회에 실패했습니다.',
        details: data,
        statusCode: response.status,
        url: apiUrl
      }, { status: response.status });
    }

    // 주문 데이터 정리
    const orders = data.orders?.map((order: any) => ({
      order_id: order.order_id,
      order_date: order.order_date,
      payment_date: order.payment_date,
      
      // 주문 상태 (paid, canceled 필드로 판단)
      paid: order.paid === 'T',
      canceled: order.canceled === 'T',
      order_status: getOrderStatus(order),
      order_status_text: getOrderStatusText(getOrderStatus(order)),
      
      // 결제 정보
      payment_amount: order.payment_amount || order.actual_order_amount?.payment_amount || '0',
      actual_payment: order.actual_order_amount?.payment_amount || '0',
      order_price_amount: order.actual_order_amount?.order_price_amount || '0',
      shipping_fee: order.actual_order_amount?.shipping_fee || '0',
      currency: order.currency || 'KRW',
      payment_method: order.payment_method_name?.join(', ') || '',
      
      // 구매자 정보
      member_id: order.member_id || '',
      member_email: order.member_email || '',
      billing_name: order.billing_name || '',
      
      // buyers 배열이 있는 경우
      buyer_name: order.buyers?.[0]?.name || order.billing_name || '',
      buyer_phone: order.buyers?.[0]?.phone || order.buyers?.[0]?.cellphone || '',
      buyer_email: order.buyers?.[0]?.email || order.member_email || '',
      
      // 수령자 정보 (receivers 배열에서)
      receiver_name: order.receivers?.[0]?.name || '',
      receiver_phone: order.receivers?.[0]?.phone || order.receivers?.[0]?.cellphone || '',
      receiver_address: `${order.receivers?.[0]?.address1 || ''} ${order.receivers?.[0]?.address2 || ''}`.trim() || 
                       order.receivers?.[0]?.address_full || '',
      receiver_zipcode: order.receivers?.[0]?.zipcode || '',
      shipping_message: order.receivers?.[0]?.shipping_message || '',
      
      // 배송 정보
      shipping_status: order.shipping_status || '',
      shipping_status_text: getShippingStatusText(order.shipping_status),
      shipping_company: order.receivers?.[0]?.shipping_company || '',
      shipping_company_name: order.receivers?.[0]?.shipping_company_name || '',
      tracking_no: order.receivers?.[0]?.tracking_no || '',
      shipping_type: order.shipping_type || '',
      shipping_type_text: order.shipping_type_text || '',
      
      // 주문 출처 정보
      order_place_name: order.order_place_name || '',
      order_place_id: order.order_place_id || '',
      market_id: order.market_id || '',
      
      // 기타 정보
      first_order: order.first_order === 'T',
      order_from_mobile: order.order_from_mobile === 'T',
      use_escrow: order.use_escrow === 'T',
      
      // 주문 상품 정보
      items: order.items?.map((item: any) => ({
        item_no: item.item_no || item.order_item_code,
        product_no: item.product_no,
        product_code: item.product_code || '',
        product_name: item.product_name,
        product_name_english: item.product_name_english || '',
        option_value: item.option_value || '',
        quantity: item.quantity,
        product_price: item.product_price || item.item_price || '0',
        option_price: item.option_price || '0',
        additional_discount_price: item.additional_discount_price || '0',
        supplier_product_name: item.supplier_product_name || '',
        product_bundle: item.product_bundle === 'T',
        product_bundle_name: item.product_bundle_name || '',
        
        // 배송 상태
        shipping_status: item.shipping_status || '',
        shipping_status_text: getShippingStatusText(item.shipping_status),
        
        // 처리 상태 코드들
        order_status: item.order_status || '',
        claim_status: item.claim_status || '',
        claim_type: item.claim_type || ''
      })) || [],
      
      // 배송비 상세
      shipping_fee_detail: order.shipping_fee_detail || [],
      regional_surcharge_detail: order.regional_surcharge_detail || [],
      
      // 세금 정보
      tax_detail: order.tax_detail || [],
      
      // 추가 주문 정보
      additional_order_info_list: order.additional_order_info_list || []
    })) || [];

    // has_next 판단을 위한 links 확인
    const hasNext = data.links?.some((link: any) => link.rel === 'next') || false;

    return NextResponse.json({ 
      orders,
      count: data.count || orders.length,
      has_next: hasNext
    });

  } catch (error) {
    console.error('주문 조회 오류:', error);
    
    // 더 자세한 에러 정보 로깅
    if (error instanceof Error) {
      console.error('에러 메시지:', error.message);
      console.error('에러 스택:', error.stack);
    }
    
    return NextResponse.json({ 
      error: '주문 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : '알 수 없는 오류',
      errorType: error instanceof Error ? error.name : 'Unknown'
    }, { status: 500 });
  }
}

// 주문 상태 판단 (paid, canceled, shipping_status 필드 기반)
function getOrderStatus(order: any): string {
  // 취소된 주문
  if (order.canceled === 'T') {
    return 'C00';
  }
  
  // 결제 완료 주문
  if (order.paid === 'T') {
    // shipping_status 필드 직접 확인 (T/F/M/W/P)
    const shippingStatus = order.shipping_status;
    
    if (shippingStatus === 'T') {
      return 'N40'; // T = 배송완료  
    } else if (shippingStatus === 'M') {
      return 'N30'; // M = 배송중
    } else if (shippingStatus === 'P') {
      return 'N20'; // P = 배송준비중 (N22가 아니라 N20으로 수정)
    } else if (shippingStatus === 'W') {
      return 'N21'; // W = 배송대기 (N20이 아니라 N21로 수정)
    } else {
      return 'N10'; // F 또는 기타 = 상품준비중
    }
  }
  
  // 미결제
  return 'N00';
}

// 주문 상태 한글 변환
function getOrderStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'N00': '입금전',
    'N10': '상품준비중',
    'N20': '배송대기',
    'N21': '배송보류',
    'N22': '배송준비중',
    'N30': '배송중',
    'N40': '배송완료',
    'C00': '취소',
    'C10': '반품',
    'C20': '교환',
    'C40': '환불'
  };
  return statusMap[status] || status;
}

// 배송 상태 한글 변환
function getShippingStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    // shipping_status 필드값
    'T': '배송완료',
    'F': '배송전',
    'M': '배송중',
    'W': '배송대기',
    'P': '배송준비중',
    
    // 다른 형태의 값들
    'standby': '배송대기',
    'preparing': '배송준비중',
    'ready': '배송준비완료',
    'shipping': '배송중',
    'shipped': '배송완료',
    
    // 기본값
    '': '배송전'
  };
  return statusMap[status] || status || '배송전';
}