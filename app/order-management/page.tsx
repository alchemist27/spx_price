'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLogin from '@/components/AdminLogin';
import LoginForm from '@/components/LoginForm';
import { getToken } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { 
  LogOut, ArrowLeft, RefreshCw, Package, Truck, CheckCircle, 
  Clock, AlertCircle, Calendar, Search, Download, Eye, Upload, Send
} from 'lucide-react';
import axios from 'axios';
import ShipmentUploadModal from '@/components/ShipmentUploadModal';

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
  const [deliveryStatuses, setDeliveryStatuses] = useState<Map<string, string>>(new Map());
  const [deliveryStatusCache, setDeliveryStatusCache] = useState<Map<string, {status: string, timestamp: number}>>(new Map());
  const [isCheckingDeliveryStatus, setIsCheckingDeliveryStatus] = useState(false);
  const [deliveryCheckProgress, setDeliveryCheckProgress] = useState({ current: 0, total: 0 });
  const [isProcessingDelivered, setIsProcessingDelivered] = useState(false);
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
  const [pendingShipments, setPendingShipments] = useState<Map<string, string>>(new Map()); // 자동입력된 송장번호 임시 저장
  const router = useRouter();

  // 체크박스 상태 계산
  const isAllSelected = orders.length > 0 && selectedOrders.size === orders.length;
  const isSomeSelected = selectedOrders.size > 0 && selectedOrders.size < orders.length;

  // 탭별로 체크박스 표시 여부 확인
  const showCheckboxes = ['상품준비중', '배송준비중', '배송중'].includes(activeTab);

  useEffect(() => {
    // 기본 날짜 설정 (최근 7일)
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const endDateStr = today.toISOString().split('T')[0];
    const startDateStr = sevenDaysAgo.toISOString().split('T')[0];
    
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
      // 페이지네이션 제한 제거 - 전체 데이터 조회
      // params.append('limit', '20');
      // params.append('offset', offset.toString());

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

  // 전체 데이터를 조회하므로 더보기 기능 비활성화
  const loadMoreOrders = () => {
    // if (!isLoadingOrders && hasMore) {
    //   loadOrders(currentOffset + 20, true);
    // }
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
    setDeliveryStatuses(new Map()); // 탭 변경시 배송상태 초기화
    
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

  // 각 탭별 다음 상태 버튼 텍스트
  const getNextStatusButtonText = () => {
    switch(activeTab) {
      case '상품준비중': return '배송준비중 처리';
      case '배송준비중': return '배송중 처리';
      case '배송중': return '배송완료 처리';
      default: return '';
    }
  };

  // 상태 변경 처리 함수 - 배송완료 처리
  const handleStatusChange = async () => {
    // 배송중 탭에서만 배송완료 처리 가능
    if (activeTab !== '배송중') {
      toast.error('배송중 상태의 주문만 배송완료 처리할 수 있습니다.');
      return;
    }

    // 선택된 주문들 가져오기
    const selectedOrdersList = orders.filter(order => 
      selectedOrders.has(order.order_id)
    );

    if (selectedOrdersList.length === 0) {
      toast.error('배송완료 처리할 주문을 선택해주세요.');
      return;
    }

    // 선택된 주문 중 배송 정보가 없는 주문 확인
    const ordersWithoutShipment = selectedOrdersList.filter(order => 
      !order.shipments || order.shipments.length === 0
    );

    if (ordersWithoutShipment.length > 0) {
      toast.error(`배송 정보가 없는 주문이 있습니다: ${ordersWithoutShipment.map(o => o.order_id).join(', ')}`);
      return;
    }

    setIsProcessingDelivered(true);

    try {
      // 선택된 주문들의 배송 정보 준비
      const shipmentsToUpdate = [];
      for (const order of selectedOrdersList) {
        if (order.shipments && order.shipments.length > 0) {
          for (const shipment of order.shipments) {
            shipmentsToUpdate.push({
              order_id: order.order_id,
              shipping_code: shipment.shipping_code,
              status: 'shipped' // 배송완료
            });
          }
        }
      }

      console.log('배송완료 처리할 주문:', shipmentsToUpdate);

      // Cafe24 API 호출
      const response = await fetch('/api/shipments/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orders: shipmentsToUpdate
        })
      });

      const result = await response.json();

      if (response.ok) {
        toast.success(
          `${selectedOrdersList.length}개 주문을 배송완료 처리했습니다.`,
          { duration: 5000 }
        );

        // 선택 초기화
        setSelectedOrders(new Set());
        
        // 배송 상태 맵 업데이트 (처리된 주문들을 DELIVERED로 표시)
        const newStatuses = new Map(deliveryStatuses);
        selectedOrdersList.forEach(order => {
          newStatuses.set(order.order_id, 'DELIVERED');
        });
        setDeliveryStatuses(newStatuses);

        // 1초 후 주문 목록 새로고침
        setTimeout(() => {
          loadOrders();
        }, 1000);
      } else {
        console.error('배송완료 처리 실패:', result);
        toast.error(result.error || '배송완료 처리에 실패했습니다.');
      }

    } catch (error) {
      console.error('배송완료 처리 오류:', error);
      toast.error('배송완료 처리 중 오류가 발생했습니다.');
    } finally {
      setIsProcessingDelivered(false);
    }
  };

  // 배송완료 주문 처리 함수 (체크박스로 선택된 주문들 처리)
  const processDeliveredOrders = async () => {
    // 체크박스로 선택된 주문들 가져오기
    const selectedOrdersList = orders.filter(order => 
      selectedOrders.has(order.order_id)
    );

    if (selectedOrdersList.length === 0) {
      toast.error('배송완료 처리할 주문을 선택해주세요.');
      return;
    }

    // 선택된 주문 중 배송 정보가 없는 주문 확인
    const ordersWithoutShipment = selectedOrdersList.filter(order => 
      !order.shipments || order.shipments.length === 0
    );

    if (ordersWithoutShipment.length > 0) {
      toast.error(`배송 정보가 없는 주문이 있습니다: ${ordersWithoutShipment.map(o => o.order_id).join(', ')}`);
      return;
    }

    setIsProcessingDelivered(true);

    try {
      // 선택된 주문들의 배송 정보 준비
      const shipmentsToUpdate = [];
      for (const order of selectedOrdersList) {
        if (order.shipments && order.shipments.length > 0) {
          for (const shipment of order.shipments) {
            shipmentsToUpdate.push({
              order_id: order.order_id,
              shipping_code: shipment.shipping_code,
              status: 'shipped' // 배송완료
            });
          }
        }
      }

      console.log('배송완료 처리할 주문:', shipmentsToUpdate);

      // Cafe24 API 호출
      const response = await fetch('/api/shipments/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orders: shipmentsToUpdate
        })
      });

      const result = await response.json();

      if (response.ok) {
        toast.success(
          `${selectedOrdersList.length}개 주문을 배송완료 처리했습니다.`,
          { duration: 5000 }
        );

        // 선택 초기화
        setSelectedOrders(new Set());
        
        // 배송 상태 맵 업데이트 (처리된 주문들을 DELIVERED로 표시)
        const newStatuses = new Map(deliveryStatuses);
        selectedOrdersList.forEach(order => {
          newStatuses.set(order.order_id, 'DELIVERED');
        });
        setDeliveryStatuses(newStatuses);

        // 1초 후 주문 목록 새로고침
        setTimeout(() => {
          loadOrders();
        }, 1000);
      } else {
        console.error('배송완료 처리 실패:', result);
        toast.error(result.error || '배송완료 처리에 실패했습니다.');
      }

    } catch (error) {
      console.error('배송완료 처리 오류:', error);
      toast.error('배송완료 처리 중 오류가 발생했습니다.');
    } finally {
      setIsProcessingDelivered(false);
    }
  };

  // 개별 주문 송장 등록 함수
  const registerSingleShipment = async (orderId: string) => {
    const trackingNo = pendingShipments.get(orderId);
    if (!trackingNo) {
      toast.error('송장번호가 없습니다.');
      return;
    }

    try {
      const response = await fetch(`/api/orders/${orderId}/shipments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tracking_no: trackingNo,
          shipping_company_code: '0003', // 한진택배
          status: 'standby'
        })
      });

      if (response.ok) {
        toast.success(`송장번호 ${trackingNo}가 등록되었습니다.`);
        
        // pendingShipments에서 제거
        const newPending = new Map(pendingShipments);
        newPending.delete(orderId);
        setPendingShipments(newPending);
        
        // 주문 목록 새로고침
        loadOrders();
      } else {
        const error = await response.json();
        toast.error(error.error || '송장 등록 실패');
      }
    } catch (error) {
      console.error('송장 등록 오류:', error);
      toast.error('송장 등록 중 오류가 발생했습니다.');
    }
  };

  // 선택된 주문들 일괄 송장 등록 함수
  const registerSelectedShipments = async () => {
    const selectedOrdersList = Array.from(selectedOrders);
    const shipmentsToRegister = selectedOrdersList
      .filter(orderId => pendingShipments.has(orderId))
      .map(orderId => ({
        order_id: orderId,
        tracking_no: pendingShipments.get(orderId),
        shipping_company_code: '0003',
        status: 'standby'
      }));

    if (shipmentsToRegister.length === 0) {
      toast.error('등록할 송장번호가 없습니다.');
      return;
    }

    try {
      const response = await fetch('/api/shipments/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orders: shipmentsToRegister
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        toast.success(`${result.succeeded || shipmentsToRegister.length}개 송장이 등록되었습니다.`);
        
        // pendingShipments에서 성공한 것들 제거
        const newPending = new Map(pendingShipments);
        shipmentsToRegister.forEach(shipment => {
          newPending.delete(shipment.order_id);
        });
        setPendingShipments(newPending);
        
        // 선택 초기화
        setSelectedOrders(new Set());
        
        // 주문 목록 새로고침
        loadOrders();
      } else {
        toast.error(result.error || '송장 등록 실패');
      }
    } catch (error) {
      console.error('일괄 송장 등록 오류:', error);
      toast.error('송장 등록 중 오류가 발생했습니다.');
    }
  };

  // 배송 상태 조회 함수 (성능 개선 버전)
  const checkDeliveryStatus = async (autoProcess: boolean = false) => {
    if (activeTab !== '배송중') return;
    
    setIsCheckingDeliveryStatus(true);
    const newStatuses = new Map(deliveryStatuses);
    let checkedCount = 0;
    let deliveredCount = 0;
    let skippedFromCache = 0;
    
    // 조회할 송장번호 수집 (중복 제거)
    const trackingToCheck = new Map<string, string[]>(); // tracking_no -> order_ids[]
    const orderTrackingMap = new Map<string, string>(); // order_id -> tracking_no
    
    for (const order of orders) {
      if (order.shipments && order.shipments.length > 0) {
        for (const shipment of order.shipments) {
          if (shipment.tracking_no) {
            if (!trackingToCheck.has(shipment.tracking_no)) {
              trackingToCheck.set(shipment.tracking_no, []);
            }
            trackingToCheck.get(shipment.tracking_no)!.push(order.order_id);
            orderTrackingMap.set(order.order_id, shipment.tracking_no);
          }
        }
      }
    }
    
    const totalToCheck = trackingToCheck.size;
    setDeliveryCheckProgress({ current: 0, total: totalToCheck });
    
    // 캐시 확인 및 분리
    const trackingNumbers = Array.from(trackingToCheck.keys());
    const toFetch: string[] = [];
    const CACHE_DURATION = 5 * 60 * 1000; // 5분 캐시
    const now = Date.now();
    
    for (const trackingNo of trackingNumbers) {
      const cached = deliveryStatusCache.get(trackingNo);
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        // 캐시에서 가져오기
        const orderIds = trackingToCheck.get(trackingNo) || [];
        for (const orderId of orderIds) {
          newStatuses.set(orderId, cached.status);
          if (cached.status === 'DELIVERED') {
            deliveredCount++;
          }
        }
        skippedFromCache++;
        checkedCount++;
        setDeliveryCheckProgress({ current: checkedCount, total: totalToCheck });
      } else {
        toFetch.push(trackingNo);
      }
    }
    
    console.log(`배송 조회: 총 ${totalToCheck}건, 캐시 사용 ${skippedFromCache}건, API 호출 필요 ${toFetch.length}건`);

    // 배치 처리를 위한 함수
    const fetchTrackingStatus = async (trackingNo: string) => {
      try {
        const response = await fetch("/api/tracking", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            trackingNumber: trackingNo,
            carrierId: "kr.hanjin"
          }),
        });

        const data = await response.json();

        // 에러 처리
        if (data.error) {
          console.error(`송장번호 ${trackingNo} 조회 오류:`, data.error);
          return { success: false, trackingNo, error: data.error };
        }

        // 응답 전체 로깅 (디버깅용)
        console.log(`송장번호 ${trackingNo} API 응답:`, JSON.stringify(data, null, 2));

        // 응답 확인
        if (!data?.data?.track) {
          console.warn(`송장번호 ${trackingNo} 조회 결과 없음`);
          return { success: false, trackingNo, error: 'No tracking data' };
        }

        const statusCode = data.data.track.lastEvent?.status?.code || 'IN_TRANSIT';
        console.log(`송장번호 ${trackingNo} 상태: ${statusCode}`);
        
        // 캐시 저장
        setDeliveryStatusCache(prev => {
          const newCache = new Map(prev);
          newCache.set(trackingNo, { status: statusCode, timestamp: Date.now() });
          return newCache;
        });
        
        // 해당 송장번호를 가진 모든 주문 업데이트
        const orderIds = trackingToCheck.get(trackingNo) || [];
        for (const orderId of orderIds) {
          newStatuses.set(orderId, statusCode);
          if (statusCode === 'DELIVERED') {
            deliveredCount++;
          }
        }
        
        return { success: true, trackingNo, status: statusCode };
      } catch (error) {
        console.error(`송장번호 ${trackingNo} 조회 실패:`, error);
        return { success: false, trackingNo, error };
      }
    };

    try {
      // 배치 처리 (2개씩 병렬, 안정성 향상)
      const BATCH_SIZE = 2;
      for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        
        // 배치 내 병렬 처리
        const promises = batch.map(trackingNo => fetchTrackingStatus(trackingNo));
        const results = await Promise.all(promises);
        
        // 결과 확인
        for (const result of results) {
          if (result.success) {
            console.log(`조회 성공: ${result.trackingNo} - ${result.status}`);
          }
        }
        
        checkedCount += batch.length;
        setDeliveryCheckProgress({ current: checkedCount, total: totalToCheck });
        
        // 다음 배치 전 충분한 딜레이 (200ms)
        if (i + BATCH_SIZE < toFetch.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      setDeliveryStatuses(newStatuses);
      
      // 배송완료 개수 재계산 (정확성을 위해)
      let finalDeliveredCount = 0;
      newStatuses.forEach((status) => {
        if (status === 'DELIVERED') {
          finalDeliveredCount++;
        }
      });
      
      if (checkedCount > 0) {
        toast.success(`${checkedCount}개 주문 배송상태 조회 완료 (배송완료: ${finalDeliveredCount}개)`);
        console.log(`조회 완료: 총 ${checkedCount}건, 배송완료 ${finalDeliveredCount}건`);
        
        // 자동처리 옵션이 켜져있고 배송완료된 주문이 있으면 자동으로 처리
        if (autoProcess && finalDeliveredCount > 0) {
          const deliveredOrders: Order[] = [];
          newStatuses.forEach((status, orderId) => {
            if (status === 'DELIVERED') {
              const order = orders.find(o => o.order_id === orderId);
              if (order && order.shipments && order.shipments.length > 0) {
                deliveredOrders.push(order);
              }
            }
          });
          
          if (deliveredOrders.length > 0) {
            toast.loading('배송완료 주문을 자동으로 처리 중...', { id: 'auto-process' });
            
            // 배송완료 처리 API 호출
            const shipmentsToUpdate = [];
            for (const order of deliveredOrders) {
              if (order.shipments && order.shipments.length > 0) {
                for (const shipment of order.shipments) {
                  shipmentsToUpdate.push({
                    order_id: order.order_id,
                    shipping_code: shipment.shipping_code,
                    status: 'shipped' // 배송완료
                  });
                }
              }
            }
            
            try {
              const response = await fetch('/api/shipments/update', {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  orders: shipmentsToUpdate
                })
              });
              
              const result = await response.json();
              
              if (response.ok) {
                toast.success(
                  `${deliveredOrders.length}개 주문을 자동으로 배송완료 처리했습니다.`,
                  { duration: 5000, id: 'auto-process' }
                );
                
                // 1초 후 주문 목록 새로고침
                setTimeout(() => {
                  loadOrders();
                }, 1000);
              } else {
                toast.error(result.error || '자동 배송완료 처리에 실패했습니다.', { id: 'auto-process' });
              }
            } catch (error) {
              console.error('자동 배송완료 처리 오류:', error);
              toast.error('자동 배송완료 처리 중 오류가 발생했습니다.', { id: 'auto-process' });
            }
          }
        }
      } else {
        toast('조회 가능한 송장번호가 없습니다.', { icon: '📋' });
      }
    } catch (error) {
      console.error('배송상태 조회 오류:', error);
      toast.error('배송상태 조회 중 오류가 발생했습니다.');
    } finally {
      setIsCheckingDeliveryStatus(false);
    }
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
                className="btn-secondary flex items-center gap-1 text-xs px-2 py-1"
              >
                <RefreshCw className={`h-3 w-3 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                새로고침
              </button>
              <button
                onClick={handleLogout}
                className="btn-secondary flex items-center gap-1 text-xs px-2 py-1"
              >
                <LogOut className="h-3 w-3" />
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
                max={endDate || undefined}
                onChange={(e) => {
                  const newStartDate = e.target.value;
                  setStartDate(newStartDate);
                  
                  if (newStartDate && endDate) {
                    // 날짜 순서 검증
                    if (new Date(newStartDate) > new Date(endDate)) {
                      toast.error('시작일은 종료일보다 이전이어야 합니다.');
                      return;
                    }
                    setOrders([]);
                    setCurrentOffset(0);
                    loadOrdersWithDates(newStartDate, endDate, 0, false);
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
                min={startDate || undefined}
                onChange={(e) => {
                  const newEndDate = e.target.value;
                  setEndDate(newEndDate);
                  
                  if (startDate && newEndDate) {
                    // 날짜 순서 검증
                    if (new Date(startDate) > new Date(newEndDate)) {
                      toast.error('종료일은 시작일보다 이후여야 합니다.');
                      return;
                    }
                    setOrders([]);
                    setCurrentOffset(0);
                    loadOrdersWithDates(startDate, newEndDate, 0, false);
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
            {activeTab === '배송준비중' && orders.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsShipmentModalOpen(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <Upload className="h-4 w-4" />
                  엑셀로 송장 일괄 등록
                </button>
                {selectedOrders.size > 0 && Array.from(selectedOrders).some(id => pendingShipments.has(id)) && (
                  <button
                    onClick={registerSelectedShipments}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
                  >
                    <Send className="h-4 w-4" />
                    선택한 {Array.from(selectedOrders).filter(id => pendingShipments.has(id)).length}개 송장 등록
                  </button>
                )}
              </div>
            )}
            {activeTab === '배송중' && orders.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => checkDeliveryStatus(false)}
                  disabled={isCheckingDeliveryStatus}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  {isCheckingDeliveryStatus ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      조회 중... ({deliveryCheckProgress.current}/{deliveryCheckProgress.total})
                    </>
                  ) : (
                    <>
                      <Truck className="h-4 w-4" />
                      배송상태 조회
                    </>
                  )}
                </button>
                <button
                  onClick={() => checkDeliveryStatus(true)}
                  disabled={isCheckingDeliveryStatus}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  {isCheckingDeliveryStatus ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      조회 중... ({deliveryCheckProgress.current}/{deliveryCheckProgress.total})
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      배송조회 후 배송완료 자동처리
                    </>
                  )}
                </button>
                {selectedOrders.size > 0 && (
                  <button
                    onClick={processDeliveredOrders}
                    disabled={isProcessingDelivered}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
                  >
                    {isProcessingDelivered ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        처리 중...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        선택 주문 배송완료 처리
                        <span className="ml-1 px-1.5 py-0.5 bg-blue-500 rounded text-xs">
                          {selectedOrders.size}건
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
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
                      {activeTab === '배송준비중' && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          송장번호
                        </th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        결제금액
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
                              {/* 배송중 탭에서 배송번호 및 상태 표시 */}
                              {activeTab === '배송중' && order.shipments && order.shipments.length > 0 && (
                                <div className="text-xs mt-1 space-y-1">
                                  {order.shipments.map((shipment, idx) => (
                                    <div key={idx}>
                                      {shipment.tracking_no && (
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono text-blue-600">송장: {shipment.tracking_no}</span>
                                          {deliveryStatuses.get(order.order_id) === 'DELIVERED' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                              <CheckCircle className="h-3 w-3" />
                                              배송완료
                                            </span>
                                          )}
                                          {deliveryStatuses.get(order.order_id) && deliveryStatuses.get(order.order_id) !== 'DELIVERED' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                              <Truck className="h-3 w-3" />
                                              배송중
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          {activeTab === '배송준비중' && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {order.shipments && order.shipments.length > 0 && order.shipments[0].tracking_no ? (
                                // 카페24에 이미 제출된 송장
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-blue-600 text-xs">
                                    {order.shipments[0].tracking_no}
                                  </span>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    카페24제출완료
                                  </span>
                                </div>
                              ) : pendingShipments.has(order.order_id) ? (
                                // 자동입력되었지만 아직 제출 전
                                <div className="flex items-center gap-1">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-orange-600 text-xs">
                                        {pendingShipments.get(order.order_id)}
                                      </span>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                        자동입력
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => registerSingleShipment(order.order_id)}
                                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors flex items-center gap-1"
                                    >
                                      <Send className="h-3 w-3" />
                                      등록
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                // 송장 입력 전
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                  입력전
                                </span>
                              )}
                            </td>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatPrice(order.payment_amount, order.currency)}
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
                            <td colSpan={showCheckboxes ? (activeTab === '배송준비중' ? 8 : 7) : (activeTab === '배송준비중' ? 7 : 6)} className="px-6 py-4 bg-gray-50">
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
                                    {/* 배송준비중 탭에서 송장번호 표시 */}
                                    {activeTab === '배송준비중' && (
                                      <div>
                                        <span className="text-gray-500">송장번호:</span>
                                        {order.shipments && order.shipments.length > 0 && order.shipments[0].tracking_no ? (
                                          <p className="text-gray-900">
                                            <span className="font-mono text-blue-600">{order.shipments[0].tracking_no}</span>
                                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                              카페24제출완료
                                            </span>
                                          </p>
                                        ) : pendingShipments.has(order.order_id) ? (
                                          <p className="text-gray-900">
                                            <span className="font-mono text-orange-600">{pendingShipments.get(order.order_id)}</span>
                                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                              자동입력
                                            </span>
                                          </p>
                                        ) : (
                                          <p className="text-gray-500">-</p>
                                        )}
                                      </div>
                                    )}
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
                      {activeTab === '배송준비중' && Array.from(selectedOrders).some(id => pendingShipments.has(id)) && (
                        <span className="ml-2 text-orange-600">
                          ({Array.from(selectedOrders).filter(id => pendingShipments.has(id)).length}개 송장 자동입력됨)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {activeTab === '배송준비중' && Array.from(selectedOrders).some(id => pendingShipments.has(id)) && (
                        <button
                          onClick={registerSelectedShipments}
                          className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
                        >
                          <Send className="h-4 w-4" />
                          선택한 송장 등록
                        </button>
                      )}
                      <button
                        onClick={handleStatusChange}
                        disabled={isProcessingDelivered}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessingDelivered ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            처리 중...
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
                      </button>
                    </div>
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
      
      {/* 송장 업로드 모달 */}
      <ShipmentUploadModal
        isOpen={isShipmentModalOpen}
        onClose={() => {
          setIsShipmentModalOpen(false);
          setPendingShipments(new Map()); // 모달 닫을 때 자동입력 상태 초기화
        }}
        orders={orders}
        onMatchComplete={(matches) => {
          // 매칭된 송장번호를 임시로 저장
          const newPending = new Map(pendingShipments);
          matches.forEach(match => {
            newPending.set(match.orderId, match.trackingNo);
          });
          setPendingShipments(newPending);
        }}
        onUploadComplete={() => {
          setIsShipmentModalOpen(false);
          setPendingShipments(new Map()); // 제출 완료 후 자동입력 상태 초기화
          loadOrders();
        }}
      />
    </div>
  );
}

// React Fragment import for TypeScript
import React from 'react';