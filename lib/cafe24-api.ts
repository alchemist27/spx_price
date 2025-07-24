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
  category: Array<{
    category_no: number;
    category_name: string;
    category_depth: number;
    parent_category_no: number;
    category_path: string;
  }> | null;
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
      const allProducts: Cafe24Product[] = [];
      const limit = 100;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const response = await axios.get(`/api/products?limit=${limit}&offset=${offset}`);
        const products = response.data.products || [];
        
        if (products.length > 0) {
          allProducts.push(...products);
          offset += limit;
          hasMore = products.length === limit;
          
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } else {
          hasMore = false;
        }
      }

      return allProducts;
    } catch (error) {
      console.error('상품 목록 조회 실패:', error);
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

  // 상품 상세 정보 조회 (옵션 포함)
  async getProductDetail(productNo: number): Promise<any> {
    try {
      
      const response = await axios.get(`/api/products/${productNo}?embed=options`);
      
      return response.data;
    } catch (error) {
      console.error(`❌ 상품 상세 정보 조회 실패: 상품 ${productNo}`, error);
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

  // 상품 옵션 업데이트
  async updateProductOptions(productNo: number, optionsData: {
    original_options?: Array<{
      option_name: string;
      option_value: Array<{
        option_text: string;
      }>;
    }>;
    options: Array<{
      option_name: string;
      option_value: Array<{
        option_text: string;
      }>;
    }>;
  }): Promise<any> {
    console.log(`🔧 옵션 업데이트 시작: 상품 ${productNo} (API 라우터 사용)`);

    try {
      const response = await axios.put(
        `/api/products/${productNo}/options`,
        optionsData
      );

      console.log(`✅ 옵션 업데이트 성공: 상품 ${productNo}`);
      console.log(`📋 응답 데이터:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`❌ 옵션 업데이트 실패: 상품 ${productNo}`, error);
      if (axios.isAxiosError(error)) {
        console.error('📋 API 에러 상세:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            data: error.config?.data
          }
        });
      }
      throw error;
    }
  }

  // 상품 variant 업데이트
  async updateProductVariant(productNo: number, variantCode: string, variantData: {
    additional_amount: string;
    display?: string;
    selling?: string;
  }): Promise<any> {
    console.log(`🔧 Variant 업데이트 시작: 상품 ${productNo}, Variant ${variantCode} (API 라우터 사용)`);
    console.log(`📝 Variant 데이터:`, JSON.stringify(variantData, null, 2));

    try {
      const response = await axios.put(
        `/api/products/${productNo}/variants/${variantCode}`,
        variantData
      );

      console.log(`✅ Variant 업데이트 성공: 상품 ${productNo}, Variant ${variantCode}`);
      console.log(`📋 응답 데이터:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`❌ Variant 업데이트 실패: 상품 ${productNo}, Variant ${variantCode}`, error);
      if (axios.isAxiosError(error)) {
        console.error('📋 API 에러 상세:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            data: error.config?.data
          }
        });
      }
      throw error;
    }
  }
}

export const cafe24API = new Cafe24API(); 