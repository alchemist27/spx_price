'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { Cafe24Product } from '@/lib/cafe24-api';
import LoginForm from '@/components/LoginForm';
import ProductTable from '@/components/ProductTable';
import AdminLogin from '@/components/AdminLogin';
import toast from 'react-hot-toast';
import { LogOut, RefreshCw, ArrowLeft } from 'lucide-react';
import axios from 'axios';

export default function PriceManagement() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<Cafe24Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [totalExpectedProducts, setTotalExpectedProducts] = useState(0);
  const searchParams = useSearchParams();
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
    const auth = searchParams.get('auth');
    const error = searchParams.get('error');
    
    if (auth === 'success') {
      toast.success('로그인에 성공했습니다.');
      setIsAuthenticated(true);
      loadProducts();
    } else if (error) {
      toast.error(`로그인 실패: ${error}`);
    }
  }, [searchParams]);

  const checkAuthStatus = async () => {
    try {
      const response = await axios.get('/api/auth/status');
      if (response.data.authenticated) {
        setIsAuthenticated(true);
        loadProducts();
      }
    } catch (error) {
      console.error('인증 확인 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadProducts = async () => {
    setIsLoadingProducts(true);
    setLoadingProgress(0);
    setTotalExpectedProducts(0);
    
    try {
      console.log('상품 로딩 시작');
      
      const allProducts: Cafe24Product[] = [];
      const limit = 100;
      let offset = 0;
      let hasMore = true;
      let totalEstimated = 0;

      while (hasMore) {
        const timestamp = Date.now();
        const response = await axios.get(`/api/products?limit=${limit}&offset=${offset}&embed=variants&category=77&_t=${timestamp}`);
        const products = response.data.products || [];
        
        if (products.length > 0) {
          allProducts.push(...products);
          offset += limit;
          
          const pageNumber = Math.floor((offset - limit) / limit) + 1;
          
          // 총 상품 수 예상 업데이트 (로그 최소화)
          if (pageNumber === 1) {
            totalEstimated = products.length < limit ? products.length : products.length * 3;
            setTotalExpectedProducts(totalEstimated);
          } else if (products.length < limit) {
            totalEstimated = allProducts.length;
            setTotalExpectedProducts(totalEstimated);
          } else if (pageNumber > 1 && totalEstimated < allProducts.length * 1.5) {
            totalEstimated = allProducts.length * 2;
            setTotalExpectedProducts(totalEstimated);
          }
          
          // 진행률 계산
          const progress = totalEstimated > 0 ? 
            Math.min((allProducts.length / totalEstimated) * 100, 99) :
            Math.min(pageNumber * 10, 90);
          
          setLoadingProgress(Math.round(progress));
          hasMore = products.length === limit;
          
          // API 호출 간격
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } else {
          hasMore = false;
        }
      }
      
      setProducts(allProducts);
      setLoadingProgress(100);
      setTotalExpectedProducts(allProducts.length);
      console.log(`상품 로딩 완료: ${allProducts.length}개`);
    } catch (error) {
      console.error('상품 로딩 실패:', error);
      toast.error('상품 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const handleLogout = async () => {
    setIsAuthenticated(false);
    setIsAdminAuthenticated(false);
    setProducts([]);
    localStorage.removeItem('admin_auth');
    toast.success('로그아웃되었습니다.');
    router.push('/');
  };

  const handleAdminLogin = () => {
    setIsAdminAuthenticated(true);
    checkAuthStatus();
  };

  const handleLoginSuccess = () => {
    // This will be handled by the auth callback
  };

  const handleBack = () => {
    router.push('/dashboard');
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
                상품 가격 관리
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
                onClick={loadProducts}
                disabled={isLoadingProducts}
                className="btn-secondary flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingProducts ? 'animate-spin' : ''}`} />
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
        {isLoadingProducts ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <div className="text-center space-y-4">
              <p className="text-gray-600 font-medium">상품 목록을 불러오는 중...</p>
              
              {/* Progress Bar */}
              <div className="w-80 mx-auto">
                <div className="flex justify-between text-sm text-gray-500 mb-2">
                  <span>진행률</span>
                  <span>{loadingProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
                </div>
                {totalExpectedProducts > 0 && (
                  <div className="flex justify-between text-xs text-gray-400 mt-2">
                    <span>로딩된 상품: {Math.round(totalExpectedProducts * loadingProgress / 100)}개</span>
                    <span>전체: {totalExpectedProducts}개</span>
                  </div>
                )}
              </div>
              
              <p className="text-sm text-gray-500">
                100개씩 페이지별로 조회하고 있습니다. 잠시만 기다려주세요.
              </p>
            </div>
          </div>
        ) : (
          <ProductTable 
            products={products} 
            onProductsUpdate={loadProducts}
          />
        )}
      </main>
    </div>
  );
}