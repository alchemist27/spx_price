'use client';

import React, { useState } from 'react';
import ProductPriceUpdater, { Product, UpdateProgress } from '@/lib/product-price-updater';
import ProductPriceUpdateProgress from './ProductPriceUpdateProgress';

const ProductPriceUpdateExample: React.FC = () => {
  const [progress, setProgress] = useState<UpdateProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    current_product: '',
    current_step: '',
    percentage: 0,
    errors: [],
    estimated_remaining_time: 0
  });
  
  const [isRunning, setIsRunning] = useState(false);
  const [updater, setUpdater] = useState<ProductPriceUpdater | null>(null);

  // 예시 상품 데이터 (실제로는 서버에서 가져오거나 엑셀에서 읽어옴)
  const sampleProducts: Product[] = [
    {
      product_no: 1,
      product_name: '프리미엄 사료 A',
      base_price: 15000, // 1kg 기준 가격
      variant_5kg_code: 'P000001000A',
      variant_20kg_code: 'P000001000B',
      price_per_kg_1: 15000,
      price_per_kg_5: 14000, // 5kg 할인가
      price_per_kg_20: 13500  // 20kg 할인가
    },
    {
      product_no: 2,
      product_name: '건강 사료 B',
      base_price: 18000,
      variant_5kg_code: 'P000002000A',
      variant_20kg_code: 'P000002000B',
      price_per_kg_1: 18000,
      price_per_kg_5: 17000,
      price_per_kg_20: 16200
    },
    // ... 실제로는 300개의 상품 데이터
  ];

  const handleStartUpdate = async () => {
    setIsRunning(true);
    
    // 진행상황 콜백 함수
    const progressCallback = (newProgress: UpdateProgress) => {
      setProgress(newProgress);
    };

    // 업데이터 인스턴스 생성
    const priceUpdater = new ProductPriceUpdater(progressCallback);
    setUpdater(priceUpdater);

    try {
      console.log('🚀 대량 가격 업데이트를 시작합니다...');
      await priceUpdater.updateMultipleProducts(sampleProducts);
      console.log('✅ 모든 상품 업데이트가 완료되었습니다!');
    } catch (error) {
      console.error('❌ 업데이트 중 오류 발생:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const handleStop = () => {
    if (updater) {
      updater.stop();
      setIsRunning(false);
    }
  };

  const handleResume = async () => {
    if (updater) {
      setIsRunning(true);
      await updater.resume();
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        
        {/* 시작 버튼 */}
        {!isRunning && progress.total === 0 && (
          <div className="text-center mb-8">
            <button
              onClick={handleStartUpdate}
              className="px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
            >
              🚀 300개 상품 가격 업데이트 시작
            </button>
            <p className="mt-4 text-gray-600">
              안전하고 안정적으로 모든 상품의 가격을 업데이트합니다.
              <br />
              예상 소요시간: 약 20-30분 (상품당 4초 × 300개)
            </p>
          </div>
        )}

        {/* 진행상황 모니터 */}
        {(isRunning || progress.total > 0) && (
          <ProductPriceUpdateProgress
            progress={progress}
            isRunning={isRunning}
            onStop={handleStop}
            onResume={handleResume}
          />
        )}

        {/* 작업 세부사항 */}
        {(isRunning || progress.total > 0) && (
          <div className="mt-8 p-6 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              📋 작업 세부사항
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-gray-700 mb-2">처리 과정:</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>1️⃣ 기본가격 수정</li>
                  <li>2️⃣ 옵션명 수정 (kg별 단가 포함)</li>
                  <li>3️⃣ 5kg 옵션 추가금액 수정</li>
                  <li>4️⃣ 20kg 옵션 추가금액 수정</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-700 mb-2">안전 기능:</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>✅ API 호출 제한 준수 (초당 3회)</li>
                  <li>✅ 자동 재시도 (최대 3회)</li>
                  <li>✅ 오류 발생시 개별 처리</li>
                  <li>✅ 실시간 진행상황 모니터링</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 팁 */}
        <div className="mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-lg font-semibold text-yellow-800 mb-3">
            💡 사용 팁
          </h3>
          <ul className="space-y-2 text-yellow-700 text-sm">
            <li>
              <strong>안전성:</strong> 작업 중 브라우저를 닫아도 서버에서 계속 처리됩니다.
            </li>
            <li>
              <strong>모니터링:</strong> 실시간으로 진행상황과 성공률을 확인할 수 있습니다.
            </li>
            <li>
              <strong>오류 처리:</strong> 실패한 작업은 자동으로 재시도되며, 최종 실패한 항목들은 별도로 기록됩니다.
            </li>
            <li>
              <strong>일시정지/재시작:</strong> 필요시 작업을 일시정지하고 나중에 재시작할 수 있습니다.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ProductPriceUpdateExample; 