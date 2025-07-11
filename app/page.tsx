'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getToken, testFirestoreWrite } from '@/lib/firebase';
import { cafe24API, Cafe24Product } from '@/lib/cafe24-api';
import LoginForm from '@/components/LoginForm';
import ProductTable from '@/components/ProductTable';
import toast from 'react-hot-toast';
import { LogOut, RefreshCw } from 'lucide-react';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<Cafe24Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    // Firestore 쓰기 테스트
    testFirestoreWrite();
    checkAuthStatus();
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
      console.log('🔍 인증 상태 확인 중...');
      const token = await getToken();
      if (token) {
        console.log('✅ 저장된 토큰 발견:', { 
          hasAccessToken: !!token.access_token,
          expiresAt: new Date(token.expires_at).toISOString(),
          isExpired: Date.now() >= token.expires_at
        });
        setIsAuthenticated(true);
        loadProducts();
      } else {
        console.log('❌ 저장된 토큰 없음');
      }
    } catch (error) {
      console.error('❌ 인증 상태 확인 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };



  const loadProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const productsData = await cafe24API.getProducts();
      setProducts(productsData);
    } catch (error) {
      console.error('Failed to load products:', error);
      toast.error('상품 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const handleLogout = async () => {
    setIsAuthenticated(false);
    setProducts([]);
    toast.success('로그아웃되었습니다.');
  };

  const handleLoginSuccess = () => {
    // This will be handled by the auth callback
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Cafe24 상품 관리자
              </h1>
              <p className="text-sm text-gray-600">
                소펙스코리아 쇼핑몰 상품 관리 시스템
              </p>
            </div>
            <div className="flex items-center gap-4">
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
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="ml-3 text-gray-600">상품 목록을 불러오는 중...</span>
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