'use client';

import { useState, useMemo } from 'react';
import { Cafe24Product, Cafe24ProductUpdateRequest } from '@/lib/cafe24-api';
import { cafe24API } from '@/lib/cafe24-api';
import toast from 'react-hot-toast';
import { Search, Filter, Download, Upload, Edit, Save, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface ProductTableProps {
  products: Cafe24Product[];
  onProductsUpdate: () => void;
}

export default function ProductTable({ products, onProductsUpdate }: ProductTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDisplay, setFilterDisplay] = useState('all');
  const [editingProduct, setEditingProduct] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Cafe24ProductUpdateRequest>({});
  const [isLoading, setIsLoading] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
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
  }, [products, searchTerm, filterDisplay]);

  const handleEdit = (product: Cafe24Product) => {
    setEditingProduct(product.product_no);
    setEditForm({
      product_name: product.product_name,
      price: product.price,
      retail_price: product.retail_price,
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
    const ws = XLSX.utils.json_to_sheet(filteredProducts.map(product => ({
      '상품번호': product.product_no,
      '상품코드': product.product_code,
      '상품명': product.product_name,
      '영문상품명': product.eng_product_name,
      '가격': product.price,
      '소비자가격': product.retail_price,
      '공급가격': product.supply_price,
      '표시여부': product.display === 'T' ? '표시' : '숨김',
      '판매여부': product.selling === 'T' ? '판매' : '판매안함',
      '생성일': new Date(product.created_date).toLocaleDateString('ko-KR'),
      '수정일': new Date(product.updated_date).toLocaleDateString('ko-KR'),
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '상품목록');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, `상품목록_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatPrice = (price: string) => {
    return new Intl.NumberFormat('ko-KR').format(parseFloat(price));
  };

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
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
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-header">상품번호</th>
              <th className="table-header">상품코드</th>
              <th className="table-header">상품명</th>
              <th className="table-header">가격</th>
              <th className="table-header">소비자가격</th>
              <th className="table-header">공급가격</th>
              <th className="table-header">표시</th>
              <th className="table-header">판매</th>
              <th className="table-header">수정일</th>
              <th className="table-header">작업</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredProducts.map((product) => (
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
                      value={editForm.retail_price || ''}
                      onChange={(e) => setEditForm({ ...editForm, retail_price: e.target.value })}
                      className="input-field"
                    />
                  ) : (
                    formatPrice(product.retail_price)
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
          <span>총 {filteredProducts.length}개 상품</span>
          <span>전체 {products.length}개 중</span>
        </div>
      </div>
    </div>
  );
} 