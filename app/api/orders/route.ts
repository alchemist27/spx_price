import { NextRequest, NextResponse } from 'next/server';
import { getToken } from '@/lib/firebase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('start_date') || '';
    const endDate = searchParams.get('end_date') || '';
    const limit = searchParams.get('limit') || '500';
    const offset = searchParams.get('offset') || '0';
    const orderStatus = searchParams.get('order_status') || '';
    
    const token = await getToken();
    if (!token) {
      return NextResponse.json({ error: '인증 토큰이 없습니다.' }, { status: 401 });
    }

    // Cafe24 API URL 구성
    const mallId = process.env.NEXT_PUBLIC_CAFE24_MALL_ID;
    let apiUrl = `https://${mallId}.cafe24api.com/api/v2/admin/orders?limit=${limit}&offset=${offset}`;
    
    // 날짜 필터 추가
    if (startDate) {
      apiUrl += `&start_date=${startDate}`;
    }
    if (endDate) {
      apiUrl += `&end_date=${endDate}`;
    }
    
    // 주문 상태 필터 추가 (N00: 입금전, N10: 상품준비중, N20: 배송대기, N21: 배송보류, N22: 배송준비중, N30: 배송중, N40: 배송완료)
    if (orderStatus) {
      apiUrl += `&order_status=${orderStatus}`;
    }

    // 배송정보 포함
    apiUrl += '&embed=receivers,items,buyers';

    console.log('주문 조회 API 호출:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        'X-Cafe24-Api-Version': '2024-06-01'
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('주문 조회 실패:', data);
      return NextResponse.json({ 
        error: data.error?.message || '주문 조회에 실패했습니다.',
        details: data 
      }, { status: response.status });
    }

    // 주문 데이터 정리
    const orders = data.orders?.map((order: any) => ({
      order_id: order.order_id,
      order_date: order.order_date,
      payment_date: order.payment_date,
      order_status: order.order_status,
      payment_amount: order.actual_order_amount?.order_price_amount || '0',
      currency: order.actual_order_amount?.currency || 'KRW',
      
      // 구매자 정보
      buyer_name: order.buyers?.[0]?.name || '',
      buyer_phone: order.buyers?.[0]?.phone || '',
      buyer_email: order.buyers?.[0]?.email || '',
      
      // 수령자 정보
      receiver_name: order.receivers?.[0]?.name || '',
      receiver_phone: order.receivers?.[0]?.phone || '',
      receiver_address: order.receivers?.[0]?.address_full || '',
      shipping_message: order.receivers?.[0]?.shipping_message || '',
      
      // 배송 정보
      shipping_status: order.receivers?.[0]?.shipping_status || '',
      shipping_company: order.receivers?.[0]?.shipping_company || '',
      tracking_no: order.receivers?.[0]?.tracking_no || '',
      
      // 주문 상품 정보
      items: order.items?.map((item: any) => ({
        item_no: item.item_no,
        product_no: item.product_no,
        product_name: item.product_name,
        option_value: item.option_value || '',
        quantity: item.quantity,
        product_price: item.product_price,
        option_price: item.option_price || '0',
        additional_discount_price: item.additional_discount_price || '0'
      })) || [],
      
      // 주문 상태 한글 변환
      order_status_text: getOrderStatusText(order.order_status),
      shipping_status_text: getShippingStatusText(order.receivers?.[0]?.shipping_status)
    })) || [];

    return NextResponse.json({ 
      orders,
      count: data.count || 0,
      has_next: data.links?.next ? true : false
    });

  } catch (error) {
    console.error('주문 조회 오류:', error);
    return NextResponse.json({ 
      error: '주문 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : '알 수 없는 오류'
    }, { status: 500 });
  }
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
    'F00': '배송전',
    'F10': '배송준비중',
    'F20': '배송중',
    'F30': '배송완료'
  };
  return statusMap[status] || status || '배송전';
}