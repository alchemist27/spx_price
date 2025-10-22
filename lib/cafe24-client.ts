// 클라이언트 사이드 전용 Cafe24 유틸리티
const CAFE24_BASE_URL = `https://sopexkorea.cafe24api.com/api/v2`;

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.NEXT_PUBLIC_CAFE24_CLIENT_ID || 'your_client_id',
    state: Math.random().toString(36).substring(7),
    redirect_uri: process.env.NEXT_PUBLIC_CAFE24_REDIRECT_URI || 'https://spx-price.vercel.app/api/auth/callback',
    scope: 'mall.read_product,mall.write_product,mall.read_category,mall.write_category,mall.read_order,mall.write_order,mall.read_notification,mall.write_notification,mall.read_shipping,mall.write_shipping',
  });

  return `${CAFE24_BASE_URL}/oauth/authorize?${params.toString()}`;
}

// Type export
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
    variant_code: string;
    options?: Array<{
      option_name: string;
      option_value: string;
    }>;
  }>;
}
