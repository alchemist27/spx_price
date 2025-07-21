'use client';

import { useState, useMemo } from 'react';
import { Cafe24Product, Cafe24ProductUpdateRequest } from '@/lib/cafe24-api';
import { cafe24API } from '@/lib/cafe24-api';
import toast from 'react-hot-toast';
import { Search, Filter, Download, Upload, Edit, Save, X, ChevronUp, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
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
  const [filterDisplay, setFilterDisplay] = useState('all');
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

  // 🔍 상품 데이터 변경 시 디버깅 정보 출력
  React.useEffect(() => {
    if (products.length > 0) {
      console.log('🔍 === ProductTable 노출 그룹 디버깅 ===');
      console.log('📦 총 상품 수:', products.length);
      
      // 노출 그룹 통계 수집
      const groupStats = new Map<string, number>();
      const limitTypeStats = new Map<string, number>();
      
      products.forEach(product => {
        // exposure_limit_type 통계
        const limitType = product.exposure_limit_type || 'undefined';
        limitTypeStats.set(limitType, (limitTypeStats.get(limitType) || 0) + 1);
        
        // exposure_group_list 통계
        if (product.exposure_group_list && product.exposure_group_list.length > 0) {
          product.exposure_group_list.forEach(groupId => {
            groupStats.set(groupId.toString(), (groupStats.get(groupId.toString()) || 0) + 1);
          });
        }
      });
      
      console.log('📊 노출 제한 타입별 상품 수:', Object.fromEntries(limitTypeStats));
      console.log('📊 실제 노출 그룹별 상품 수:', Object.fromEntries(groupStats));
      
      // 실제 존재하는 그룹 번호들
      const actualGroups = Array.from(groupStats.keys()).sort((a, b) => parseInt(a) - parseInt(b));
      console.log('🎯 실제 존재하는 노출 그룹:', actualGroups);
      
      // 몇 개 상품 샘플 출력
      const samples = products.slice(0, 5).map(p => ({
        product_no: p.product_no,
        product_name: p.product_name.substring(0, 20) + '...',
        exposure_limit_type: p.exposure_limit_type,
        exposure_group_list: p.exposure_group_list
      }));
      console.log('📝 상품 샘플:', samples);
      
      console.log('🔍 === 디버깅 정보 끝 ===');
    }
  }, [products]);

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
    
    console.log('🏷️ 생성된 탭들:', tabs);
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

  // 검색 및 필터 적용
  const filteredProducts = useMemo(() => {
    return tabFilteredProducts.filter(product => {
      const matchesSearch = 
        product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.model_name.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = 
        filterDisplay === 'all' || 
        (filterDisplay === 'display' && product.display === 'T') ||
        (filterDisplay === 'selling' && product.selling === 'T');

      return matchesSearch && matchesFilter;
    });
  }, [tabFilteredProducts, searchTerm, filterDisplay]);

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
          supply_price: product.supply_price,
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

    // 특정 상품코드들은 1kg, 4kg, 15kg 단위 사용
    const specialProductCodes = ['P00000PN', 'P0000BIB', 'P0000BHX', 'P0000BHW', 'P0000BHV', 'P00000YR'];
    const isSpecialProduct = specialProductCodes.includes(product.product_code);
    const secondUnit = isSpecialProduct ? 4 : 5;
    const thirdUnit = isSpecialProduct ? 15 : 20;

    setPriceEditForms(prev => {
      const currentForm = prev[productNo] || {};
      const updatedForm = { ...currentForm, [field]: value };

      // 자동 계산 로직
      if (field === 'supply_price') {
        // 2) 공급가 변경시 1kg 단가 자동 변경
        const supplyPrice = parseFloat(value) || 0;
        updatedForm.price_1kg = supplyPrice.toString();
        
        // 추가금액들도 재계산
        const unitPrice2nd = parseFloat(updatedForm.unit_price_2nd) || supplyPrice;
        const unitPrice3rd = parseFloat(updatedForm.unit_price_3rd) || supplyPrice;
        
        updatedForm.price_2nd_total = (unitPrice2nd * secondUnit).toString();
        updatedForm.price_3rd_total = (unitPrice3rd * thirdUnit).toString();
        updatedForm.additional_amount_2nd = ((unitPrice2nd * secondUnit) - supplyPrice).toString();
        updatedForm.additional_amount_3rd = ((unitPrice3rd * thirdUnit) - supplyPrice).toString();
        
      } else if (field === 'unit_price_2nd') {
        // 3) 2차가격 1kg당 단가 변경시 자동 계산
        const unitPrice2nd = parseFloat(value) || 0;
        const supplyPrice = parseFloat(updatedForm.supply_price) || 0;
        
        updatedForm.price_2nd_total = (unitPrice2nd * secondUnit).toString();
        updatedForm.additional_amount_2nd = ((unitPrice2nd * secondUnit) - supplyPrice).toString();
        
      } else if (field === 'unit_price_3rd') {
        // 4) 3차가격 1kg당 단가 변경시 자동 계산
        const unitPrice3rd = parseFloat(value) || 0;
        const supplyPrice = parseFloat(updatedForm.supply_price) || 0;
        
        updatedForm.price_3rd_total = (unitPrice3rd * thirdUnit).toString();
        updatedForm.additional_amount_3rd = ((unitPrice3rd * thirdUnit) - supplyPrice).toString();
      }

      return {
        ...prev,
        [productNo]: updatedForm
      };
    });
  };

  // 전체 가격 저장
  const saveAllPrices = async () => {
    setIsLoading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const product of sortedProducts) {
        const formData = priceEditForms[product.product_no];
        if (!formData) continue;

        try {
          // 기본 가격과 공급가 업데이트
          await cafe24API.updateProduct(product.product_no, {
            price: formData.price_1kg,
            supply_price: formData.supply_price
          });

          // TODO: 5) 저장 시 옵션명, variant 업데이트는 다음 단계에서 구현
          // 현재는 기본 가격과 공급가만 업데이트

          successCount++;
        } catch (error) {
          console.error(`상품 ${product.product_code} 업데이트 실패:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount}개 상품 가격이 업데이트되었습니다.`);
        if (errorCount > 0) {
          toast.error(`${errorCount}개 상품 업데이트에 실패했습니다.`);
        }
        setIsPriceEditMode(false);
        setPriceEditForms({});
        onProductsUpdate();
      }
    } catch (error) {
      toast.error('가격 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(sortedProducts.map(product => {
      const variantPrices = calculateVariantPrices(product);
      
      return {
        '상품코드': product.product_code,
        '상품명': product.product_name,
        '영문상품명': product.eng_product_name,
        '1kg가격': `₩${formatPrice(variantPrices.price1kg.toString())}`,
        '1kg단가': `₩${formatPrice(variantPrices.unitPrice1kg.toString())}/kg`,
        [`${variantPrices.units.second}가격`]: variantPrices.price2nd ? `₩${formatPrice(variantPrices.price2nd.toString())}` : '-',
        [`${variantPrices.units.second}단가`]: variantPrices.unitPrice2nd ? `₩${formatPrice(variantPrices.unitPrice2nd.toString())}/kg` : '-',
        [`${variantPrices.units.third}가격`]: variantPrices.price3rd ? `₩${formatPrice(variantPrices.price3rd.toString())}` : '-',
        [`${variantPrices.units.third}단가`]: variantPrices.unitPrice3rd ? `₩${formatPrice(variantPrices.unitPrice3rd.toString())}/kg` : '-',
        '공급가': product.supply_price,
        '표시여부': product.display === 'T' ? '표시' : '숨김',
        '판매여부': product.selling === 'T' ? '판매' : '판매안함',
        '노출그룹': product.exposure_limit_type === 'M' ? product.exposure_group_list?.join(', ') || '없음' : '모두공개',
        '생성일': new Date(product.created_date).toLocaleDateString('ko-KR'),
        '수정일': new Date(product.updated_date).toLocaleDateString('ko-KR'),
      };
    }));

    const wb = XLSX.utils.book_new();
    const sheetName = activeTab === 'all' ? '전체상품' : (EXPOSURE_GROUPS[activeTab as keyof typeof EXPOSURE_GROUPS]?.name || `그룹${activeTab}`);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, `상품목록_${sheetName}_${new Date().toISOString().split('T')[0]}.xlsx`);
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
          <div className="flex flex-col sm:flex-row gap-4 flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="상품명, 상품코드, 모델명으로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>

            {/* Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <select
                value={filterDisplay}
                onChange={(e) => setFilterDisplay(e.target.value)}
                className="input-field pl-10"
              >
                <option value="all">전체</option>
                <option value="display">표시 상품</option>
                <option value="selling">판매 상품</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {isPriceEditMode ? (
              <>
                <button
                  onClick={saveAllPrices}
                  disabled={isLoading}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {isLoading ? '저장 중...' : '가격 저장'}
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
            <button
              onClick={exportToExcel}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              엑셀 다운로드
            </button>
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
          <div className="mt-3 p-3 bg-blue-100 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-blue-800">
              <Edit className="h-4 w-4" />
              <span className="font-medium">가격 수정 모드</span>
            </div>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-yellow-50 p-2 rounded border border-yellow-200">
                <span className="font-medium text-yellow-800">📝 편집 가능:</span>
                <ul className="mt-1 text-yellow-700 text-xs">
                  <li>• 공급가 (1kg 가격 자동 변경)</li>
                  <li>• 2차가격 1kg당 단가</li>
                  <li>• 3차가격 1kg당 단가</li>
                </ul>
              </div>
              <div className="bg-green-50 p-2 rounded border border-green-200">
                <span className="font-medium text-green-800">🔄 자동 계산:</span>
                <ul className="mt-1 text-green-700 text-xs">
                  <li>• 총 가격 (단가 × 중량)</li>
                  <li>• 추가금액 (총가격 - 1kg가격)</li>
                  <li>• 옵션명 (단가 정보 포함)</li>
                </ul>
              </div>
              <div className="bg-blue-50 p-2 rounded border border-blue-200">
                <span className="font-medium text-blue-800">💾 저장 시:</span>
                <ul className="mt-1 text-blue-700 text-xs">
                  <li>• 상품 기본가격/공급가</li>
                  <li>• 옵션명 (단가 표시)</li>
                  <li>• Variant 추가금액</li>
                </ul>
              </div>
            </div>
          </div>
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
              <th className="table-header">
                <button
                  onClick={() => handleSort('price')}
                  className="flex items-center gap-1 hover:text-gray-900 font-medium text-xs text-gray-500 uppercase tracking-wider"
                >
                  1kg 가격
                  {getSortIcon('price')}
                </button>
              </th>
              <th className="table-header">
                <span className="font-medium text-xs text-gray-500 uppercase tracking-wider">
                  2차 가격
                </span>
              </th>
              <th className="table-header">
                <span className="font-medium text-xs text-gray-500 uppercase tracking-wider">
                  3차 가격
                </span>
              </th>
              <th className="table-header">
                <button
                  onClick={() => handleSort('supply_price')}
                  className="flex items-center gap-1 hover:text-gray-900 font-medium text-xs text-gray-500 uppercase tracking-wider"
                >
                  공급가
                  {getSortIcon('supply_price')}
                </button>
              </th>
              <th className="table-header">
                <button
                  onClick={() => handleSort('display')}
                  className="flex items-center gap-1 hover:text-gray-900 font-medium text-xs text-gray-500 uppercase tracking-wider"
                >
                  표시
                  {getSortIcon('display')}
                </button>
              </th>
              <th className="table-header">
                <button
                  onClick={() => handleSort('selling')}
                  className="flex items-center gap-1 hover:text-gray-900 font-medium text-xs text-gray-500 uppercase tracking-wider"
                >
                  판매
                  {getSortIcon('selling')}
                </button>
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
                  
                  {/* 1kg 가격 (공급가 기반) */}
                  <td className="table-cell">
                    {isPriceEditMode ? (
                      <div>
                        <div className="text-xs text-gray-600 mb-1">공급가 (자동반영)</div>
                        <div className="font-medium text-blue-600">
                          ₩{formatPrice(priceEditForms[product.product_no]?.price_1kg || '0')}
                        </div>
                        <div className="text-xs text-gray-500">
                          ₩{formatPrice(priceEditForms[product.product_no]?.price_1kg || '0')}/kg
                        </div>
                      </div>
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
                  <td className="table-cell">
                    {isPriceEditMode ? (
                      <div>
                        <div className="text-xs text-gray-600 mb-1">{variantPrices.units.second}</div>
                        <input
                          type="number"
                          value={priceEditForms[product.product_no]?.unit_price_2nd || ''}
                          onChange={(e) => updatePriceForm(product.product_no, 'unit_price_2nd', e.target.value)}
                          className="input-field text-sm mb-1"
                          placeholder="1kg당 단가"
                        />
                        <div className="text-xs text-green-600 font-medium">
                          총: ₩{formatPrice(priceEditForms[product.product_no]?.price_2nd_total || '0')}
                        </div>
                        <div className="text-xs text-gray-500">
                          추가: ₩{formatPrice(priceEditForms[product.product_no]?.additional_amount_2nd || '0')}
                        </div>
                      </div>
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
                  <td className="table-cell">
                    {isPriceEditMode ? (
                      <div>
                        <div className="text-xs text-gray-600 mb-1">{variantPrices.units.third}</div>
                        <input
                          type="number"
                          value={priceEditForms[product.product_no]?.unit_price_3rd || ''}
                          onChange={(e) => updatePriceForm(product.product_no, 'unit_price_3rd', e.target.value)}
                          className="input-field text-sm mb-1"
                          placeholder="1kg당 단가"
                        />
                        <div className="text-xs text-green-600 font-medium">
                          총: ₩{formatPrice(priceEditForms[product.product_no]?.price_3rd_total || '0')}
                        </div>
                        <div className="text-xs text-gray-500">
                          추가: ₩{formatPrice(priceEditForms[product.product_no]?.additional_amount_3rd || '0')}
                        </div>
                      </div>
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
                    {isPriceEditMode ? (
                      <input
                        type="number"
                        value={priceEditForms[product.product_no]?.supply_price || ''}
                        onChange={(e) => updatePriceForm(product.product_no, 'supply_price', e.target.value)}
                        className="input-field bg-yellow-50 border-yellow-200"
                        placeholder="공급가 (편집가능)"
                      />
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
                  <td className="table-cell">
                    {editingProduct === product.product_no ? (
                      <select
                        value={editForm.display || ''}
                        onChange={(e) => setEditForm({ ...editForm, display: e.target.value })}
                        className="input-field"
                      >
                        <option value="T">표시</option>
                        <option value="F">숨김</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        product.display === 'T' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {product.display === 'T' ? '표시' : '숨김'}
                      </span>
                    )}
                  </td>
                  <td className="table-cell">
                    {editingProduct === product.product_no ? (
                      <select
                        value={editForm.selling || ''}
                        onChange={(e) => setEditForm({ ...editForm, selling: e.target.value })}
                        className="input-field"
                      >
                        <option value="T">판매</option>
                        <option value="F">판매안함</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        product.selling === 'T' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {product.selling === 'T' ? '판매' : '판매안함'}
                      </span>
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
    </div>
  );
} 