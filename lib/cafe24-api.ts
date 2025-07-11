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
            'Authorization': `Basic ${btoa(`${process.env.CAFE24_CLIENT_ID || 'your_client_id'}:${process.env.CAFE24_CLIENT_SECRET || 'your_client_secret'}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const newToken: Cafe24Token = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || refreshToken,
        expires_at: Date.now() + (response.data.expires_in * 1000),
        token_type: response.data.token_type,
      };

      await saveToken(newToken);
      return newToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  }

  async getProducts(): Promise<Cafe24Product[]> {
    const token = await this.getValidToken();
    if (!token) {
      throw new Error('No valid token available');
    }

    try {
      const response = await axios.get(`${CAFE24_BASE_URL}/admin/products`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Cafe24-Api-Version': '2025-06-01',
        },
      });

      return response.data.products || [];
    } catch (error) {
      console.error('Failed to fetch products:', error);
      throw error;
    }
  }

  async updateProduct(productNo: number, updateData: Cafe24ProductUpdateRequest): Promise<any> {
    const token = await this.getValidToken();
    if (!token) {
      throw new Error('No valid token available');
    }

    try {
      const response = await axios.put(
        `${CAFE24_BASE_URL}/admin/products/${productNo}`,
        {
          shop_no: 1,
          request: updateData,
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Cafe24-Api-Version': '2025-06-01',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Failed to update product:', error);
      throw error;
    }
  }

  getAuthUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.CAFE24_CLIENT_ID || 'your_client_id',
      state: Math.random().toString(36).substring(7),
      redirect_uri: process.env.CAFE24_REDIRECT_URI || 'https://spx-price.vercel.app/api/auth/callback',
      scope: 'mall.read_product,mall.write_product,mall.read_category,mall.write_category',
    });

    return `${CAFE24_BASE_URL}/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<Cafe24Token | null> {
    try {
      const response = await axios.post(
        `${CAFE24_BASE_URL}/oauth/token`,
        `grant_type=authorization_code&code=${code}&redirect_uri=${process.env.CAFE24_REDIRECT_URI || 'https://spx-price.vercel.app/api/auth/callback'}`,
        {
          headers: {
            'Authorization': `Basic ${btoa(`${process.env.CAFE24_CLIENT_ID || 'your_client_id'}:${process.env.CAFE24_CLIENT_SECRET || 'your_client_secret'}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const token: Cafe24Token = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_at: Date.now() + (response.data.expires_in * 1000),
        token_type: response.data.token_type,
      };

      await saveToken(token);
      return token;
    } catch (error) {
      console.error('Failed to exchange code for token:', error);
      return null;
    }
  }
}

export const cafe24API = new Cafe24API(); 