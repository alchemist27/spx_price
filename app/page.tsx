'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getToken, testFirestoreWrite } from '@/lib/firebase';
import { cafe24API, Cafe24Product } from '@/lib/cafe24-api';
import LoginForm from '@/components/LoginForm';
import ProductTable from '@/components/ProductTable';
import toast from 'react-hot-toast';
import { LogOut, RefreshCw } from 'lucide-react';
import axios from 'axios'; // Added axios import

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
    
    // 🧪 개발자 도구에서 테스트 함수 사용 가능하도록 설정
    if (typeof window !== 'undefined') {
      (window as any).testVariants = async () => {
        try {
          const result = await cafe24API.testProductsWithVariants();
          console.log('🧪 테스트 결과:', result);
          return result;
        } catch (error) {
          console.error('🧪 테스트 에러:', error);
          return null;
        }
      };
      console.log('🔧 개발자 도구에서 testVariants() 함수를 사용할 수 있습니다.');
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
      console.log('�� 상품 목록 로딩 시작...');
      const allProducts: Cafe24Product[] = [];
      const limit = 100;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        console.log(`📄 페이지 ${Math.floor(offset / limit) + 1} 조회 중... (offset: ${offset}, limit: ${limit})`);
        
        // 카테고리 77번과 variants 포함하여 조회 (캐시 방지)
        const timestamp = Date.now();
        const response = await axios.get(`/api/products?limit=${limit}&offset=${offset}&embed=variants&category=77&_t=${timestamp}`);
        const products = response.data.products || [];
        
        console.log(`✅ ${products.length}개 상품 조회 완료 (카테고리 77, variants 포함)`);
        
        if (products.length > 0) {
          allProducts.push(...products);
          offset += limit;
          
          // 더 가져올 상품이 있는지 확인 (100개 미만이면 마지막 페이지)
          hasMore = products.length === limit;
          
          // API 호출 간격 조절 (200ms 대기)
          if (hasMore) {
            console.log('⏳ 다음 페이지 호출 전 200ms 대기...');
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } else {
          hasMore = false;
        }
      }
      
      setProducts(allProducts);
      console.log(`✅ 총 ${allProducts.length}개 상품 로딩 완료 (카테고리 77, variants 포함)`);
    } catch (error) {
      console.error('❌ 상품 목록 조회 실패:', error);
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
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
               소펙스코리아 쇼핑몰 상품 관리 시스템
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
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <div className="text-center">
              <p className="text-gray-600 font-medium">상품 목록을 불러오는 중...</p>
              <p className="text-sm text-gray-500 mt-1">
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