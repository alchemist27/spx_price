import axios from 'axios';
import { getToken, saveToken, updateToken, isTokenExpired, Cafe24Token } from './firebase';

export interface Cafe24Product {
  shop_no: number;
  product_no: number;
  product_code: string;
  custom_product_code: string;
  product_name: string;
  eng_product_name: string;
  supply_product_name: string;
  internal_product_name: string;
  model_name: string;
  price_excluding_tax: string;
  price: string;
  retail_price: string;
  supply_price: string;
  display: string;
  selling: string;
  product_condition: string;
  product_used_month: number;
  summary_description: string;
  margin_rate: string;
  tax_calculation: string;
  tax_type: string;
  tax_rate: number;
  price_content: string | null;
  detail_image: string;
  list_image: string;
  tiny_image: string;
  small_image: string;
  created_date: string;
  updated_date: string;
  sold_out: string;
  additional_price: string;
  clearance_category_eng: string | null;
  clearance_category_kor: string | null;
  clearance_category_code: string | null;
  exposure_limit_type: string;
  exposure_group_list: number[];
  variants?: Array<{
    additional_amount: string;
    custom_variant_code: string;
    display: string;
    display_soldout: string;
    image: string;
    important_inventory: string;
    inventory_control_type: string;
    options: Array<any>;
    quantity: number;
    safety_inventory: number;
    selling: string;
    shop_no: number;
    use_inventory: string;
    variant_code: string;
  }>;
}

export interface Cafe24ProductUpdateRequest {
  display?: string;
  selling?: string;
  product_condition?: string;
  product_used_month?: number;
  custom_product_code?: string;
  product_name?: string;
  eng_product_name?: string;
  supply_product_name?: string;
  internal_product_name?: string;
  model_name?: string;
  price?: string;
  retail_price?: string;
  supply_price?: string;
  soldout_message?: string;
  use_naverpay?: string;
  naverpay_type?: string;
  use_kakaopay?: string;
  manufacturer_code?: string;
  supplier_code?: string;
  brand_code?: string;
  trend_code?: string;
  product_weight?: string;
  price_content?: string;
  summary_description?: string;
  simple_description?: string;
  additional_price?: string;
  margin_rate?: string;
  tax_type?: string;
  tax_rate?: number;
}

const CAFE24_BASE_URL = `https://sopexkorea.cafe24api.com/api/v2`;

class Cafe24API {
  private async getValidToken(): Promise<string | null> {
    const token = await getToken();
    if (!token) return null;

    if (isTokenExpired(token)) {
      // 토큰이 만료되었으면 갱신 시도
      const refreshed = await this.refreshToken(token.refresh_token);
      if (!refreshed) return null;
      return refreshed.access_token;
    }

    return token.access_token;
  }

  private async refreshToken(refreshToken: string): Promise<Cafe24Token | null> {
    try {
      const response = await axios.post(
        `${CAFE24_BASE_URL}/oauth/token`,
        `grant_type=refresh_token&refresh_token=${refreshToken}`,
        {
          headers: {
            'Authorization': `Basic ${btoa(`${process.env.NEXT_PUBLIC_CAFE24_CLIENT_ID || 'your_client_id'}:${process.env.NEXT_PUBLIC_CAFE24_CLIENT_SECRET || 'your_client_secret'}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const expiresIn = response.data.expires_in || 3600; // 기본값: 1시간
      const newToken: Cafe24Token = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || refreshToken,
        expires_at: Date.now() + (expiresIn * 1000),
        token_type: response.data.token_type || 'Bearer', // 기본값: Bearer
      };

      await saveToken(newToken);
      return newToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  }

  async getProducts(): Promise<Cafe24Product[]> {
    try {
      console.log('📦 전체 상품 목록 조회 시작 (페이지네이션)');
      
      const allProducts: Cafe24Product[] = [];
      const limit = 100; // 최대 100개씩
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        console.log(`📄 페이지 ${Math.floor(offset / limit) + 1} 조회 중... (offset: ${offset}, limit: ${limit})`);
        
        const response = await axios.get(`/api/products?limit=${limit}&offset=${offset}`);
        const products = response.data.products || [];
        
        console.log(`✅ ${products.length}개 상품 조회 완료`);
        
        if (products.length > 0) {
          allProducts.push(...products);
          offset += limit;
          
          // 더 가져올 상품이 있는지 확인 (100개 미만이면 마지막 페이지)
          hasMore = products.length === limit;
          
          // API 호출 간격 조절 (500ms 대기)
          if (hasMore) {
            console.log('⏳ 다음 페이지 호출 전 500ms 대기...');
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } else {
          hasMore = false;
        }
      }
      
      console.log('✅ 전체 상품 목록 조회 완료:', {
        totalProducts: allProducts.length,
        totalPages: Math.ceil(allProducts.length / limit)
      });

      // 🔍 노출 그룹 디버깅 정보 출력
      console.log('🔍 === 노출 그룹 디버깅 정보 ===');
      
      const exposureGroupStats = new Map<string, number>();
      const exposureLimitTypeStats = new Map<string, number>();
      const sampleProducts: any[] = [];
      
      allProducts.forEach((product, index) => {
        // exposure_limit_type 통계
        const limitType = product.exposure_limit_type || 'undefined';
        exposureLimitTypeStats.set(limitType, (exposureLimitTypeStats.get(limitType) || 0) + 1);
        
        // exposure_group_list 통계
        if (product.exposure_group_list && product.exposure_group_list.length > 0) {
          product.exposure_group_list.forEach(groupId => {
            exposureGroupStats.set(groupId.toString(), (exposureGroupStats.get(groupId.toString()) || 0) + 1);
          });
          
          // 처음 몇 개 상품의 샘플 데이터 수집
          if (sampleProducts.length < 10) {
            sampleProducts.push({
              product_no: product.product_no,
              product_name: product.product_name.substring(0, 30) + '...',
              exposure_limit_type: product.exposure_limit_type,
              exposure_group_list: product.exposure_group_list
            });
          }
        } else {
          // 그룹이 없는 상품도 샘플에 포함
          if (sampleProducts.length < 10) {
            sampleProducts.push({
              product_no: product.product_no,
              product_name: product.product_name.substring(0, 30) + '...',
              exposure_limit_type: product.exposure_limit_type,
              exposure_group_list: product.exposure_group_list || '없음'
            });
          }
        }
      });
      
      console.log('📊 노출 제한 타입별 상품 수:', Object.fromEntries(exposureLimitTypeStats));
      console.log('📊 노출 그룹별 상품 수:', Object.fromEntries(exposureGroupStats));
      console.log('📝 상품 샘플 (처음 10개):', sampleProducts);
      
      // 실제로 존재하는 그룹 번호들 출력
      const existingGroups = Array.from(exposureGroupStats.keys()).sort((a, b) => parseInt(a) - parseInt(b));
      console.log('🎯 실제 존재하는 노출 그룹 번호들:', existingGroups);
      
      console.log('🔍 === 디버깅 정보 끝 ===');

      return allProducts;
    } catch (error) {
      console.error('❌ 상품 목록 조회 실패:', error);
      throw error;
    }
  }

  // 🧪 variants embed 테스트 함수 (콘솔에서 실행용)
  async testProductsWithVariants(): Promise<any> {
    try {
      console.log('🧪 === Variants Embed 테스트 시작 ===');
      
      // 2개 상품만 조회하고 variants를 embed로 포함
      const response = await axios.get('/api/products?limit=2&embed=variants');
      
      console.log('✅ Variants 포함 상품 조회 성공:', {
        productCount: response.data.products?.length || 0,
        hasVariants: response.data.products?.some((p: any) => p.variants) || false
      });
      
      // 상품별 variants 정보 출력
      response.data.products?.forEach((product: any, index: number) => {
        console.log(`📦 상품 ${index + 1}:`, {
          product_no: product.product_no,
          product_name: product.product_name.substring(0, 30) + '...',
          variants_count: product.variants?.length || 0,
          variants: product.variants || '없음'
        });
        
        // variants가 있다면 상세 정보 출력
        if (product.variants && product.variants.length > 0) {
          console.log(`🔍 ${product.product_name} 의 Variants:`, product.variants);
        }
      });
      
      console.log('🧪 === Variants Embed 테스트 완료 ===');
      return response.data;
      
    } catch (error) {
      console.error('❌ Variants 테스트 실패:', error);
      if (axios.isAxiosError(error)) {
        console.error('API 에러 상세:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
      }
      throw error;
    }
  }

  async updateProduct(productNo: number, updateData: Cafe24ProductUpdateRequest): Promise<any> {
    try {
      console.log('🔄 상품 업데이트 시작 (API 라우터 사용):', { productNo });
      
      const response = await axios.put(`/api/products/${productNo}`, updateData);
      
      console.log('✅ 상품 업데이트 성공:', { productNo });

      return response.data;
    } catch (error) {
      console.error('❌ 상품 업데이트 실패:', error);
      throw error;
    }
  }

  getAuthUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.NEXT_PUBLIC_CAFE24_CLIENT_ID || 'your_client_id',
      state: Math.random().toString(36).substring(7),
      redirect_uri: process.env.NEXT_PUBLIC_CAFE24_REDIRECT_URI || 'https://spx-price.vercel.app/api/auth/callback',
      scope: 'mall.read_product,mall.write_product,mall.read_category,mall.write_category',
    });

    return `${CAFE24_BASE_URL}/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<Cafe24Token | null> {
    try {
      console.log('🔄 토큰 교환 시작:', { code: code.substring(0, 10) + '...' });
      
      const response = await axios.post(
        `${CAFE24_BASE_URL}/oauth/token`,
        `grant_type=authorization_code&code=${code}&redirect_uri=${process.env.NEXT_PUBLIC_CAFE24_REDIRECT_URI || 'https://spx-price.vercel.app/api/auth/callback'}`,
        {
          headers: {
            'Authorization': `Basic ${btoa(`${process.env.NEXT_PUBLIC_CAFE24_CLIENT_ID || 'your_client_id'}:${process.env.NEXT_PUBLIC_CAFE24_CLIENT_SECRET || 'your_client_secret'}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      console.log('✅ 카페24 API 응답 성공:', { 
        status: response.status,
        hasAccessToken: !!response.data.access_token,
        hasRefreshToken: !!response.data.refresh_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type
      });

      const expiresIn = response.data.expires_in || 3600; // 기본값: 1시간
      const token: Cafe24Token = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_at: Date.now() + (expiresIn * 1000),
        token_type: response.data.token_type || 'Bearer', // 기본값: Bearer
      };
      
      console.log('📅 토큰 만료 시간 계산:', {
        expiresIn: expiresIn,
        expiresAt: new Date(token.expires_at).toISOString(),
        currentTime: new Date().toISOString()
      });

      console.log('💾 Firestore에 토큰 저장 시도...');
      const saveResult = await saveToken(token);
      
      if (saveResult) {
        console.log('✅ 토큰 저장 성공');
      } else {
        console.error('❌ 토큰 저장 실패');
      }

      return token;
    } catch (error) {
      console.error('❌ 토큰 교환 실패:', error);
      if (axios.isAxiosError(error)) {
        console.error('API 에러 상세:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
      }
      return null;
    }
  }
}

export const cafe24API = new Cafe24API(); 