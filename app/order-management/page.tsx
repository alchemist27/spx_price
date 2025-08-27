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
  shipments?: ShipmentInfo[];
}

interface ShipmentInfo {
  shipping_code: string;
  tracking_no: string;
  tracking_no_updated_date: string;
  shipping_company_code: string;
  shipping_company_name: string;
  items: {
    order_item_code: string;
    status: string;
  }[];
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
  const [activeTab, setActiveTab] = useState('입금전');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [totalOrderCount, setTotalOrderCount] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingShipments, setIsLoadingShipments] = useState(false);
  const [shipmentLoadingProgress, setShipmentLoadingProgress] = useState({ current: 0, total: 0 });
  const [abortShipmentLoading, setAbortShipmentLoading] = useState(false);
  const [shipmentCache, setShipmentCache] = useState<Map<string, {data: ShipmentInfo[], timestamp: number}>>(new Map());
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => {
    // 기본 날짜 설정 (최근 30일)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const endDateStr = today.toISOString().split('T')[0];
    const startDateStr = thirtyDaysAgo.toISOString().split('T')[0];
    
    setEndDate(endDateStr);
    setStartDate(startDateStr);
    
    // 관리자 로그인 상태 확인
    const adminAuth = localStorage.getItem('admin_auth');
    if (adminAuth === 'true') {
      setIsAdminAuthenticated(true);
      // 날짜가 설정된 후에 checkAuthStatus 호출
      checkAuthStatus(startDateStr, endDateStr);
    } else {
      setIsLoading(false);
    }
    
    // 컴포넌트 언마운트시 배송 조회 중단
    return () => {
      setAbortShipmentLoading(true);
      setIsLoadingShipments(false);
    };
  }, []);

  // indeterminate 상태 처리를 위한 effect
  useEffect(() => {
    const checkbox = document.querySelector('thead input[type="checkbox"]') as HTMLInputElement;
    if (checkbox) {
      checkbox.indeterminate = isSomeSelected;
    }
  }, [isSomeSelected]);

  const checkAuthStatus = async (initialStartDate?: string, initialEndDate?: string) => {
    try {
      const token = await getToken();
      if (token) {
        setIsAuthenticated(true);
        // 날짜가 설정된 후에 주문 로드
        if (initialStartDate && initialEndDate) {
          setTimeout(() => loadOrdersWithDates(initialStartDate, initialEndDate), 500);
        }
      }
    } catch (error) {
      console.error('인증 확인 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 탭별 상태 매핑
  const getStatusByTab = (tab: string): string => {
    const statusMap: Record<string, string> = {
      '입금전': 'N00',
      '상품준비중': 'N10', 
      '배송준비중': 'N20',
      '배송중': 'N30',
      '배송완료': 'N40'
    };
    return statusMap[tab] || '';
  };

  const loadOrdersWithDates = async (startDateParam: string, endDateParam: string, offset = 0, append = false, targetTab?: string) => {
    setIsLoadingOrders(true);
    try {
      const params = new URLSearchParams();
      params.append('start_date', startDateParam);
      params.append('end_date', endDateParam);
      const currentTab = targetTab || activeTab;
      const statusCode = getStatusByTab(currentTab);
      console.log(`API 호출: 탭=${currentTab}, 상태코드=${statusCode}`);
      if (statusCode) {
        params.append('order_status', statusCode);
      }
      params.append('limit', '20');
      params.append('offset', offset.toString());

      const response = await axios.get(`/api/orders?${params.toString()}`);
      
      // 배송중 탭인 경우 배송 정보도 함께 로드
      const ordersWithShipments = await loadShipmentInfoForOrders(response.data.orders, currentTab);
      
      if (append) {
        setOrders(prev => [...prev, ...ordersWithShipments]);
      } else {
        setOrders(ordersWithShipments);
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
    // 페이지를 벗어날 때 배송 조회 중단
    setAbortShipmentLoading(true);
    setIsLoadingShipments(false);
    router.push('/dashboard');
  };

  const loadOrders = async (offset = 0, append = false) => {
    // 날짜가 설정되어 있는지 확인
    if (!startDate || !endDate) {
      console.log('날짜가 설정되지 않아 주문 로드를 건너뜁니다.');
      return;
    }
    
    loadOrdersWithDates(startDate, endDate, offset, append);
  };

  const loadMoreOrders = () => {
    if (!isLoadingOrders && hasMore) {
      loadOrders(currentOffset + 20, true);
    }
  };

  const handleTabChange = async (tab: string) => {
    console.log(`탭 변경: ${activeTab} -> ${tab}`);
    
    // 진행 중인 배송 조회 중단
    setAbortShipmentLoading(true);
    setIsLoadingShipments(false);
    
    // 즉시 탭 상태와 주문 목록 초기화
    setActiveTab(tab);
    setOrders([]);
    setCurrentOffset(0);
    setTotalOrderCount(0);
    setHasMore(false);
    setSelectedOrders(new Set()); // 탭 변경시 선택 초기화
    
    // 날짜가 설정되어 있으면 새로운 탭의 데이터 로드
    if (startDate && endDate) {
      console.log(`${tab} 탭 데이터 로드 시작`);
      setAbortShipmentLoading(false); // 새로운 조회를 위해 중단 플래그 리셋
      await loadOrdersWithDates(startDate, endDate, 0, false, tab);
    }
  };


  // 딜레이 함수
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // 캐시 확인 및 만료 검사 함수
  const getCachedShipmentInfo = (orderId: string): ShipmentInfo[] | null => {
    const cached = shipmentCache.get(orderId);
    if (!cached) return null;
    
    const now = Date.now();
    const cacheAge = now - cached.timestamp;
    const CACHE_DURATION = 20 * 60 * 1000; // 20분
    
    if (cacheAge > CACHE_DURATION) {
      // 캐시 만료, 제거
      setShipmentCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(orderId);
        return newCache;
      });
      return null;
    }
    
    return cached.data;
  };

  // 캐시에 배송 정보 저장
  const setCachedShipmentInfo = (orderId: string, shipments: ShipmentInfo[]) => {
    setShipmentCache(prev => {
      const newCache = new Map(prev);
      newCache.set(orderId, {
        data: shipments,
        timestamp: Date.now()
      });
      return newCache;
    });
  };

  // 배송 정보 조회 함수 (캐시 포함)
  const loadShipmentInfo = async (orderId: string): Promise<ShipmentInfo[]> => {
    // 캐시 확인
    const cachedData = getCachedShipmentInfo(orderId);
    if (cachedData) {
      console.log(`주문 ${orderId} 배송 정보 캐시 사용`);
      return cachedData;
    }
    
    try {
      console.log(`주문 ${orderId} 배송 정보 API 호출`);
      const response = await axios.get(`/api/orders/${orderId}/shipments`);
      const shipments = response.data.shipments || [];
      
      // 캐시에 저장
      setCachedShipmentInfo(orderId, shipments);
      
      return shipments;
    } catch (error: any) {
      if (error.response?.status === 429) {
        console.warn(`주문 ${orderId} Rate Limit - 스킵`);
      } else {
        console.error(`주문 ${orderId} 배송 정보 조회 실패:`, error);
      }
      return [];
    }
  };

  // 배송중 상태의 주문들에 대해 배송 정보를 순차적으로 로드 (Rate Limit 완전 방지)
  const loadShipmentInfoForOrders = async (orders: Order[], targetTab?: string) => {
    const currentTab = targetTab || activeTab;
    if (currentTab !== '배송중') return orders;
    
    setIsLoadingShipments(true);
    
    try {
      const ordersWithShipments: Order[] = [];
      const delayMs = 150; // 150ms 딜레이 (순차 처리)
      
      setShipmentLoadingProgress({ current: 0, total: orders.length });
      
      // 캐시된 주문과 API 호출이 필요한 주문 분리
      const cachedOrders: Order[] = [];
      const uncachedOrders: {order: Order, index: number}[] = [];
      
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        const cachedData = getCachedShipmentInfo(order.order_id);
        
        if (cachedData) {
          cachedOrders.push({
            ...order,
            shipments: cachedData
          });
        } else {
          uncachedOrders.push({order, index: i});
        }
      }
      
      console.log(`배송 정보 조회: 캐시 ${cachedOrders.length}건, API 호출 ${uncachedOrders.length}건`);
      
      // 캐시된 주문은 즉시 추가
      ordersWithShipments.push(...cachedOrders);
      
      // 진행 상황 업데이트 (캐시된 것들)
      setShipmentLoadingProgress({ 
        current: cachedOrders.length, 
        total: orders.length 
      });
      
      // API 호출이 필요한 주문들을 순차 처리
      for (let i = 0; i < uncachedOrders.length; i++) {
        // 중단 플래그 확인
        if (abortShipmentLoading) {
          console.log('배송 조회 중단됨');
          break;
        }
        
        const {order} = uncachedOrders[i];
        
        console.log(`배송 정보 조회 중: ${cachedOrders.length + i + 1}/${orders.length}건 (${order.order_id})`);
        
        const shipments = await loadShipmentInfo(order.order_id);
        ordersWithShipments.push({
          ...order,
          shipments
        });
        
        // 진행 상황 업데이트
        setShipmentLoadingProgress({ 
          current: cachedOrders.length + i + 1, 
          total: orders.length 
        });
        
        // 마지막 주문이 아닌 경우 딜레이 (중단 플래그 다시 확인)
        if (i < uncachedOrders.length - 1 && !abortShipmentLoading) {
          await delay(delayMs);
        }
      }
      
      // 원래 순서대로 정렬
      ordersWithShipments.sort((a, b) => {
        const indexA = orders.findIndex(order => order.order_id === a.order_id);
        const indexB = orders.findIndex(order => order.order_id === b.order_id);
        return indexA - indexB;
      });
      
      return ordersWithShipments;
    } finally {
      setIsLoadingShipments(false);
    }
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

  // 체크박스 관련 함수들
  const handleSelectOrder = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedOrders.size === orders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(orders.map(order => order.order_id)));
    }
  };

  const isAllSelected = orders.length > 0 && selectedOrders.size === orders.length;
  const isSomeSelected = selectedOrders.size > 0 && selectedOrders.size < orders.length;

  // 탭별로 체크박스 표시 여부 확인
  const showCheckboxes = ['상품준비중', '배송준비중', '배송중'].includes(activeTab);

  // 각 탭별 다음 상태 버튼 텍스트
  const getNextStatusButtonText = () => {
    switch(activeTab) {
      case '상품준비중': return '배송준비중 처리';
      case '배송준비중': return '배송중 처리';
      case '배송중': return '배송완료 처리';
      default: return '';
    }
  };

  // 상태 변경 처리 함수 (추후 구현)
  const handleStatusChange = () => {
    const selectedOrderIds = Array.from(selectedOrders);
    toast.success(`선택된 ${selectedOrderIds.length}개 주문을 ${getNextStatusButtonText()} 예정입니다.`);
    // 실제 API 호출 구현은 추후
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
        {/* 날짜 선택 섹션 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">조회 기간</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                시작일
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value && endDate) {
                    setOrders([]);
                    setCurrentOffset(0);
                    loadOrdersWithDates(e.target.value, endDate, 0, false);
                  }
                }}
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
                onChange={(e) => {
                  setEndDate(e.target.value);
                  if (startDate && e.target.value) {
                    setOrders([]);
                    setCurrentOffset(0);
                    loadOrdersWithDates(startDate, e.target.value, 0, false);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* 주문 목록 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* 상태별 탭 */}
          <div className="px-6 pt-6 pb-2 border-b border-gray-200 bg-gray-50">
            <div className="flex space-x-4">
              {['입금전', '상품준비중', '배송준비중', '배송중', '배송완료'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`relative px-6 py-3 rounded-lg font-semibold text-base transition-all duration-200 ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-white text-gray-600 hover:text-gray-800 hover:bg-gray-100 shadow-sm border border-gray-200'
                  }`}
                >
                  <span>{tab}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">
              {activeTab} 주문 {orders.length > 0 && `(${orders.length}건)`}
              {isLoadingShipments && activeTab === '배송중' && (
                <span className="ml-2 text-sm text-blue-600">
                  <RefreshCw className="inline h-4 w-4 animate-spin mr-1" />
                  배송 정보 로딩 중... ({shipmentLoadingProgress.current}/{shipmentLoadingProgress.total})
                  <span className="text-xs text-gray-500 ml-1">(20분 캐시 적용)</span>
                </span>
              )}
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
                      {showCheckboxes && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={handleSelectAll}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </th>
                      )}
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
                        상세
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {orders.map((order) => (
                      <React.Fragment key={order.order_id}>
                        <tr className="hover:bg-gray-50">
                          {showCheckboxes && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedOrders.has(order.order_id)}
                                onChange={() => handleSelectOrder(order.order_id)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                            </td>
                          )}
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
                            <div className="space-y-1">
                              {getStatusBadge(order.order_status, order.order_status_text)}
                              {/* 배송중 탭에서 배송번호 표시 */}
                              {activeTab === '배송중' && order.shipments && order.shipments.length > 0 && (
                                <div className="text-xs text-blue-600 space-y-1">
                                  {order.shipments.map((shipment, idx) => (
                                    <div key={idx} className="flex flex-col">
                                      <span className="font-mono">배송: {shipment.shipping_code}</span>
                                      {shipment.tracking_no && (
                                        <span className="font-mono">송장: {shipment.tracking_no}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
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
                            <td colSpan={showCheckboxes ? 8 : 7} className="px-6 py-4 bg-gray-50">
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
                                    
                                    {/* 배송중 탭에서 추가 배송 정보 표시 */}
                                    {activeTab === '배송중' && order.shipments && order.shipments.length > 0 && (
                                      <div>
                                        <span className="text-gray-500">배송 상세정보:</span>
                                        <div className="mt-2 space-y-2">
                                          {order.shipments.map((shipment, idx) => (
                                            <div key={idx} className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
                                              <div className="grid grid-cols-2 gap-2 text-sm">
                                                <div>
                                                  <span className="font-medium text-blue-700">배송번호:</span>
                                                  <p className="text-gray-800 font-mono">{shipment.shipping_code}</p>
                                                </div>
                                                <div>
                                                  <span className="font-medium text-blue-700">송장번호:</span>
                                                  <p className="text-gray-800 font-mono">{shipment.tracking_no || '-'}</p>
                                                </div>
                                                <div>
                                                  <span className="font-medium text-blue-700">배송업체:</span>
                                                  <p className="text-gray-800">{shipment.shipping_company_name}</p>
                                                </div>
                                                {shipment.tracking_no_updated_date && (
                                                  <div>
                                                    <span className="font-medium text-blue-700">송장 등록일:</span>
                                                    <p className="text-gray-800">{formatDate(shipment.tracking_no_updated_date)}</p>
                                                  </div>
                                                )}
                                              </div>
                                              {shipment.items && shipment.items.length > 0 && (
                                                <div className="mt-2">
                                                  <span className="font-medium text-blue-700 block mb-1">포함 상품:</span>
                                                  <div className="flex flex-wrap gap-1">
                                                    {shipment.items.map((item, itemIdx) => (
                                                      <span key={itemIdx} className="inline-block bg-white px-2 py-1 rounded text-xs text-gray-700 border">
                                                        {item.order_item_code} ({item.status})
                                                      </span>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
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
              
              {/* 상태 변경 버튼 - 체크박스가 표시되는 탭에서만 */}
              {showCheckboxes && selectedOrders.size > 0 && (
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">{selectedOrders.size}개</span> 주문 선택됨
                    </div>
                    <button
                      onClick={handleStatusChange}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
                    >
                      {activeTab === '상품준비중' && (
                        <>
                          <Package className="h-4 w-4" />
                          배송준비중 처리
                        </>
                      )}
                      {activeTab === '배송준비중' && (
                        <>
                          <Truck className="h-4 w-4" />
                          배송중 처리
                        </>
                      )}
                      {activeTab === '배송중' && (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          배송완료 처리
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
              
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
                        더 많은 주문 불러오기 (20건씩)
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