'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { X, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Download } from 'lucide-react';
import toast from 'react-hot-toast';

interface ShipmentData {
  trackingNo: string;
  receiverName: string;
  receiverPhone: string;
  receiverZipcode: string;
  receiverAddress: string;
  originalRow: number;
}

interface MatchedOrder {
  orderId: string;
  receiverName: string;
  receiverAddress: string;
  trackingNo: string;
  matchType: 'exact' | 'partial' | 'manual';
}

interface ShipmentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: any[];
  onUploadComplete: () => void;
}

export default function ShipmentUploadModal({ isOpen, onClose, orders, onUploadComplete }: ShipmentUploadModalProps) {
  const [uploadedData, setUploadedData] = useState<ShipmentData[]>([]);
  const [matchedOrders, setMatchedOrders] = useState<MatchedOrder[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'preview' | 'complete'>('upload');
  const [failedOrders, setFailedOrders] = useState<any[]>([]);

  const normalizeString = (str: string) => {
    if (!str) return '';
    return str.replace(/[\s\-()]/g, '').toLowerCase();
  };

  const normalizePhone = (phone: string) => {
    if (!phone) return '';
    return phone.replace(/[\s\-()]/g, '');
  };

  const processExcelFile = (file: File) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        const headers = jsonData[0] as string[];
        const trackingNoIndex = headers.findIndex(h => 
          h && (h.includes('운송장') || h.includes('송장'))
        );
        const receiverNameIndex = headers.findIndex(h => 
          h && (h.includes('받는분') || h.includes('수령자') || h.includes('수취인'))
        );
        const receiverPhoneIndex = headers.findIndex(h => 
          h && (h.includes('전화') || h.includes('연락처'))
        );
        const receiverZipcodeIndex = headers.findIndex(h => 
          h && (h.includes('우편번호') || h.includes('우편'))
        );
        const receiverAddressIndex = headers.findIndex(h => 
          h && (h.includes('주소'))
        );

        if (trackingNoIndex === -1 || receiverNameIndex === -1 || receiverAddressIndex === -1) {
          toast.error('필수 컬럼(운송장번호, 받는분, 주소)을 찾을 수 없습니다.');
          return;
        }

        const uniqueMap = new Map<string, ShipmentData>();
        
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          if (!row[trackingNoIndex]) continue;
          
          const receiverName = String(row[receiverNameIndex] || '');
          const zipcode = String(row[receiverZipcodeIndex] || '');
          const address = String(row[receiverAddressIndex] || '');
          
          const uniqueKey = `${normalizeString(receiverName)}|${zipcode}|${normalizeString(address)}`;
          
          if (!uniqueMap.has(uniqueKey)) {
            uniqueMap.set(uniqueKey, {
              trackingNo: String(row[trackingNoIndex]),
              receiverName: receiverName,
              receiverPhone: String(row[receiverPhoneIndex] || ''),
              receiverZipcode: zipcode,
              receiverAddress: address,
              originalRow: i + 1
            });
          }
        }

        const uniqueData = Array.from(uniqueMap.values());
        setUploadedData(uniqueData);
        
        matchWithOrders(uniqueData);
        setCurrentStep('preview');
        
        toast.success(`${uniqueData.length}개의 고유한 배송 정보를 추출했습니다.`);
      } catch (error) {
        console.error('Excel processing error:', error);
        toast.error('엑셀 파일 처리 중 오류가 발생했습니다.');
      }
    };

    reader.readAsBinaryString(file);
  };

  const matchWithOrders = (shipmentData: ShipmentData[]) => {
    const matched: MatchedOrder[] = [];
    
    shipmentData.forEach(shipment => {
      const normalizedShipmentName = normalizeString(shipment.receiverName);
      const normalizedShipmentAddress = normalizeString(shipment.receiverAddress);
      const normalizedShipmentPhone = normalizePhone(shipment.receiverPhone);
      
      const matchingOrders = orders.filter(order => {
        const normalizedOrderName = normalizeString(order.receiver_name);
        const normalizedOrderAddress = normalizeString(order.receiver_address);
        const normalizedOrderPhone = normalizePhone(order.receiver_phone);
        
        const nameMatch = normalizedOrderName === normalizedShipmentName;
        const zipcodeMatch = order.receiver_address?.includes(shipment.receiverZipcode);
        const addressMatch = normalizedOrderAddress === normalizedShipmentAddress;
        
        if (nameMatch && zipcodeMatch && addressMatch) {
          return true;
        }
        
        const phoneMatch = normalizedOrderPhone === normalizedShipmentPhone;
        const addressSimilarity = normalizedOrderAddress.includes(normalizedShipmentAddress) || 
                                  normalizedShipmentAddress.includes(normalizedOrderAddress);
        
        if (zipcodeMatch && addressSimilarity) {
          return true;
        }
        
        if (phoneMatch && (nameMatch || addressSimilarity)) {
          return true;
        }
        
        return false;
      });

      matchingOrders.forEach(order => {
        matched.push({
          orderId: order.order_id,
          receiverName: order.receiver_name,
          receiverAddress: order.receiver_address,
          trackingNo: shipment.trackingNo,
          matchType: 'exact'
        });
      });
    });

    setMatchedOrders(matched);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      processExcelFile(file);
    }
  }, [orders]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    maxFiles: 1
  });

  const handleConfirmUpload = async () => {
    setIsProcessing(true);
    const failed: any[] = [];

    try {
      // 100개씩 나누어 처리
      const batchSize = 100;
      const batches = [];
      
      for (let i = 0; i < matchedOrders.length; i += batchSize) {
        batches.push(matchedOrders.slice(i, i + batchSize));
      }

      let totalSuccess = 0;
      
      for (const batch of batches) {
        // 대량 등록 API 사용
        const ordersToRegister = batch.map(match => ({
          order_id: match.orderId,
          tracking_no: match.trackingNo,
          shipping_company_code: '0003', // 한진택배 코드
          status: 'standby'
        }));

        try {
          const response = await fetch('/api/shipments/batch', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              orders: ordersToRegister
            })
          });

          const result = await response.json();
          
          if (response.ok) {
            totalSuccess += result.succeeded || 0;
            
            // 실패한 건들 수집
            if (result.failed && result.failed.length > 0) {
              result.failed.forEach((failedOrder: any) => {
                failed.push({
                  orderId: failedOrder.order_id,
                  trackingNo: failedOrder.tracking_no,
                  error: failedOrder.error || '등록 실패'
                });
              });
            }
          } else {
            // 전체 배치 실패 시
            batch.forEach(match => {
              failed.push({
                orderId: match.orderId,
                trackingNo: match.trackingNo,
                error: result.error || '등록 실패'
              });
            });
          }
        } catch (error) {
          // 네트워크 오류 시
          batch.forEach(match => {
            failed.push({
              orderId: match.orderId,
              trackingNo: match.trackingNo,
              error: '네트워크 오류'
            });
          });
        }
      }

      setFailedOrders(failed);
      setCurrentStep('complete');
      
      if (totalSuccess > 0) {
        toast.success(`${totalSuccess}개 주문에 송장번호를 등록했습니다.`);
        onUploadComplete();
      }
      
      if (failed.length > 0) {
        toast.error(`${failed.length}개 주문 등록에 실패했습니다.`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('송장 등록 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadFailedOrders = () => {
    const csvContent = [
      ['주문번호', '송장번호', '오류 메시지'],
      ...failedOrders.map(item => [item.orderId, item.trackingNo, item.error])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `failed_shipments_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleClose = () => {
    setUploadedData([]);
    setMatchedOrders([]);
    setFailedOrders([]);
    setCurrentStep('upload');
    setIsProcessing(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              송장번호 일괄 등록
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {currentStep === 'upload' && (
            <div>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <input {...getInputProps()} />
                <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                {isDragActive ? (
                  <p className="text-lg text-blue-600">파일을 놓아주세요...</p>
                ) : (
                  <>
                    <p className="text-lg text-gray-600 mb-2">
                      엑셀 파일을 드래그하거나 클릭하여 선택하세요
                    </p>
                    <p className="text-sm text-gray-500">
                      지원 형식: .xlsx, .xls, .csv
                    </p>
                  </>
                )}
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">필수 컬럼</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• 운송장번호</li>
                  <li>• 받는분 (수취인 이름)</li>
                  <li>• 받는분 전화번호</li>
                  <li>• 받는분 우편번호</li>
                  <li>• 받는분 주소</li>
                </ul>
              </div>
            </div>
          )}

          {currentStep === 'preview' && (
            <div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">매칭 결과</h3>
                  <div className="text-sm text-gray-600">
                    총 {matchedOrders.length}개 주문 매칭됨
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">주문번호</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">수취인</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">주소</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">송장번호</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {matchedOrders.map((match, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2 text-sm text-gray-900">{match.orderId}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{match.receiverName}</td>
                        <td className="px-4 py-2 text-sm text-gray-600 text-xs">{match.receiverAddress}</td>
                        <td className="px-4 py-2 text-sm font-mono text-blue-600">{match.trackingNo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {matchedOrders.length === 0 && (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                  <p className="text-gray-600">매칭된 주문이 없습니다.</p>
                </div>
              )}
            </div>
          )}

          {currentStep === 'complete' && (
            <div className="text-center py-8">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                송장 등록 완료
              </h3>
              <p className="text-gray-600 mb-4">
                성공: {matchedOrders.length - failedOrders.length}건 / 실패: {failedOrders.length}건
              </p>
              
              {failedOrders.length > 0 && (
                <button
                  onClick={downloadFailedOrders}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 mx-auto"
                >
                  <Download className="h-4 w-4" />
                  실패 목록 다운로드
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200">
          <div className="flex justify-end gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              닫기
            </button>
            {currentStep === 'preview' && matchedOrders.length > 0 && (
              <button
                onClick={handleConfirmUpload}
                disabled={isProcessing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    처리 중...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    송장 등록하기
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}