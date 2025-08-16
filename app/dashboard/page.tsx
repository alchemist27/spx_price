'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLogin from '@/components/AdminLogin';
import { LogOut, Package, DollarSign, ShoppingCart, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { deleteToken } from '@/lib/firebase';

export default function Dashboard() {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // 관리자 로그인 상태 확인
    const adminAuth = localStorage.getItem('admin_auth');
    if (adminAuth === 'true') {
      setIsAdminAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleAdminLogin = () => {
    setIsAdminAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAdminAuthenticated(false);
    localStorage.removeItem('admin_auth');
    toast.success('로그아웃되었습니다.');
  };

  const handleReauthenticate = async () => {
    const confirmed = confirm('기존 인증 정보를 삭제하고 다시 인증하시겠습니까?\n주문 관리 등 새로운 권한을 사용하려면 재인증이 필요합니다.');
    if (confirmed) {
      const deleted = await deleteToken();
      if (deleted) {
        toast.success('인증 정보가 삭제되었습니다. 다시 로그인해주세요.');
        // 가격 관리 페이지로 이동하면 자동으로 재인증 프로세스 시작
        router.push('/price-management');
      } else {
        toast.error('인증 정보 삭제에 실패했습니다.');
      }
    }
  };

  const navigateToPriceManagement = () => {
    router.push('/price-management');
  };

  const navigateToOrderManagement = () => {
    router.push('/order-management');
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
                소펙스코리아 쇼핑몰 관리 시스템
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
                onClick={handleReauthenticate}
                className="btn-secondary flex items-center gap-2"
                title="Cafe24 재인증"
              >
                <RefreshCw className="h-4 w-4" />
                재인증
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            관리 기능 선택
          </h2>
          <p className="text-gray-600">
            원하시는 관리 기능을 선택해주세요
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* 가격 관리 카드 */}
          <div 
            onClick={navigateToPriceManagement}
            className="bg-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-xl transition-shadow duration-300 border-2 border-transparent hover:border-blue-500"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                <DollarSign className="h-10 w-10 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">
                가격 관리
              </h3>
              <p className="text-gray-600">
                상품 가격을 일괄 조정하고 관리합니다
              </p>
              <ul className="text-sm text-gray-500 space-y-2 text-left">
                <li>• 상품별 가격 조정</li>
                <li>• 일괄 가격 업데이트</li>
                <li>• 옵션별 가격 설정</li>
              </ul>
              <button className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                가격 관리 시작
              </button>
            </div>
          </div>

          {/* 주문 관리 카드 */}
          <div 
            onClick={navigateToOrderManagement}
            className="bg-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-xl transition-shadow duration-300 border-2 border-transparent hover:border-green-500"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <ShoppingCart className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">
                주문 관리
              </h3>
              <p className="text-gray-600">
                주문 처리 및 배송 상태를 관리합니다
              </p>
              <ul className="text-sm text-gray-500 space-y-2 text-left">
                <li>• 배송 처리 관리</li>
                <li>• 주문 내역 조회</li>
                <li>• 배송 상태 업데이트</li>
              </ul>
              <button className="mt-4 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                주문 관리 시작
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}