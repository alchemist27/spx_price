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
      console.log('📦 상품 목록 조회 시작 (API 라우터 사용)');
      
      const response = await axios.get('/api/products');
      
      console.log('✅ 상품 목록 조회 성공:', {
        productCount: response.data.products?.length || 0
      });

      return response.data.products || [];
    } catch (error) {
      console.error('❌ 상품 목록 조회 실패:', error);
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