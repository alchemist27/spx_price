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
  '1': { name: 'VIP', description: 'VIP 회원 전용 상품' },
  '8': { name: 'GOLD', description: 'GOLD 회원 전용 상품' },
  '9': { name: 'SILVER', description: 'SILVER 회원 전용 상품' },
  '10': { name: 'BRONZE', description: 'BRONZE 회원 전용 상품' },
  '11': { name: 'BASIC', description: 'BASIC 회원 전용 상품' },
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

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(sortedProducts.map(product => ({
      '상품번호': product.product_no,
      '상품코드': product.product_code,
      '상품명': product.product_name,
      '영문상품명': product.eng_product_name,
      '판매가': product.price,
      '공급가': product.supply_price,
      '표시여부': product.display === 'T' ? '표시' : '숨김',
      '판매여부': product.selling === 'T' ? '판매' : '판매안함',
      '노출그룹': product.exposure_limit_type === 'M' ? product.exposure_group_list?.join(', ') || '없음' : '모두공개',
      '생성일': new Date(product.created_date).toLocaleDateString('ko-KR'),
      '수정일': new Date(product.updated_date).toLocaleDateString('ko-KR'),
    })));

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

          {/* Export Button */}
          <button
            onClick={exportToExcel}
            className="btn-secondary flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            엑셀 다운로드
          </button>
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
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-header">
                <button
                  onClick={() => handleSort('product_no')}
                  className="flex items-center gap-1 hover:text-gray-900 font-medium text-xs text-gray-500 uppercase tracking-wider"
                >
                  상품번호
                  {getSortIcon('product_no')}
                </button>
              </th>
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
                  판매가
                  {getSortIcon('price')}
                </button>
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
              <th className="table-header">작업</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedProducts.map((product) => (
              <tr key={product.product_no} className="hover:bg-gray-50">
                <td className="table-cell font-medium">{product.product_no}</td>
                <td className="table-cell">{product.product_code}</td>
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
                <td className="table-cell">
                  {editingProduct === product.product_no ? (
                    <input
                      type="number"
                      value={editForm.price || ''}
                      onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                      className="input-field"
                    />
                  ) : (
                    formatPrice(product.price)
                  )}
                </td>
                <td className="table-cell">
                  {editingProduct === product.product_no ? (
                    <input
                      type="number"
                      value={editForm.supply_price || ''}
                      onChange={(e) => setEditForm({ ...editForm, supply_price: e.target.value })}
                      className="input-field"
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
                <td className="table-cell">
                  {editingProduct === product.product_no ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(product.product_no)}
                        disabled={isLoading}
                        className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                      </button>
                      <button
                        onClick={handleCancel}
                        className="p-1 text-red-600 hover:text-red-800"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleEdit(product)}
                      className="p-1 text-blue-600 hover:text-blue-800"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
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