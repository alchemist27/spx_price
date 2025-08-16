'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLogin from '@/components/AdminLogin';
import LoginForm from '@/components/LoginForm';
import { getToken } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { LogOut, ArrowLeft, RefreshCw, Package, Truck, CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface Order {
  order_id: string;
  order_date: string;
  buyer_name: string;
  buyer_phone: string;
  payment_amount: string;
  order_status: string;
  shipping_status: string;
  items: OrderItem[];
}

interface OrderItem {
  product_no: number;
  product_name: string;
  option_value: string;
  quantity: number;
  product_price: string;
}

export default function OrderManagement() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('all');
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

  const checkAuthStatus = async () => {
    try {
      const token = await getToken();
      if (token) {
        setIsAuthenticated(true);
        // 주문 목록 로드는 나중에 구현
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

  const loadOrders = async () => {
    setIsLoadingOrders(true);
    try {
      // TODO: Cafe24 API를 통한 주문 데이터 로드 구현
      toast('주문 API 연동이 필요합니다.', {
        icon: 'ℹ️',
      });
    } catch (error) {
      console.error('주문 로딩 실패:', error);
      toast.error('주문 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3" />
            결제완료
          </span>
        );
      case 'preparing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3" />
            상품준비중
          </span>
        );
      case 'shipping':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Truck className="h-3 w-3" />
            배송중
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <Package className="h-3 w-3" />
            배송완료
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            <AlertCircle className="h-3 w-3" />
            {status}
          </span>
        );
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
              <button
                onClick={loadOrders}
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
            <h2 className="text-lg font-semibold text-gray-900">주문 필터</h2>
          </div>
          <div className="flex gap-4 flex-wrap">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">전체 주문</option>
              <option value="paid">결제완료</option>
              <option value="preparing">상품준비중</option>
              <option value="shipping">배송중</option>
              <option value="delivered">배송완료</option>
            </select>
            <input
              type="date"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="시작일"
            />
            <input
              type="date"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="종료일"
            />
            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              검색
            </button>
          </div>
        </div>

        {/* 주문 목록 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">주문 목록</h2>
          </div>
          
          {orders.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">주문 내역이 없습니다.</p>
              <button
                onClick={loadOrders}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                주문 불러오기
              </button>
            </div>
          ) : (
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
                      결제금액
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      주문상태
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      배송상태
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* 주문 데이터가 로드되면 여기에 표시 */}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 안내 메시지 */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-blue-900 mb-2">
                주문 관리 기능 안내
              </h3>
              <p className="text-sm text-blue-700">
                주문 관리 기능은 Cafe24 API와 연동하여 주문 조회, 배송 처리, 상태 업데이트 등을 수행합니다.
                API 설정이 완료되면 주문 내역을 조회하고 관리할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}