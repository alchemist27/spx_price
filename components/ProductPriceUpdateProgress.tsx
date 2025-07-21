'use client';

import React, { useState, useEffect } from 'react';
import { UpdateProgress } from '@/lib/product-price-updater';

interface ProductPriceUpdateProgressProps {
  progress: UpdateProgress;
  isRunning: boolean;
  onStop?: () => void;
  onResume?: () => void;
}

const ProductPriceUpdateProgress: React.FC<ProductPriceUpdateProgressProps> = ({
  progress,
  isRunning,
  onStop,
  onResume
}) => {
  const [expandedErrors, setExpandedErrors] = useState(false);

  const formatTime = (minutes: number): string => {
    if (minutes < 1) return '1분 이내';
    if (minutes < 60) return `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}시간 ${remainingMinutes}분`;
  };

  const getStatusColor = () => {
    if (progress.failed > 0) return 'text-red-600';
    if (progress.completed === progress.total) return 'text-green-600';
    return 'text-blue-600';
  };

  const getProgressBarColor = () => {
    if (progress.failed > 0) return 'bg-red-500';
    if (progress.completed === progress.total) return 'bg-green-500';
    return 'bg-blue-500';
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          상품 가격 업데이트 진행상황
        </h2>
        <div className="flex gap-2">
          {isRunning ? (
            <button
              onClick={onStop}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            >
              ⏸️ 일시정지
            </button>
          ) : (
            <button
              onClick={onResume}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
            >
              ▶️ 재시작
            </button>
          )}
        </div>
      </div>

      {/* 진행률 바 */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className={`text-lg font-semibold ${getStatusColor()}`}>
            {progress.percentage}% 완료
          </span>
          <span className="text-sm text-gray-600">
            {progress.completed} / {progress.total} 작업
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className={`h-4 rounded-full transition-all duration-300 ${getProgressBarColor()}`}
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>

      {/* 현재 작업 정보 */}
      {isRunning && progress.current_product && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-800 mb-2">🔄 현재 처리중</h3>
          <p className="text-blue-700">
            <span className="font-medium">{progress.current_product}</span>
            <span className="mx-2">-</span>
            <span>{progress.current_step}</span>
          </p>
        </div>
      )}

      {/* 통계 정보 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="text-2xl font-bold text-green-600">
            {progress.completed}
          </div>
          <div className="text-sm text-green-700">완료됨</div>
        </div>
        
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <div className="text-2xl font-bold text-red-600">
            {progress.failed}
          </div>
          <div className="text-sm text-red-700">실패함</div>
        </div>
        
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="text-2xl font-bold text-yellow-600">
            {progress.total - progress.completed}
          </div>
          <div className="text-sm text-yellow-700">남은 작업</div>
        </div>
        
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <div className="text-2xl font-bold text-purple-600">
            {formatTime(progress.estimated_remaining_time)}
          </div>
          <div className="text-sm text-purple-700">예상 남은 시간</div>
        </div>
      </div>

      {/* 성공률 */}
      {progress.completed > 0 && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-700">현재 성공률</span>
            <span className={`text-lg font-bold ${
              ((progress.completed / (progress.completed + progress.failed)) * 100) >= 95 
                ? 'text-green-600' 
                : 'text-yellow-600'
            }`}>
              {Math.round((progress.completed / (progress.completed + progress.failed)) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* 오류 목록 */}
      {progress.errors.length > 0 && (
        <div className="border border-red-200 rounded-lg">
          <button
            onClick={() => setExpandedErrors(!expandedErrors)}
            className="w-full p-4 text-left bg-red-50 hover:bg-red-100 transition-colors rounded-t-lg"
          >
            <div className="flex justify-between items-center">
              <span className="font-semibold text-red-800">
                ❌ 오류 발생 ({progress.errors.length}개)
              </span>
              <span className="text-red-600">
                {expandedErrors ? '▲' : '▼'}
              </span>
            </div>
          </button>
          
          {expandedErrors && (
            <div className="p-4 bg-white border-t border-red-200 max-h-60 overflow-y-auto">
              {progress.errors.map((error, index) => (
                <div
                  key={index}
                  className="mb-3 p-3 bg-red-50 rounded border border-red-200"
                >
                  <div className="font-medium text-red-800">
                    {error.product_name} - {error.step}
                  </div>
                  <div className="text-sm text-red-600 mt-1">
                    {error.error}
                  </div>
                  <div className="text-xs text-red-500 mt-2">
                    {error.timestamp.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 완료 메시지 */}
      {progress.completed === progress.total && (
        <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center">
            <span className="text-2xl mr-3">🎉</span>
            <div>
              <h3 className="font-semibold text-green-800">
                모든 작업이 완료되었습니다!
              </h3>
              <p className="text-green-700 text-sm">
                총 {progress.total}개 작업 중 {progress.completed}개 성공, {progress.failed}개 실패
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 안내 메시지 */}
      {isRunning && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-blue-700 text-sm">
            💡 작업이 진행 중입니다. 안전하게 완료될 때까지 기다려주세요. 
            브라우저를 닫아도 백그라운드에서 계속 처리됩니다.
          </p>
        </div>
      )}
    </div>
  );
};

export default ProductPriceUpdateProgress; 