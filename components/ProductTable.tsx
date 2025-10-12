'use client';

import { useState, useMemo } from 'react';
import { Cafe24Product, Cafe24ProductUpdateRequest } from '@/lib/cafe24-api';
import { cafe24API } from '@/lib/cafe24-api';
import toast from 'react-hot-toast';
import { Search, Edit, Save, X, ChevronUp, ChevronDown } from 'lucide-react';

import React from 'react'; // Added missing import

interface ProductTableProps {
  products: Cafe24Product[];
  onProductsUpdate: () => void;
}

// 카페24 노출 그룹 정의 (실제 데이터 기반)
const EXPOSURE_GROUPS = {
  'all': { name: '전체', description: '모든 상품' },
  'public': { name: '모두공개', description: '제한 없음' },
  '1': { name: '1그룹', description: '1등급 회원 전용' },
  '8': { name: 'S그룹', description: 'S 등급 회원 전용' },
  '9': { name: 'O그룹', description: 'O 등급 회원 전용' },
  '10': { name: 'P그룹', description: 'P 등급 회원 전용' },
  '11': { name: 'E그룹', description: 'E 등급 회원 전용' },
};

type SortField = 'product_no' | 'product_code' | 'product_name' | 'price' | 'supply_price' | 'display' | 'selling' | 'updated_date';
type SortDirection = 'asc' | 'desc';

export default function ProductTable({ products, onProductsUpdate }: ProductTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [editingProduct, setEditingProduct] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Cafe24ProductUpdateRequest>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isPriceEditMode, setIsPriceEditMode] = useState(false);
  const [priceEditForms, setPriceEditForms] = useState<Record<number, {
    supply_price: string;
    unit_price_2nd: string; // 2차가격 1kg당 단가
    unit_price_3rd: string; // 3차가격 1kg당 단가
    // 자동 계산되는 값들
    price_1kg: string; // 공급가 기반으로 자동 계산
    price_2nd_total: string; // 2차가격 총액
    price_3rd_total: string; // 3차가격 총액
    additional_amount_2nd: string; // 2차 추가금액
    additional_amount_3rd: string; // 3차 추가금액
  }>>({});
  const [sortField, setSortField] = useState<SortField>('product_no');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // 5kg/20kg 단가 자동 적용 기능
  const [autoApplySettings, setAutoApplySettings] = useState({
    amount5kg: '300',
    amount20kg: '600'
  });
  
  // 가격 저장 진행률 상태
  const [saveProgress, setSaveProgress] = useState(0);
  const [totalSaveSteps, setTotalSaveSteps] = useState(0);
  const [completedProducts, setCompletedProducts] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [saveStartTime, setSaveStartTime] = useState<Date | null>(null);

  // 상품 데이터 로딩 완료 (로그 제거로 성능 최적화)

  // 상품에서 노출 그룹 추출 및 탭 생성
  const availableTabs = useMemo(() => {
    const groupSet = new Set<string>();
    groupSet.add('all'); // 전체 탭은 항상 포함
    
    products.forEach(product => {
      if (product.exposure_limit_type === 'M' && product.exposure_group_list && product.exposure_group_list.length > 0) {
        // 회원 그룹별 제한이 있는 경우
        product.exposure_group_list.forEach(groupId => {
          groupSet.add(groupId.toString());
        });
      } else {
        // 제한이 없는 경우 (모두공개)
        groupSet.add('public');
      }
    });

    const tabs = Array.from(groupSet).sort((a, b) => {
      if (a === 'all') return -1;
      if (b === 'all') return 1;
      if (a === 'public') return -1;
      if (b === 'public') return 1;
      return parseInt(a) - parseInt(b);
    });
    
    return tabs;
  }, [products]);

  // 탭별 상품 필터링
  const tabFilteredProducts = useMemo(() => {
    if (activeTab === 'all') {
      return products;
    } else if (activeTab === 'public') {
      return products.filter(product => 
        product.exposure_limit_type !== 'M' || 
        !product.exposure_group_list || 
        product.exposure_group_list.length === 0
      );
    } else {
      return products.filter(product => 
        product.exposure_limit_type === 'M' && 
        product.exposure_group_list && 
        product.exposure_group_list.includes(parseInt(activeTab))
      );
    }
  }, [products, activeTab]);

  // 제외된 상품 통계 계산
  const excludedStats = useMemo(() => {
    const saleProducts = tabFilteredProducts.filter(p => p.product_name.includes('[SALE]'));
    const sampleProducts = tabFilteredProducts.filter(p => p.product_name.includes('[SAMPLE]'));
    return {
      sale: saleProducts.length,
      sample: sampleProducts.length,
      total: saleProducts.length + sampleProducts.length
    };
  }, [tabFilteredProducts]);

  // 검색 적용 (표시/판매 필터 제거)
  const filteredProducts = useMemo(() => {
    return tabFilteredProducts.filter(product => {
      // [SALE] 또는 [SAMPLE] 태그가 포함된 상품 제외
      if (product.product_name.includes('[SALE]') || product.product_name.includes('[SAMPLE]')) {
        return false;
      }

      const matchesSearch =
        product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.model_name.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesSearch;
    });
  }, [tabFilteredProducts, searchTerm]);

  // 정렬 적용
  const sortedProducts = useMemo(() => {
    const sorted = [...filteredProducts].sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      // 숫자 필드 처리
      if (sortField === 'product_no') {
        aValue = Number(aValue);
        bValue = Number(bValue);
      } else if (sortField === 'price' || sortField === 'supply_price') {
        aValue = parseFloat(aValue) || 0;
        bValue = parseFloat(bValue) || 0;
      } else if (sortField === 'updated_date') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      } else {
        // 문자열 필드 처리
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
      }

      if (aValue < bValue) {
        return sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  }, [filteredProducts, sortField, sortDirection]);

  // 편집 모드에서 탭 변경 시 새로운 상품들의 폼 데이터 추가
  React.useEffect(() => {
    if (isPriceEditMode && sortedProducts.length > 0) {
      setPriceEditForms(prev => {
        const newForms = { ...prev };
        let hasNewProducts = false;
        
        sortedProducts.forEach(product => {
          if (!newForms[product.product_no]) {
            hasNewProducts = true;
            const variantPrices = calculateVariantPrices(product);
            const supplyPrice = parseFloat(product.supply_price);
            
            // 특정 상품코드들은 1kg, 4kg, 15kg 단위 사용
            const specialProductCodes = ['P00000PN', 'P0000BIB', 'P0000BHX', 'P0000BHW', 'P0000BHV', 'P00000YR'];
            const isSpecialProduct = specialProductCodes.includes(product.product_code);
            const secondUnit = isSpecialProduct ? 4 : 5;
            const thirdUnit = isSpecialProduct ? 15 : 20;
            
            // 현재 단가들 계산
            const unitPrice2nd = variantPrices.unitPrice2nd || supplyPrice;
            const unitPrice3rd = variantPrices.unitPrice3rd || supplyPrice;
            
            newForms[product.product_no] = {
              supply_price: product.supply_price || '0',
              unit_price_2nd: unitPrice2nd.toString(),
              unit_price_3rd: unitPrice3rd.toString(),
              // 자동 계산 값들
              price_1kg: supplyPrice.toString(),
              price_2nd_total: (unitPrice2nd * secondUnit).toString(),
              price_3rd_total: (unitPrice3rd * thirdUnit).toString(),
              additional_amount_2nd: ((unitPrice2nd * secondUnit) - supplyPrice).toString(),
              additional_amount_3rd: ((unitPrice3rd * thirdUnit) - supplyPrice).toString()
            };
          }
        });
        
        // 새로운 상품의 폼 데이터 생성 완료
        
        return hasNewProducts ? newForms : prev;
      });
    }
  }, [isPriceEditMode, sortedProducts]);

  // 편집 모드에서 폼 데이터 누락 체크
  const missingFormData = React.useMemo(() => {
    if (!isPriceEditMode) return [];
    return sortedProducts.filter(product => !priceEditForms[product.product_no]);
  }, [isPriceEditMode, sortedProducts, priceEditForms]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // 같은 필드를 클릭하면 정렬 방향 변경
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // 다른 필드를 클릭하면 해당 필드로 오름차순 정렬
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleEdit = (product: Cafe24Product) => {
    setEditingProduct(product.product_no);
    setEditForm({
      product_name: product.product_name,
      price: product.price,
      supply_price: product.supply_price,
      display: product.display,
      selling: product.selling,
    });
  };

  const handleSave = async (productNo: number) => {
    setIsLoading(true);
    try {
      await cafe24API.updateProduct(productNo, editForm);
      toast.success('상품이 성공적으로 업데이트되었습니다.');
      setEditingProduct(null);
      setEditForm({});
      onProductsUpdate();
    } catch (error) {
      console.error('Failed to update product:', error);
      toast.error('상품 업데이트에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setEditingProduct(null);
    setEditForm({});
  };

  // 가격 수정 모드 토글
  const togglePriceEditMode = () => {
    if (isPriceEditMode) {
      // 편집 모드 종료 시 폼 초기화
      setPriceEditForms({});
    } else {
      // 편집 모드 시작 시 현재 가격들로 폼 초기화
      const initialForms: Record<number, any> = {};
      sortedProducts.forEach(product => {
        const variantPrices = calculateVariantPrices(product);
        const supplyPrice = parseFloat(product.supply_price);
        
        // 특정 상품코드들은 1kg, 4kg, 15kg 단위 사용
        const specialProductCodes = ['P00000PN', 'P0000BIB', 'P0000BHX', 'P0000BHW', 'P0000BHV', 'P00000YR'];
        const isSpecialProduct = specialProductCodes.includes(product.product_code);
        const secondUnit = isSpecialProduct ? 4 : 5;
        const thirdUnit = isSpecialProduct ? 15 : 20;
        
        // 현재 단가들 계산
        const unitPrice2nd = variantPrices.unitPrice2nd || supplyPrice;
        const unitPrice3rd = variantPrices.unitPrice3rd || supplyPrice;
        
        initialForms[product.product_no] = {
          supply_price: product.supply_price || '0',
          unit_price_2nd: unitPrice2nd.toString(),
          unit_price_3rd: unitPrice3rd.toString(),
          // 자동 계산 값들
          price_1kg: supplyPrice.toString(),
          price_2nd_total: (unitPrice2nd * secondUnit).toString(),
          price_3rd_total: (unitPrice3rd * thirdUnit).toString(),
          additional_amount_2nd: ((unitPrice2nd * secondUnit) - supplyPrice).toString(),
          additional_amount_3rd: ((unitPrice3rd * thirdUnit) - supplyPrice).toString()
        };
      });
      setPriceEditForms(initialForms);
    }
    setIsPriceEditMode(!isPriceEditMode);
  };

  // 개별 가격 폼 업데이트 (자동 계산 포함)
  const updatePriceForm = (productNo: number, field: string, value: string) => {
    const product = sortedProducts.find(p => p.product_no === productNo);
    if (!product) return;

    // 입력값에서 쉼표 제거 (사용자가 쉼표를 입력할 수 있음)
    const cleanValue = value.replace(/,/g, '');

    // 특정 상품코드들은 1kg, 4kg, 15kg 단위 사용
    const specialProductCodes = ['P00000PN', 'P0000BIB', 'P0000BHX', 'P0000BHW', 'P0000BHV', 'P00000YR'];
    const isSpecialProduct = specialProductCodes.includes(product.product_code);
    const secondUnit = isSpecialProduct ? 4 : 5;
    const thirdUnit = isSpecialProduct ? 15 : 20;

    setPriceEditForms(prev => {
      const currentForm = prev[productNo] || {};
      const updatedForm = { ...currentForm, [field]: cleanValue };

      // 자동 계산 로직
      if (field === 'supply_price') {
        // 2) 공급가 변경시 1kg 단가 자동 변경
        const supplyPrice = parseFloat(cleanValue) || 0;
        updatedForm.price_1kg = supplyPrice.toString();
        
        // 추가금액들도 재계산
        const unitPrice2nd = parseFloat(updatedForm.unit_price_2nd.replace(/,/g, '')) || supplyPrice;
        const unitPrice3rd = parseFloat(updatedForm.unit_price_3rd.replace(/,/g, '')) || supplyPrice;
        
        updatedForm.price_2nd_total = (unitPrice2nd * secondUnit).toString();
        updatedForm.price_3rd_total = (unitPrice3rd * thirdUnit).toString();
        updatedForm.additional_amount_2nd = ((unitPrice2nd * secondUnit) - supplyPrice).toString();
        updatedForm.additional_amount_3rd = ((unitPrice3rd * thirdUnit) - supplyPrice).toString();
        
      } else if (field === 'unit_price_2nd') {
        // 3) 2차가격 1kg당 단가 변경시 자동 계산
        const unitPrice2nd = parseFloat(cleanValue) || 0;
        const supplyPrice = parseFloat(updatedForm.supply_price.replace(/,/g, '')) || 0;
        
        updatedForm.price_2nd_total = (unitPrice2nd * secondUnit).toString();
        updatedForm.additional_amount_2nd = ((unitPrice2nd * secondUnit) - supplyPrice).toString();
        
      } else if (field === 'unit_price_3rd') {
        // 4) 3차가격 1kg당 단가 변경시 자동 계산
        const unitPrice3rd = parseFloat(cleanValue) || 0;
        const supplyPrice = parseFloat(updatedForm.supply_price.replace(/,/g, '')) || 0;
        
        updatedForm.price_3rd_total = (unitPrice3rd * thirdUnit).toString();
        updatedForm.additional_amount_3rd = ((unitPrice3rd * thirdUnit) - supplyPrice).toString();
      }

      return {
        ...prev,
        [productNo]: updatedForm
      };
    });
  };

  // 5kg/20kg 단가 자동 적용 함수
  const applyAutoPrice = (productNo: number, unitType: '5kg' | '20kg') => {
    const product = sortedProducts.find(p => p.product_no === productNo);
    if (!product || !priceEditForms[productNo]) return;

    const formData = priceEditForms[productNo];
    const supplyPrice = parseFloat(formData.supply_price.replace(/,/g, '')) || 0;
    const deductionAmount = unitType === '5kg' ? 
      parseFloat(autoApplySettings.amount5kg) : 
      parseFloat(autoApplySettings.amount20kg);
    
    // 특정 상품코드들은 1kg, 4kg, 15kg 단위 사용
    const specialProductCodes = ['P00000PN', 'P0000BIB', 'P0000BHX', 'P0000BHW', 'P0000BHV', 'P00000YR'];
    const isSpecialProduct = specialProductCodes.includes(product.product_code);
    
    // 적용할 단위 및 필드 결정
    const is5kgUnit = unitType === '5kg';
    const actualUnit = is5kgUnit ? (isSpecialProduct ? 4 : 5) : (isSpecialProduct ? 15 : 20);
    const fieldName = is5kgUnit ? 'unit_price_2nd' : 'unit_price_3rd';
    
    // 계산: 공급가에서 차감된 금액을 kg당 단가로 설정
    const newUnitPrice = supplyPrice - deductionAmount;
    
    if (newUnitPrice < 0) {
      toast.error(`계산된 단가가 음수입니다. 공급가(${formatPrice(supplyPrice.toString())})보다 작은 차감액을 입력해주세요.`);
      return;
    }

    // 폼 업데이트 (자동 계산 로직이 포함된 updatePriceForm 사용)
    updatePriceForm(productNo, fieldName, newUnitPrice.toString());
    
    toast.success(`${actualUnit}kg 단가가 적용되었습니다: ${formatPrice(newUnitPrice.toString())}/kg`);
  };

  // 숫자 문자열에서 쉼표 제거 및 소수점 형식 보장
  const sanitizePrice = (priceStr: string): string => {
    if (!priceStr || priceStr.trim() === '') return '0.00';
    
    // 쉼표와 공백 제거 후 숫자로 변환
    const cleanStr = priceStr.replace(/[,\s]/g, '');
    const cleanNumber = parseFloat(cleanStr);
    
    // 유효하지 않은 숫자인 경우 0으로 처리
    if (isNaN(cleanNumber) || !isFinite(cleanNumber)) {
      console.warn(`유효하지 않은 가격 값: "${priceStr}" → 0.00으로 변환`);
      return '0.00';
    }
    
    // 음수인 경우 경고 (추가금액은 음수일 수 있으므로 허용)
    if (cleanNumber < 0) {
      console.warn(`음수 가격 값: "${priceStr}" → 그대로 사용`);
    }
    
    // 소수점 2자리 문자열로 변환 (카페24 API 형식)
    return cleanNumber.toFixed(2);
  };

  // 전체 가격 저장
  const saveAllPrices = async () => {
    setIsLoading(true);
    setSaveProgress(0);
    setSaveStartTime(new Date()); // 시작 시간 기록
    let successCount = 0;
    let errorCount = 0;

    // 실제로 가격이 변경된 상품만 필터링
    const getChangedProducts = () => {
      return sortedProducts.filter(product => {
        const formData = priceEditForms[product.product_no];
        if (!formData) return false;

        // 원본 데이터와 현재 폼 데이터 비교 (소수점 2자리 정밀도)
        const originalSupplyPrice = parseFloat(product.supply_price || '0');
        const formSupplyPrice = parseFloat(formData.supply_price.replace(/,/g, '') || '0');
        
        const originalUnitPrice2nd = parseFloat(product.variants?.[1]?.additional_amount || '0') + originalSupplyPrice;
        const formUnitPrice2nd = parseFloat(formData.unit_price_2nd.replace(/,/g, '') || '0');
        
        const originalUnitPrice3rd = parseFloat(product.variants?.[2]?.additional_amount || '0') + originalSupplyPrice;
        const formUnitPrice3rd = parseFloat(formData.unit_price_3rd.replace(/,/g, '') || '0');

        // 0.01 허용 오차로 비교 (부동소수점 정밀도 문제 해결)
        const hasSupplyPriceChange = Math.abs(originalSupplyPrice - formSupplyPrice) > 0.01;
        const hasUnitPrice2ndChange = Math.abs(originalUnitPrice2nd - formUnitPrice2nd) > 0.01;
        const hasUnitPrice3rdChange = Math.abs(originalUnitPrice3rd - formUnitPrice3rd) > 0.01;

        return hasSupplyPriceChange || hasUnitPrice2ndChange || hasUnitPrice3rdChange;
      });
    };

    const allowedProducts = getChangedProducts();
    
    if (allowedProducts.length === 0) {
      toast.error('변경된 가격이 없습니다. 가격을 수정한 후 다시 시도해주세요.');
      setIsLoading(false);
      return;
    }

    const changedProductCodes = allowedProducts.map(p => p.product_code).join(', ');
    console.log(`변경된 상품: ${changedProductCodes}`);

    // 각 상품당 4단계 (기본가격, 옵션명, 2차variant, 3차variant) = 총 steps 계산
    const stepsPerProduct = 4;
    const totalSteps = allowedProducts.length * stepsPerProduct;
    setTotalSaveSteps(totalSteps);
    setTotalProducts(allowedProducts.length);
    setCompletedProducts(0);
    
    console.log(`시작: ${allowedProducts.length}개 상품 가격 업데이트 (변경된 상품만)`);

    try {
      let currentStep = 0;
      
      for (const product of allowedProducts) {
        const formData = priceEditForms[product.product_no];
        if (!formData) continue;

        // 상품 처리 시작 (로그 최소화)
        const productIndex = allowedProducts.indexOf(product) + 1;

        try {
          // 가격 데이터 정리 (쉼표 제거, 소수점 형식 보장)
          const cleanPrice1kg = sanitizePrice(formData.price_1kg);
          const cleanSupplyPrice = sanitizePrice(formData.supply_price);
          const cleanAdditionalAmount2nd = sanitizePrice(formData.additional_amount_2nd);
          const cleanAdditionalAmount3rd = sanitizePrice(formData.additional_amount_3rd);

          // 특정 상품코드들은 1kg, 4kg, 15kg 단위 사용
          const specialProductCodes = ['P00000PN', 'P0000BIB', 'P0000BHX', 'P0000BHW', 'P0000BHV', 'P00000YR'];
          const isSpecialProduct = specialProductCodes.includes(product.product_code);
          const secondUnit = isSpecialProduct ? 4 : 5;
          const thirdUnit = isSpecialProduct ? 15 : 20;
          
          const price1kg = parseFloat(cleanPrice1kg);
          const unitPrice2nd = parseFloat(formData.unit_price_2nd.replace(/,/g, '')) || price1kg;
          const unitPrice3rd = parseFloat(formData.unit_price_3rd.replace(/,/g, '')) || price1kg;
          
          const option1kg = `1kg(${Math.round(price1kg)}원)`;
          const option2nd = `${secondUnit}kg(${Math.round(unitPrice2nd)}원)`;
          const option3rd = `${thirdUnit}kg(${Math.round(unitPrice3rd)}원)`;

          // 5-1) 기본 가격과 공급가 업데이트
          await cafe24API.updateProduct(product.product_no, {
            price: cleanPrice1kg,
            supply_price: cleanSupplyPrice
          });
          
          // 진행률 업데이트 (1/4 단계 완료)
          currentStep++;
          const progress = Math.round((currentStep / totalSteps) * 100);
          setSaveProgress(progress);
          // API 호출 간격 조절 (1초 대기)
          await new Promise(resolve => setTimeout(resolve, 1000));

          // 5-2) 기존 옵션 정보 조회 후 옵션명 업데이트
          const productDetail = await cafe24API.getProductDetail(product.product_no);
          
          const optionsInfo = productDetail.product?.options;
          const currentOptions = optionsInfo?.options || [];
          
          // API 호출 간격 조절 (1초 대기)
          await new Promise(resolve => setTimeout(resolve, 1000));

          // original_options 구성 (기존 옵션 구조 완전 복사)
          const originalOptions = currentOptions.map((option: any) => ({
            option_name: option.option_name,
            option_value: option.option_value.map((value: any) => ({
              option_text: value.option_text
            }))
          }));

          // 새로운 옵션 구조 (기존 속성들 모두 보존)
          const existingOptionName = currentOptions.length > 0 ? currentOptions[0].option_name : "용량";
          const existingOption = currentOptions.length > 0 ? currentOptions[0] : null;
          
          const newOptions = [
            {
              option_name: existingOptionName,
              option_value: [
                { option_text: option1kg },
                { option_text: option2nd },
                { option_text: option3rd }
              ],
              // 기존 옵션의 중요 속성들 보존
              option_display_type: existingOption?.option_display_type || "R",
              required_option: existingOption?.required_option || "T",
              option_code: existingOption?.option_code || ""
            }
          ];

          const optionsData = {
            original_options: originalOptions,
            options: newOptions
          };

          await cafe24API.updateProductOptions(product.product_no, optionsData);
          
          // 진행률 업데이트 (2/4 단계 완료)
          currentStep++;
          const progress2 = Math.round((currentStep / totalSteps) * 100);
          setSaveProgress(progress2);
          
          // API 호출 간격 조절 (1초 대기)
          await new Promise(resolve => setTimeout(resolve, 1000));

          // 5-3) Variant 추가금액 업데이트
          if (product.variants && product.variants.length >= 2) {
            // variants를 additional_amount 기준으로 정렬
            const sortedVariants = [...product.variants].sort((a, b) => 
              parseFloat(a.additional_amount) - parseFloat(b.additional_amount)
            );

            // 2차 variant (5kg 또는 4kg) 업데이트
            if (sortedVariants.length > 1) {
              const variant2nd = sortedVariants[1];
              await cafe24API.updateProductVariant(product.product_no, variant2nd.variant_code, {
                additional_amount: cleanAdditionalAmount2nd
              });
              
              // 진행률 업데이트 (3/4 단계 완료)
              currentStep++;
              const progress3 = Math.round((currentStep / totalSteps) * 100);
              setSaveProgress(progress3);
              
              // API 호출 간격 조절 (1초 대기)
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // 3차 variant (20kg 또는 15kg) 업데이트
            if (sortedVariants.length > 2) {
              const variant3rd = sortedVariants[2];
              await cafe24API.updateProductVariant(product.product_no, variant3rd.variant_code, {
                additional_amount: cleanAdditionalAmount3rd
              });
              
              // 진행률 업데이트 (4/4 단계 완료)
              currentStep++;
              const progress4 = Math.round((currentStep / totalSteps) * 100);
              setSaveProgress(progress4);
              
              // 상품 처리 완료 후 다음 상품 처리 전 약간의 추가 대기 (선택사항)
              if (product !== allowedProducts[allowedProducts.length - 1]) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
          } else {
            console.warn(`${product.product_code}: variants 데이터가 부족합니다.`);
          }

          // 상품 완료 처리
          setCompletedProducts(productIndex);
          const progressPercent = Math.round((currentStep / totalSteps) * 100);
          if (productIndex % 5 === 0 || productIndex === allowedProducts.length) {
            console.log(`진행: ${productIndex}/${allowedProducts.length} (${progressPercent}%)`);
          }
          successCount++;
        } catch (error) {
          // 에러 시에도 완료된 것으로 카운트 (처리는 완료됨)
          setCompletedProducts(productIndex);
          console.error(`실패: ${product.product_code} -`, error instanceof Error ? error.message : error);
          errorCount++;
        }
      }

      // 결과 처리
      if (successCount > 0) {
        toast.success(`${successCount}개 상품 가격이 업데이트되었습니다.`);
        if (errorCount > 0) {
          toast.error(`${errorCount}개 상품 업데이트에 실패했습니다.`);
        }
        console.log(`완료: ${successCount}개 성공, ${errorCount}개 실패`);
        
        // 업데이트된 데이터 반영을 위한 안내 메시지
        toast('업데이트된 가격을 반영하는 중입니다... (2초)', {
          duration: 2000
        });
        
        // 카페24 API 캐시 반영을 위해 2초 대기 후 새로고침
        setTimeout(() => {
          onProductsUpdate();
        }, 2000);
      }

      // 성공한 경우에만 편집 모드 해제
      if (successCount > 0) {
        setIsPriceEditMode(false);
        setPriceEditForms({});
      }
    } catch (error) {
      console.error('전체 가격 업데이트 중 오류:', error);
      toast.error('가격 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setSaveProgress(0); // 진행률 초기화
      setCompletedProducts(0); // 완료 상품 수 초기화
      setTotalProducts(0); // 총 상품 수 초기화
      setSaveStartTime(null); // 시작 시간 초기화
    }
  };

  // 예상 남은 시간 계산 함수
  const calculateEstimatedTime = (): string => {
    if (!saveStartTime || saveProgress === 0) return "계산 중...";
    
    const elapsed = Date.now() - saveStartTime.getTime();
    const progressRatio = saveProgress / 100;
    const estimatedTotal = elapsed / progressRatio;
    const remaining = estimatedTotal - elapsed;
    
    if (remaining <= 0) return "곧 완료됩니다...";
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    if (minutes > 0) {
      return `약 ${minutes}분 ${seconds}초 남음`;
    } else {
      return `약 ${seconds}초 남음`;
    }
  };


  const formatPrice = (price: string) => {
    return new Intl.NumberFormat('ko-KR').format(parseFloat(price));
  };

  // variants 기반 가격 계산 함수
  const calculateVariantPrices = (product: Cafe24Product) => {
    const basePrice = parseFloat(product.price);
    
    // 특정 상품코드들은 1kg, 4kg, 15kg 단위 사용
    const specialProductCodes = ['P00000PN', 'P0000BIB', 'P0000BHX', 'P0000BHW', 'P0000BHV', 'P00000YR'];
    const isSpecialProduct = specialProductCodes.includes(product.product_code);
    
    if (!product.variants || product.variants.length === 0) {
      return {
        price1kg: basePrice,
        price2nd: null,
        price3rd: null,
        unitPrice1kg: basePrice,
        unitPrice2nd: null,
        unitPrice3rd: null,
        units: isSpecialProduct ? { first: '1kg', second: '4kg', third: '15kg' } : { first: '1kg', second: '5kg', third: '20kg' }
      };
    }

    // variants 배열에서 additional_amount 기준으로 정렬 (0, 84900, 398400 순서)
    const sortedVariants = [...product.variants].sort((a, b) => 
      parseFloat(a.additional_amount) - parseFloat(b.additional_amount)
    );

    const price1kg = basePrice; // 기본 가격 (0.00 추가금액)
    const price2nd = sortedVariants.length > 1 ? basePrice + parseFloat(sortedVariants[1].additional_amount) : null;
    const price3rd = sortedVariants.length > 2 ? basePrice + parseFloat(sortedVariants[2].additional_amount) : null;

    // 단위 설정
    const units = isSpecialProduct 
      ? { first: '1kg', second: '4kg', third: '15kg' }
      : { first: '1kg', second: '5kg', third: '20kg' };
    
    // 단가 계산
    const secondUnit = isSpecialProduct ? 4 : 5;
    const thirdUnit = isSpecialProduct ? 15 : 20;

    return {
      price1kg,
      price2nd,
      price3rd,
      unitPrice1kg: price1kg / 1,
      unitPrice2nd: price2nd ? price2nd / secondUnit : null,
      unitPrice3rd: price3rd ? price3rd / thirdUnit : null,
      units
    };
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ChevronUp className="h-4 w-4 text-gray-300" />;
    }
    return sortDirection === 'asc' ? 
      <ChevronUp className="h-4 w-4 text-gray-600" /> : 
      <ChevronDown className="h-4 w-4 text-gray-600" />;
  };

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex overflow-x-auto">
          {availableTabs.map((tab) => {
            const tabInfo = EXPOSURE_GROUPS[tab as keyof typeof EXPOSURE_GROUPS];
            const tabProducts = tab === 'all' ? products : 
              tab === 'public' ? products.filter(p => p.exposure_limit_type !== 'M' || !p.exposure_group_list || p.exposure_group_list.length === 0) :
              products.filter(p => p.exposure_limit_type === 'M' && p.exposure_group_list && p.exposure_group_list.includes(parseInt(tab)));
            
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-primary-500 text-primary-600 bg-primary-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tabInfo?.name || `그룹 ${tab}`}
                <span className="ml-2 px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
                  {tabProducts.length}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="상품명, 상품코드, 모델명으로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            {/* 제외된 상품 안내 */}
            {excludedStats.total > 0 && (
              <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                <span className="font-medium">제외된 상품:</span> [SALE] {excludedStats.sale}개, [SAMPLE] {excludedStats.sample}개
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {isPriceEditMode ? (
              <>
                <button
                  onClick={saveAllPrices}
                  disabled={isLoading}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50 relative overflow-hidden"
                >
                  {/* 진행률 배경 */}
                  {isLoading && (
                    <div 
                      className="absolute inset-0 bg-blue-400 transition-all duration-300 ease-out"
                      style={{ width: `${saveProgress}%` }}
                    />
                  )}
                  
                  {/* 버튼 내용 */}
                  <div className="relative z-10 flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    {isLoading ? `저장 중... ${saveProgress}%` : '가격 저장'}
                  </div>
                </button>
                <button
                  onClick={togglePriceEditMode}
                  className="btn-secondary flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  취소
                </button>
              </>
            ) : (
              <button
                onClick={togglePriceEditMode}
                className="btn-primary flex items-center gap-2"
              >
                <Edit className="h-4 w-4" />
                가격 수정
              </button>
            )}
          </div>
        </div>
        
        {/* Tab Description */}
        {activeTab !== 'all' && (
          <div className="mt-3 text-sm text-gray-600">
            <span className="font-medium">
              {EXPOSURE_GROUPS[activeTab as keyof typeof EXPOSURE_GROUPS]?.name || `그룹 ${activeTab}`}
            </span>
            <span className="mx-2">•</span>
            <span>
              {EXPOSURE_GROUPS[activeTab as keyof typeof EXPOSURE_GROUPS]?.description || `${activeTab}번 그룹 전용 상품`}
            </span>
          </div>
        )}

        {/* Price Edit Mode Notice */}
        {isPriceEditMode && (
          <>
            {/* 폼 데이터 누락 경고 */}
            {missingFormData.length > 0 && (
              <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded-lg">
                <div className="flex items-center gap-2 text-red-800">
                  <X className="h-4 w-4" />
                                      <span className="font-medium">데이터 오류 경고</span>
                </div>
                <p className="mt-1 text-sm text-red-700">
                  <span className="font-medium">{missingFormData.length}개 상품</span>에서 폼 데이터가 누락되었습니다. 
                  가격 수정 모드를 다시 시작하거나 페이지를 새로고침해주세요.
                </p>
                <div className="mt-2">
                  <button
                    onClick={() => {
                      setIsPriceEditMode(false);
                      setPriceEditForms({});
                      setTimeout(() => setIsPriceEditMode(true), 100);
                    }}
                    className="text-xs bg-red-200 hover:bg-red-300 text-red-800 px-2 py-1 rounded"
                  >
                    가격 수정 모드 재시작
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-header">
                <button
                  onClick={() => handleSort('product_code')}
                  className="flex items-center gap-1 hover:text-gray-900 font-medium text-xs text-gray-500 uppercase tracking-wider"
                >
                  상품코드
                  {getSortIcon('product_code')}
                </button>
              </th>
              <th className="table-header">
                <button
                  onClick={() => handleSort('product_name')}
                  className="flex items-center gap-1 hover:text-gray-900 font-medium text-xs text-gray-500 uppercase tracking-wider"
                >
                  상품명
                  {getSortIcon('product_name')}
                </button>
              </th>
              <th className="table-header w-32">
                <button
                  onClick={() => handleSort('supply_price')}
                  className="flex items-center gap-1 hover:text-gray-900 font-medium text-xs text-gray-500 uppercase tracking-wider"
                >
                  공급가
                  {getSortIcon('supply_price')}
                </button>
              </th>
              <th className="table-header w-36">
                <button
                  onClick={() => handleSort('price')}
                  className="flex items-center gap-1 hover:text-gray-900 font-medium text-xs text-gray-500 uppercase tracking-wider"
                >
                  1kg 가격
                  {getSortIcon('price')}
                </button>
              </th>
              <th className="table-header w-36">
                <span className="font-medium text-xs text-gray-500 uppercase tracking-wider">
                  4/5kg 가격
                </span>
              </th>
              <th className="table-header w-36">
                <span className="font-medium text-xs text-gray-500 uppercase tracking-wider">
                  15/20kg 가격
                </span>
              </th>
              <th className="table-header">노출그룹</th>
              <th className="table-header">
                <button
                  onClick={() => handleSort('updated_date')}
                  className="flex items-center gap-1 hover:text-gray-900 font-medium text-xs text-gray-500 uppercase tracking-wider"
                >
                  수정일
                  {getSortIcon('updated_date')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedProducts.map((product) => {
              const variantPrices = calculateVariantPrices(product);
              
              return (
                <tr key={product.product_no} className={`hover:bg-gray-50 ${isPriceEditMode ? 'bg-blue-50' : ''}`}>
                  <td className="table-cell font-medium">{product.product_code}</td>
                  <td className="table-cell">
                    {editingProduct === product.product_no ? (
                      <input
                        type="text"
                        value={editForm.product_name || ''}
                        onChange={(e) => setEditForm({ ...editForm, product_name: e.target.value })}
                        className="input-field"
                      />
                    ) : (
                      product.product_name
                    )}
                  </td>
                  
                  {/* 공급가 */}
                  <td className="table-cell w-32">
                    {isPriceEditMode ? (
                      priceEditForms[product.product_no] ? (
                        <div className="space-y-3">
                          {/* 공급가 입력 필드 */}
                          <input
                            type="number"
                            value={priceEditForms[product.product_no].supply_price}
                            onChange={(e) => updatePriceForm(product.product_no, 'supply_price', e.target.value)}
                            className="input-field bg-yellow-50 border-yellow-200 w-full min-w-24 px-2 py-1 text-sm"
                            placeholder="공급가"
                          />
                          
                          {/* 5kg/20kg 단가 자동 적용 UI */}
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                            <div className="text-xs font-medium text-blue-800 mb-2">단가 자동 적용</div>
                            
                            {/* 5kg 적용 */}
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-gray-600 min-w-[24px]">
                                {(() => {
                                  const specialProductCodes = ['P00000PN', 'P0000BIB', 'P0000BHX', 'P0000BHW', 'P0000BHV', 'P00000YR'];
                                  const isSpecialProduct = specialProductCodes.includes(product.product_code);
                                  return isSpecialProduct ? '4kg' : '5kg';
                                })()}:
                              </span>
                              <span className="text-gray-600">-</span>
                              <input
                                type="number"
                                value={autoApplySettings.amount5kg}
                                onChange={(e) => setAutoApplySettings(prev => ({ ...prev, amount5kg: e.target.value }))}
                                className="w-16 px-1 py-0.5 text-xs border border-gray-300 rounded"
                                placeholder="300"
                              />
                              <span className="text-gray-600">원</span>
                              <button
                                onClick={() => applyAutoPrice(product.product_no, '5kg')}
                                className="ml-1 px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                적용
                              </button>
                            </div>
                            
                            {/* 20kg 적용 */}
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-gray-600 min-w-[24px]">
                                {(() => {
                                  const specialProductCodes = ['P00000PN', 'P0000BIB', 'P0000BHX', 'P0000BHW', 'P0000BHV', 'P00000YR'];
                                  const isSpecialProduct = specialProductCodes.includes(product.product_code);
                                  return isSpecialProduct ? '15kg' : '20kg';
                                })()}:
                              </span>
                              <span className="text-gray-600">-</span>
                              <input
                                type="number"
                                value={autoApplySettings.amount20kg}
                                onChange={(e) => setAutoApplySettings(prev => ({ ...prev, amount20kg: e.target.value }))}
                                className="w-16 px-1 py-0.5 text-xs border border-gray-300 rounded"
                                placeholder="600"
                              />
                              <span className="text-gray-600">원</span>
                              <button
                                onClick={() => applyAutoPrice(product.product_no, '20kg')}
                                className="ml-1 px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                적용
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-50 border border-red-200 rounded p-2">
                          <div className="text-red-600 text-xs font-medium">⚠️ 데이터 오류</div>
                          <div className="text-red-500 text-xs">폼 데이터 없음</div>
                        </div>
                      )
                    ) : editingProduct === product.product_no ? (
                      <input
                        type="number"
                        value={editForm.supply_price || ''}
                        onChange={(e) => setEditForm({ ...editForm, supply_price: e.target.value })}
                        className="input-field"
                        placeholder="공급가"
                      />
                    ) : (
                      formatPrice(product.supply_price)
                    )}
                  </td>
                  
                  {/* 1kg 가격 (공급가 기반) */}
                  <td className="table-cell w-36">
                    {isPriceEditMode ? (
                      priceEditForms[product.product_no] ? (
                        <div>
                          <div className="text-xs text-gray-600 mb-1">공급가 (자동반영)</div>
                          <div className="font-medium text-blue-600">
                            ₩{formatPrice(priceEditForms[product.product_no].price_1kg)}
                          </div>
                          <div className="text-xs text-gray-500">
                            ₩{formatPrice(priceEditForms[product.product_no].price_1kg)}/kg
                          </div>
                          {/* 옵션명 미리보기 */}
                          <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                            <div className="text-green-600 font-mono break-words">
                              "1kg({Math.round(parseFloat(priceEditForms[product.product_no].price_1kg))}원)"
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-50 border border-red-200 rounded p-2">
                          <div className="text-red-600 text-xs font-medium">⚠️ 데이터 오류</div>
                          <div className="text-red-500 text-xs">폼 데이터 없음</div>
                        </div>
                      )
                    ) : editingProduct === product.product_no ? (
                      <input
                        type="number"
                        value={editForm.price || ''}
                        onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                        className="input-field"
                        placeholder="1kg 가격"
                      />
                    ) : (
                      <div>
                        <div className="font-medium">₩{formatPrice(variantPrices.price1kg.toString())}</div>
                        <div className="text-xs text-gray-500">₩{formatPrice(variantPrices.unitPrice1kg.toString())}/kg</div>
                      </div>
                    )}
                  </td>
                  
                  {/* 2차 가격 (5kg 또는 4kg) */}
                  <td className="table-cell w-36">
                    {isPriceEditMode ? (
                      priceEditForms[product.product_no] ? (
                        <div>
                          <div className="text-xs text-gray-600 mb-1">{variantPrices.units.second}</div>
                          <input
                            type="number"
                            value={priceEditForms[product.product_no].unit_price_2nd}
                            onChange={(e) => updatePriceForm(product.product_no, 'unit_price_2nd', e.target.value)}
                            className="input-field bg-yellow-50 border-yellow-200 w-full min-w-24 px-2 py-1 text-sm mb-1"
                            placeholder="1kg당 단가"
                          />
                          <div className="text-xs text-green-600 font-medium">
                            총: ₩{formatPrice(priceEditForms[product.product_no].price_2nd_total)}
                          </div>
                          <div className="text-xs text-gray-500">
                            추가금액: ₩{formatPrice(priceEditForms[product.product_no].additional_amount_2nd)}
                          </div>
                          {/* 옵션명 미리보기 */}
                          <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                            <div className="text-green-600 font-mono break-words">
                              "{variantPrices.units.second}({Math.round(parseFloat(priceEditForms[product.product_no].unit_price_2nd))}원)"
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-50 border border-red-200 rounded p-2">
                          <div className="text-red-600 text-xs font-medium">⚠️ 데이터 오류</div>
                          <div className="text-red-500 text-xs">폼 데이터 없음</div>
                        </div>
                      )
                    ) : variantPrices.price2nd ? (
                      <div>
                        <div className="text-xs text-gray-600 mb-1">{variantPrices.units.second}</div>
                        <div className="font-medium">₩{formatPrice(variantPrices.price2nd.toString())}</div>
                        <div className="text-xs text-gray-500">₩{formatPrice(variantPrices.unitPrice2nd!.toString())}/kg</div>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  
                  {/* 3차 가격 (20kg 또는 15kg) */}
                  <td className="table-cell w-36">
                    {isPriceEditMode ? (
                      priceEditForms[product.product_no] ? (
                        <div>
                          <div className="text-xs text-gray-600 mb-1">{variantPrices.units.third}</div>
                          <input
                            type="number"
                            value={priceEditForms[product.product_no].unit_price_3rd}
                            onChange={(e) => updatePriceForm(product.product_no, 'unit_price_3rd', e.target.value)}
                            className="input-field bg-yellow-50 border-yellow-200 w-full min-w-24 px-2 py-1 text-sm mb-1"
                            placeholder="1kg당 단가"
                          />
                          <div className="text-xs text-green-600 font-medium">
                            총: ₩{formatPrice(priceEditForms[product.product_no].price_3rd_total)}
                          </div>
                          <div className="text-xs text-gray-500">
                            추가금액: ₩{formatPrice(priceEditForms[product.product_no].additional_amount_3rd)}
                          </div>
                          {/* 옵션명 미리보기 */}
                          <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                            <div className="text-green-600 font-mono break-words">
                              "{variantPrices.units.third}({Math.round(parseFloat(priceEditForms[product.product_no].unit_price_3rd))}원)"
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-50 border border-red-200 rounded p-2">
                          <div className="text-red-600 text-xs font-medium">⚠️ 데이터 오류</div>
                          <div className="text-red-500 text-xs">폼 데이터 없음</div>
                        </div>
                      )
                    ) : variantPrices.price3rd ? (
                      <div>
                        <div className="text-xs text-gray-600 mb-1">{variantPrices.units.third}</div>
                        <div className="font-medium">₩{formatPrice(variantPrices.price3rd.toString())}</div>
                        <div className="text-xs text-gray-500">₩{formatPrice(variantPrices.unitPrice3rd!.toString())}/kg</div>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="table-cell">
                    {product.exposure_limit_type === 'M' ? (
                      <div className="flex flex-wrap gap-1">
                        {product.exposure_group_list?.map(groupId => (
                          <span key={groupId} className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
                            {EXPOSURE_GROUPS[groupId.toString() as keyof typeof EXPOSURE_GROUPS]?.name || `그룹${groupId}`}
                          </span>
                        )) || <span className="text-gray-400">없음</span>}
                      </div>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">모두공개</span>
                    )}
                  </td>
                  <td className="table-cell text-sm text-gray-500">
                    {new Date(product.updated_date).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>필터링된 상품: {sortedProducts.length}개</span>
          <span>
            {activeTab === 'all' ? '전체' : (EXPOSURE_GROUPS[activeTab as keyof typeof EXPOSURE_GROUPS]?.name || `그룹 ${activeTab}`)} 
            상품: {tabFilteredProducts.length}개 (전체 {products.length}개)
          </span>
        </div>
      </div>

      {/* 가격 저장 진행 오버레이 */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              {/* 로딩 스피너 */}
              <div className="mb-6">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto"></div>
              </div>
              
              {/* 제목 */}
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                상품 가격 업데이트 중
              </h3>
              
              {/* 진행률 표시 */}
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>진행률</span>
                  <span>{saveProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${saveProgress}%` }}
                  ></div>
                </div>
              </div>
              
              {/* 상품 처리 정보 */}
              <div className="mb-4 text-sm text-gray-600">
                <div className="flex justify-between mb-1">
                  <span>처리된 상품</span>
                  <span>{completedProducts} / {totalProducts}</span>
                </div>
              </div>
              
              {/* 예상 남은 시간 */}
              {saveStartTime && saveProgress > 0 && (
                <div className="text-sm text-gray-500 mb-4">
                  예상 남은 시간: {calculateEstimatedTime()}
                </div>
              )}
              
              {/* 처리된 상품 수 */}
              <div className="text-sm text-gray-600 mb-6">
                처리된 상품: {completedProducts}/{totalProducts}개
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 