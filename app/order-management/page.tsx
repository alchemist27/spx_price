'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLogin from '@/components/AdminLogin';
import LoginForm from '@/components/LoginForm';
import { getToken } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { 
  LogOut, ArrowLeft, RefreshCw, Package, Truck, CheckCircle, 
  Clock, AlertCircle, Calendar, Search, Download, Eye 
} from 'lucide-react';
import axios from 'axios';

interface Order {
  order_id: string;
  order_date: string;
  payment_date: string;
  order_status: string;
  order_status_text: string;
  payment_amount: string;
  currency: string;
  
  buyer_name: string;
  buyer_phone: string;
  buyer_email: string;
  
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  shipping_message: string;
  
  shipping_status: string;
  shipping_status_text: string;
  shipping_company: string;
  tracking_no: string;
  
  items: OrderItem[];
}

interface OrderItem {
  item_no: number;
  product_no: number;
  product_name: string;
  option_value: string;
  quantity: number;
  product_price: string;
  option_price: string;
  additional_discount_price: string;
}

export default function OrderManagement() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [totalOrderCount, setTotalOrderCount] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 관리자 로그인 상태 확인
    const adminAuth = localStorage.getItem('admin_auth');
    if (adminAuth === 'true') {
      setIsAdminAuthenticated(true);
      checkAuthStatus();
    } else {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // 기본 날짜 설정 (최근 30일)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await getToken();
      if (token) {
        setIsAuthenticated(true);
        // 자동으로 주문 로드
        setTimeout(() => loadOrders(), 500);
      }
    } catch (error) {
      console.error('인증 확인 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminLogin = () => {
    setIsAdminAuthenticated(true);
    checkAuthStatus();
  };

  const handleLoginSuccess = () => {
    // This will be handled by the auth callback
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setIsAdminAuthenticated(false);
    localStorage.removeItem('admin_auth');
    toast.success('로그아웃되었습니다.');
    router.push('/');
  };

  const handleBack = () => {
    router.push('/dashboard');
  };

  const loadOrders = async (offset = 0, append = false) => {
    setIsLoadingOrders(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (selectedStatus) params.append('order_status', selectedStatus);
      params.append('limit', '50');
      params.append('offset', offset.toString());

      const response = await axios.get(`/api/orders?${params.toString()}`);
      
      if (append) {
        setOrders(prev => [...prev, ...response.data.orders]);
      } else {
        setOrders(response.data.orders);
      }
      
      setTotalOrderCount(response.data.count);
      setHasMore(response.data.has_next);
      setCurrentOffset(offset);
      setLastUpdateTime(new Date());
      
      if (response.data.orders.length === 0 && offset === 0) {
        toast('조회된 주문이 없습니다.', { icon: '📋' });
      } else {
        toast.success(`${response.data.orders.length}개의 주문을 불러왔습니다.`);
      }
    } catch (error: any) {
      console.error('주문 로딩 실패:', error);
      if (error.response?.status === 401) {
        toast.error('인증이 만료되었습니다. 다시 로그인해주세요.');
      } else if (error.response?.status === 403 || error.response?.data?.error?.includes('scope') || error.response?.data?.error?.includes('권한')) {
        toast.error('주문 조회 권한이 없습니다. 대시보드에서 "재인증" 버튼을 클릭해주세요.', {
          duration: 5000,
        });
      } else {
        toast.error(error.response?.data?.error || '주문 목록을 불러오는데 실패했습니다.');
      }
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const loadMoreOrders = () => {
    if (!isLoadingOrders && hasMore) {
      loadOrders(currentOffset + 50, true);
    }
  };

  const handleSearch = () => {
    setOrders([]);
    setCurrentOffset(0);
    loadOrders(0);
  };

  const getStatusBadge = (status: string, statusText: string) => {
    const statusConfig: Record<string, { bg: string; text: string; icon: any }> = {
      'N00': { bg: 'bg-gray-100', text: 'text-gray-800', icon: Clock },
      'N10': { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Package },
      'N20': { bg: 'bg-blue-100', text: 'text-blue-800', icon: Clock },
      'N21': { bg: 'bg-orange-100', text: 'text-orange-800', icon: AlertCircle },
      'N22': { bg: 'bg-blue-100', text: 'text-blue-800', icon: Package },
      'N30': { bg: 'bg-indigo-100', text: 'text-indigo-800', icon: Truck },
      'N40': { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
      'C00': { bg: 'bg-red-100', text: 'text-red-800', icon: AlertCircle },
      'C10': { bg: 'bg-red-100', text: 'text-red-800', icon: AlertCircle },
      'C20': { bg: 'bg-orange-100', text: 'text-orange-800', icon: AlertCircle },
      'C40': { bg: 'bg-gray-100', text: 'text-gray-800', icon: AlertCircle }
    };

    const config = statusConfig[status] || { bg: 'bg-gray-100', text: 'text-gray-600', icon: AlertCircle };
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        <Icon className="h-3 w-3" />
        {statusText}
      </span>
    );
  };

  const formatPrice = (price: string, currency: string = 'KRW') => {
    const numPrice = parseFloat(price);
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: currency
    }).format(numPrice);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const toggleOrderDetails = (orderId: string) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // 관리자 로그인이 필요한 경우
  if (!isAdminAuthenticated) {
    return <AdminLogin onLoginSuccess={handleAdminLogin} />;
  }

  // Cafe24 로그인이 필요한 경우
  if (!isAuthenticated) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-4 flex-1">
              <button
                onClick={handleBack}
                className="btn-secondary flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                뒤로가기
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                주문 관리
              </h1>
            </div>
            <div className="flex-1 flex justify-center">
              <img 
                src="/images/SOPEX Korea - Logo_vert.png" 
                alt="SOPEX Korea Logo" 
                className="h-16 w-auto"
              />
            </div>
            <div className="flex-1 flex items-center justify-end gap-4">
              <div className="text-right">
                {lastUpdateTime && (
                  <div className="text-sm text-gray-500">
                    최근 업데이트: {formatDate(lastUpdateTime.toISOString())}
                  </div>
                )}
                {totalOrderCount > 0 && (
                  <div className="text-sm text-gray-600 font-medium">
                    전체 주문: {totalOrderCount}건
                  </div>
                )}
              </div>
              <button
                onClick={() => loadOrders()}
                disabled={isLoadingOrders}
                className="btn-secondary flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                새로고침
              </button>
              <button
                onClick={handleLogout}
                className="btn-secondary flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 필터 섹션 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">주문 검색</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                시작일
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                종료일
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                주문 상태
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체</option>
                <option value="N00">입금전</option>
                <option value="N10">상품준비중</option>
                <option value="N20">배송대기</option>
                <option value="N21">배송보류</option>
                <option value="N22">배송준비중</option>
                <option value="N30">배송중</option>
                <option value="N40">배송완료</option>
                <option value="C00">취소</option>
                <option value="C10">반품</option>
                <option value="C20">교환</option>
                <option value="C40">환불</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleSearch}
                disabled={isLoadingOrders}
                className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <Search className="h-4 w-4" />
                검색
              </button>
            </div>
          </div>
        </div>

        {/* 주문 목록 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">
              주문 목록 {orders.length > 0 && `(${orders.length}건)`}
            </h2>
          </div>
          
          {isLoadingOrders && orders.length === 0 ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-500">주문 내역을 불러오는 중...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">조회된 주문이 없습니다.</p>
              <button
                onClick={() => loadOrders()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                주문 불러오기
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        주문번호
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        주문일시
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        구매자
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        수령자
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        결제금액
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        주문상태
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        배송상태
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        상세
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {orders.map((order) => (
                      <React.Fragment key={order.order_id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {order.order_id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(order.order_date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div>
                              <div className="font-medium">{order.buyer_name}</div>
                              <div className="text-xs text-gray-500">{order.buyer_phone}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div>
                              <div className="font-medium">{order.receiver_name}</div>
                              <div className="text-xs text-gray-500">{order.receiver_phone}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatPrice(order.payment_amount, order.currency)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(order.order_status, order.order_status_text)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(order.shipping_status || 'F00', order.shipping_status_text)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={() => toggleOrderDetails(order.order_id)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                        {expandedOrderId === order.order_id && (
                          <tr>
                            <td colSpan={8} className="px-6 py-4 bg-gray-50">
                              <div className="space-y-4">
                                {/* 배송 정보 */}
                                <div>
                                  <h4 className="font-semibold text-gray-900 mb-2">배송 정보</h4>
                                  <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                      <span className="text-gray-500">배송지:</span>
                                      <p className="text-gray-900">{order.receiver_address}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">배송 메시지:</span>
                                      <p className="text-gray-900">{order.shipping_message || '-'}</p>
                                    </div>
                                    {order.tracking_no && (
                                      <div>
                                        <span className="text-gray-500">송장번호:</span>
                                        <p className="text-gray-900">{order.shipping_company} - {order.tracking_no}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                {/* 주문 상품 정보 */}
                                <div>
                                  <h4 className="font-semibold text-gray-900 mb-2">주문 상품</h4>
                                  <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">상품명</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">옵션</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">수량</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">가격</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {order.items.map((item, idx) => (
                                        <tr key={idx}>
                                          <td className="px-4 py-2 text-sm text-gray-900">{item.product_name}</td>
                                          <td className="px-4 py-2 text-sm text-gray-600">{item.option_value || '-'}</td>
                                          <td className="px-4 py-2 text-sm text-gray-900">{item.quantity}</td>
                                          <td className="px-4 py-2 text-sm text-gray-900">
                                            {formatPrice(item.product_price, order.currency)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* 더보기 버튼 */}
              {hasMore && (
                <div className="px-6 py-4 border-t border-gray-200">
                  <button
                    onClick={loadMoreOrders}
                    disabled={isLoadingOrders}
                    className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                  >
                    {isLoadingOrders ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        로딩 중...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        더 많은 주문 불러오기
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// React Fragment import for TypeScript
import React from 'react';