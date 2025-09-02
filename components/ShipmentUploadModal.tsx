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
  onMatchComplete?: (matches: MatchedOrder[]) => void;
}

export default function ShipmentUploadModal({ isOpen, onClose, orders, onUploadComplete, onMatchComplete }: ShipmentUploadModalProps) {
  const [uploadedData, setUploadedData] = useState<ShipmentData[]>([]);
  const [matchedOrders, setMatchedOrders] = useState<MatchedOrder[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'preview' | 'complete'>('upload');
  const [failedOrders, setFailedOrders] = useState<any[]>([]);
  const [failedMatches, setFailedMatches] = useState<any[]>([]); // 매칭 실패 항목
  const [partialMatches, setPartialMatches] = useState<MatchedOrder[]>([]); // 부분 매칭 항목
  const [manualMatches, setManualMatches] = useState<Map<string, string>>(new Map()); // 수동 매칭: trackingNo -> orderId

  const normalizeString = (str: string) => {
    if (!str) return '';
    return str.replace(/[\s\-()]/g, '').toLowerCase();
  };
  
  const normalizeAddress = (address: string) => {
    if (!address) return '';
    
    // 주소 정규화: 시도 명칭 통일
    let normalized = address
      .replace(/서울특별시/g, '서울')
      .replace(/부산광역시/g, '부산')
      .replace(/대구광역시/g, '대구')
      .replace(/인천광역시/g, '인천')
      .replace(/광주광역시/g, '광주')
      .replace(/대전광역시/g, '대전')
      .replace(/울산광역시/g, '울산')
      .replace(/세종특별자치시/g, '세종')
      .replace(/경기도/g, '경기')
      .replace(/강원도/g, '강원')
      .replace(/충청북도/g, '충북')
      .replace(/충청남도/g, '충남')
      .replace(/전라북도/g, '전북')
      .replace(/전라남도/g, '전남')
      .replace(/경상북도/g, '경북')
      .replace(/경상남도/g, '경남')
      .replace(/제주특별자치도/g, '제주')
      .replace(/광역시/g, '')
      .replace(/특별시/g, '')
      .replace(/특별자치/g, '')
      .replace(/\s+/g, '') // 모든 공백 제거
      .toLowerCase();
    
    // 특수문자 제거 (하이픈은 주소의 일부이므로 유지)
    normalized = normalized.replace(/[\(\)\[\]\{\}\.,:;'"]/g, '');
    
    // 숫자 뒤 건물명/상호명 처리
    // 예: "귀인로172번길42" vs "귀인로172번길421층숨맑은집"
    // 예: "부흥로2278-13나동다비스터" vs "부흥로2278-13"
    
    // 도로명 주소 패턴 찾기 (로/길 + 숫자 또는 숫자-숫자)
    // 이 패턴 이후의 모든 텍스트는 상세주소로 간주하여 제거
    const roadPatterns = [
      /(\d+-\d+).*$/,  // 2278-13 나동 다비스터 → 2278-13
      /(\d+번길\s*\d+).*$/,  // 172번길42 1층 → 172번길42
      /(\d+로\s*\d+-\d+).*$/,  // 부흥로 2278-13 나동 → 부흥로 2278-13
      /(\d+로\s*\d+)(?!번길).*$/,  // 부흥로 2278 → 부흥로 2278
    ];
    
    for (const pattern of roadPatterns) {
      if (pattern.test(normalized)) {
        normalized = normalized.replace(pattern, '$1');
        break;
      }
    }
    
    return normalized;
  };
  
  const normalizeName = (name: string) => {
    if (!name) return '';
    // "고객*", "팀장*", "원장*" 등의 패턴 제거 (공백 포함)
    let cleaned = name.replace(/\s+(고객|팀장|원장|본부장|로스터|원두|님|씨|선생님|사장님|대표님)\*?$/gi, '').trim();
    // 마지막 * 제거
    cleaned = cleaned.replace(/\*+$/, '').trim();
    // 공백과 특수문자 제거하고 소문자로
    return cleaned.replace(/[\s\-\(\)\*]/g, '').toLowerCase();
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
        console.log('엑셀 헤더:', headers);
        
        const trackingNoIndex = headers.findIndex(h => 
          h && (h.includes('운송장') || h.includes('송장'))
        );
        const receiverNameIndex = headers.findIndex(h => 
          h && (h.includes('받는분') || h.includes('수령자') || h.includes('수취인') || h.includes('수하인'))
        );
        // 수하인전화 찾기 (송하인전화는 제외)
        const receiverPhoneIndex = headers.findIndex(h => {
          if (!h) return false;
          if (h.includes('송하인')) return false;
          return h.includes('수하인전화') || (h.includes('수하인') && h.includes('전화')) || 
                 (!h.includes('송하인') && (h.includes('전화') || h.includes('연락처')));
        });
        // 수하인우편번호 찾기 (송하인우편번호는 제외)
        const receiverZipcodeIndex = headers.findIndex(h => {
          if (!h) return false;
          if (h.includes('송하인')) return false;
          return h.includes('수하인우편번호') || (h.includes('수하인') && h.includes('우편')) ||
                 (!h.includes('송하인') && (h.includes('우편번호') || h.includes('우편')));
        });
        // 수하인주소 찾기 (송하인주소는 제외)
        const receiverAddressIndex = headers.findIndex(h => {
          if (!h) return false;
          // 송하인주소는 제외
          if (h.includes('송하인')) return false;
          // 수하인주소 또는 수하인 + 주소 포함
          return h.includes('수하인주소') || (h.includes('수하인') && h.includes('주소'));
        });
        
        console.log('컬럼 인덱스:', {
          trackingNoIndex,
          receiverNameIndex,
          receiverPhoneIndex,
          receiverZipcodeIndex,
          receiverAddressIndex
        });

        if (trackingNoIndex === -1 || receiverNameIndex === -1 || receiverAddressIndex === -1) {
          let missingColumns = [];
          if (trackingNoIndex === -1) missingColumns.push('운송장번호');
          if (receiverNameIndex === -1) missingColumns.push('수하인명(받는분)');
          if (receiverAddressIndex === -1) missingColumns.push('주소');
          
          toast.error(`필수 컬럼을 찾을 수 없습니다: ${missingColumns.join(', ')}`);
          console.error('누락된 필수 컬럼:', missingColumns);
          console.error('엑셀 헤더:', headers);
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
    const matchingLog: any[] = [];
    const matchedOrderIds = new Set<string>(); // 이미 매칭된 주문번호 추적
    
    // 디버깅: 주문 데이터 샘플 출력
    console.log('주문 데이터 샘플 (처음 3개):', orders.slice(0, 3).map(order => ({
      order_id: order.order_id,
      receiver_name: order.receiver_name,
      receiver_phone: order.receiver_phone,
      receiver_address: order.receiver_address
    })));
    
    console.log('🚚 중복 제거 모드: 동일 주문번호의 여러 상품은 첫 번째 송장번호만 사용');
    console.log('📌 주의: 동일 고객의 서로 다른 주문은 각각 송장 할당됨');
    
    shipmentData.forEach((shipment, index) => {
      const normalizedShipmentName = normalizeName(shipment.receiverName);
      const normalizedShipmentAddress = normalizeAddress(shipment.receiverAddress);
      const normalizedShipmentPhone = normalizePhone(shipment.receiverPhone);
      
      // 디버깅: 첫 번째 항목과 특정 문제 케이스 상세 로그
      if (index === 0 || 
          shipment.receiverName.includes('박병준') || 
          shipment.receiverAddress.includes('양주시') ||
          shipment.receiverAddress.includes('2278-13')) {
        console.log(`📋 매칭 시도 [${index + 1}번째]:`, {
          송장: {
            원본이름: shipment.receiverName,
            정규화이름: normalizedShipmentName,
            원본주소: shipment.receiverAddress,
            정규화주소: normalizedShipmentAddress,
            전화번호: normalizedShipmentPhone
          }
        });
        
        // 주문 데이터에서 비슷한 이름 또는 주소 찾기
        const similarOrders = orders.filter(order => 
          order.receiver_name.includes('박병준') || 
          normalizeName(order.receiver_name) === normalizedShipmentName ||
          order.receiver_address.includes('양주시') ||
          order.receiver_address.includes('2278-13')
        );
        
        if (similarOrders.length > 0) {
          console.log('유사 주문 찾음:', similarOrders.map(o => ({
            주문번호: o.order_id,
            원본이름: o.receiver_name,
            정규화이름: normalizeName(o.receiver_name),
            원본주소: o.receiver_address,
            정규화주소: normalizeAddress(o.receiver_address)
          })));
        }
      }
      
      let matchFound = false;
      let matchType: 'exact' | 'partial' | 'manual' = 'manual';
      
      // 1순위: 수하인명 매칭
      const nameMatchOrders = orders.filter(order => {
        const normalizedOrderName = normalizeName(order.receiver_name);
        return normalizedOrderName === normalizedShipmentName;
      });
      
      // 디버깅: 이름 매칭 결과
      if (index === 0) {
        console.log('이름 매칭 결과:', {
          정규화된이름: normalizedShipmentName,
          매칭개수: nameMatchOrders.length,
          매칭주문: nameMatchOrders.map(o => ({
            주문번호: o.order_id,
            이름: o.receiver_name,
            정규화된이름: normalizeName(o.receiver_name)
          }))
        });
      }
      
      if (nameMatchOrders.length === 1) {
        const orderId = nameMatchOrders[0].order_id;
        
        // 이미 매칭된 주문인지 확인
        if (matchedOrderIds.has(orderId)) {
          matchingLog.push({
            row: index + 1,
            trackingNo: shipment.trackingNo,
            shipmentName: shipment.receiverName,
            matchedOrderId: orderId,
            matchMethod: `동일 주문번호(${orderId})의 다른 상품`,
            success: false,
            reason: '이미 송장 할당됨 - 스킵'
          });
          return; // 다음 송장으로 건너뛰기
        }
        
        // 이름으로 유일하게 매칭됨
        matched.push({
          orderId: orderId,
          receiverName: nameMatchOrders[0].receiver_name,
          receiverAddress: nameMatchOrders[0].receiver_address,
          trackingNo: shipment.trackingNo,
          matchType: 'exact'
        });
        matchFound = true;
        matchType = 'exact';
        matchedOrderIds.add(orderId); // 매칭된 주문번호 추가
        
        matchingLog.push({
          row: index + 1,
          trackingNo: shipment.trackingNo,
          shipmentName: shipment.receiverName,
          matchedOrderId: orderId,
          matchedName: nameMatchOrders[0].receiver_name,
          matchMethod: '1순위: 수하인명 매칭',
          success: true
        });
      } else if (nameMatchOrders.length > 1) {
        // 이름이 여러 개 매칭되면 주소로 추가 필터링
        const addressMatchOrders = nameMatchOrders.filter(order => {
          const normalizedOrderAddress = normalizeAddress(order.receiver_address);
          const isMatch = normalizedOrderAddress.includes(normalizedShipmentAddress) || 
                         normalizedShipmentAddress.includes(normalizedOrderAddress) ||
                         normalizedOrderAddress === normalizedShipmentAddress;
          
          if (index === 0) {
            console.log('이름+주소 필터링:', {
              주문주소: normalizedOrderAddress,
              송장주소: normalizedShipmentAddress,
              매칭여부: isMatch
            });
          }
          
          return isMatch;
        });
        
        if (addressMatchOrders.length === 1) {
          const orderId = addressMatchOrders[0].order_id;
          
          // 이미 매칭된 주문인지 확인
          if (matchedOrderIds.has(orderId)) {
            matchingLog.push({
              row: index + 1,
              trackingNo: shipment.trackingNo,
              shipmentName: shipment.receiverName,
              matchedOrderId: orderId,
              matchMethod: '중복 주문 (이미 송장 할당됨)',
              success: false,
              reason: '동일 주문의 다른 상품'
            });
            return;
          }
          
          matched.push({
            orderId: orderId,
            receiverName: addressMatchOrders[0].receiver_name,
            receiverAddress: addressMatchOrders[0].receiver_address,
            trackingNo: shipment.trackingNo,
            matchType: 'exact'
          });
          matchFound = true;
          matchType = 'exact';
          matchedOrderIds.add(orderId);
          
          matchingLog.push({
            row: index + 1,
            trackingNo: shipment.trackingNo,
            shipmentName: shipment.receiverName,
            matchedOrderId: orderId,
            matchedName: addressMatchOrders[0].receiver_name,
            matchMethod: '1순위: 수하인명 + 주소 매칭',
            success: true
          });
        }
      }
      
      // 2순위: 전화번호 매칭 (1순위에서 매칭 실패 시)
      if (!matchFound && normalizedShipmentPhone) {
        const phoneMatchOrders = orders.filter(order => {
          const normalizedOrderPhone = normalizePhone(order.receiver_phone);
          return normalizedOrderPhone === normalizedShipmentPhone;
        });
        
        if (index === 0 && phoneMatchOrders.length > 0) {
          console.log('전화번호 매칭 결과:', phoneMatchOrders.length, '개');
        }
        
        if (phoneMatchOrders.length === 1) {
          const orderId = phoneMatchOrders[0].order_id;
          
          // 이미 매칭된 주문인지 확인
          if (matchedOrderIds.has(orderId)) {
            matchingLog.push({
              row: index + 1,
              trackingNo: shipment.trackingNo,
              shipmentName: shipment.receiverName,
              matchedOrderId: orderId,
              matchMethod: '중복 주문 (이미 송장 할당됨)',
              success: false,
              reason: '동일 주문의 다른 상품'
            });
            return;
          }
          
          matched.push({
            orderId: orderId,
            receiverName: phoneMatchOrders[0].receiver_name,
            receiverAddress: phoneMatchOrders[0].receiver_address,
            trackingNo: shipment.trackingNo,
            matchType: 'partial'
          });
          matchFound = true;
          matchType = 'partial';
          matchedOrderIds.add(orderId);
          
          matchingLog.push({
            row: index + 1,
            trackingNo: shipment.trackingNo,
            shipmentName: shipment.receiverName,
            shipmentPhone: shipment.receiverPhone,
            matchedOrderId: orderId,
            matchedName: phoneMatchOrders[0].receiver_name,
            matchedPhone: phoneMatchOrders[0].receiver_phone,
            matchMethod: '2순위: 전화번호 매칭',
            success: true
          });
        }
      }
      
      // 3순위: 주소 매칭 (1,2순위에서 매칭 실패 시) - 이름 무관
      if (!matchFound && normalizedShipmentAddress) {
        const addressMatchOrders = orders.filter(order => {
          const normalizedOrderAddress = normalizeAddress(order.receiver_address);
          
          // 주소가 너무 짧은 경우 스킵 (5자 미만으로 조정)
          if (normalizedShipmentAddress.length < 5) return false;
          
          // 정확한 매칭 우선
          if (normalizedOrderAddress === normalizedShipmentAddress) {
            return true;
          }
          
          // 핵심 주소 부분만 비교 (도로명 + 번지)
          // 예: "경기안양시동안구귀인로172번길42" vs "경기안양시동안구귀인로172번길421층숨맑은집"
          const extractCoreAddress = (addr: string) => {
            // 번길 또는 로 뒤의 마지막 숫자까지만 추출
            let core = addr;
            
            // 숫자-숫자 패턴 (예: 2278-13)
            if (core.match(/\d+-\d+/)) {
              const match = core.match(/(.+\d+-\d+)/);
              if (match) core = match[1];
            }
            // 번길 패턴: 번길 뒤 숫자만 남기기
            else if (core.includes('번길')) {
              const match = core.match(/(.+번길\d+)/);
              if (match) core = match[1];
            }
            // 로 패턴: 로 뒤 첫 번째 숫자만 남기기 (번길이 없는 경우)
            else if (core.includes('로') && !core.includes('번길')) {
              const match = core.match(/(.+로\d+)/);
              if (match) core = match[1];
            }
            
            return core;
          };
          
          const coreShipmentAddr = extractCoreAddress(normalizedShipmentAddress);
          const coreOrderAddr = extractCoreAddress(normalizedOrderAddress);
          
          // 핵심 주소가 일치하거나 포함관계인 경우
          if (coreOrderAddr === coreShipmentAddr || 
              coreOrderAddr.includes(coreShipmentAddr) || 
              coreShipmentAddr.includes(coreOrderAddr)) {
            return true;
          }
          
          // 기존 부분 매칭 로직
          const addressSimilarity = normalizedOrderAddress.includes(normalizedShipmentAddress) || 
                                    normalizedShipmentAddress.includes(normalizedOrderAddress);
          
          // 우편번호 매칭 (옵션)
          const zipcodeMatch = shipment.receiverZipcode && order.receiver_address?.includes(shipment.receiverZipcode);
          
          // 주소 유사도가 있거나, 우편번호가 일치하면 매칭
          return addressSimilarity || zipcodeMatch;
        });
        
        if (index === 0) {
          const extractCoreAddress = (addr: string) => {
            return addr.replace(/(\d+)(층|호|동|실|호실|번지|번길).*$/g, '$1$2');
          };
          
          console.log('주소 매칭 시도:', {
            원본송장주소: shipment.receiverAddress,
            정규화된주소: normalizedShipmentAddress,
            핵심주소: extractCoreAddress(normalizedShipmentAddress),
            길이: normalizedShipmentAddress.length,
            매칭결과: addressMatchOrders.length
          });
          
          if (orders.length > 0 && addressMatchOrders.length === 0) {
            console.log('주문 주소 예시 (매칭 실패 디버깅):', {
              원본: orders[0].receiver_address,
              정규화: normalizeAddress(orders[0].receiver_address),
              핵심: extractCoreAddress(normalizeAddress(orders[0].receiver_address))
            });
          }
        }
        
        if (addressMatchOrders.length === 1) {
          const orderId = addressMatchOrders[0].order_id;
          
          // 이미 매칭된 주문인지 확인
          if (matchedOrderIds.has(orderId)) {
            matchingLog.push({
              row: index + 1,
              trackingNo: shipment.trackingNo,
              shipmentName: shipment.receiverName,
              matchedOrderId: orderId,
              matchMethod: '중복 주문 (이미 송장 할당됨)',
              success: false,
              reason: '동일 주문의 다른 상품'
            });
            return;
          }
          
          matched.push({
            orderId: orderId,
            receiverName: addressMatchOrders[0].receiver_name,
            receiverAddress: addressMatchOrders[0].receiver_address,
            trackingNo: shipment.trackingNo,
            matchType: 'partial'
          });
          matchFound = true;
          matchType = 'partial';
          matchedOrderIds.add(orderId);
          
          const isNameDifferent = normalizeName(addressMatchOrders[0].receiver_name) !== normalizedShipmentName;
          
          matchingLog.push({
            row: index + 1,
            trackingNo: shipment.trackingNo,
            shipmentName: shipment.receiverName,
            shipmentAddress: shipment.receiverAddress,
            matchedOrderId: orderId,
            matchedName: addressMatchOrders[0].receiver_name,
            matchedAddress: addressMatchOrders[0].receiver_address,
            matchMethod: isNameDifferent ? '3순위: 주소 매칭 (이름 불일치)' : '3순위: 주소 매칭',
            success: true,
            note: isNameDifferent ? `송장: ${shipment.receiverName} ≠ 주문: ${addressMatchOrders[0].receiver_name}` : undefined
          });
        }
      }
      
      // 매칭 실패 로그
      if (!matchFound) {
        matchingLog.push({
          row: index + 1,
          trackingNo: shipment.trackingNo,
          shipmentName: shipment.receiverName,
          shipmentPhone: shipment.receiverPhone,
          shipmentAddress: shipment.receiverAddress,
          matchMethod: '매칭 실패',
          success: false,
          reason: '일치하는 주문을 찾을 수 없음'
        });
      }
    });

    // 매칭 결과 분류
    const exactMatches = matched.filter(m => m.matchType === 'exact');
    const partialMatchList = matched.filter(m => m.matchType === 'partial');
    const failedMatchList = matchingLog.filter(log => !log.success);
    
    // 디버깅 로그 출력
    console.group('📦 송장 매칭 결과');
    console.log(`총 ${shipmentData.length}개 송장 처리`);
    console.log(`✅ 정확 매칭: ${exactMatches.length}개`);
    console.log(`⚠️ 부분 매칭: ${partialMatchList.length}개`);
    console.log(`❌ 매칭 실패: ${failedMatchList.length}개`);
    console.table(matchingLog);
    console.groupEnd();

    setMatchedOrders(matched);
    setPartialMatches(partialMatchList);
    setFailedMatches(failedMatchList);
    
    // 매칭 완료 시 콜백 호출
    if (onMatchComplete) {
      onMatchComplete(matched);
    }
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

  // 수동으로 주문번호 입력 처리
  const handleManualMatch = (trackingNo: string, orderId: string) => {
    const newManualMatches = new Map(manualMatches);
    
    if (orderId.trim()) {
      // 유효한 주문번호인지 확인
      const orderExists = orders.some(order => order.order_id === orderId);
      if (!orderExists) {
        toast.error(`주문번호 ${orderId}를 찾을 수 없습니다.`);
        return;
      }
      
      newManualMatches.set(trackingNo, orderId);
      
      // 해당 실패 항목을 매칭 목록에 추가
      const failedItem = failedMatches.find(f => f.trackingNo === trackingNo);
      if (failedItem) {
        const order = orders.find(o => o.order_id === orderId);
        if (order) {
          const newMatch: MatchedOrder = {
            orderId: order.order_id,
            receiverName: order.receiver_name,
            receiverAddress: order.receiver_address,
            trackingNo: trackingNo,
            matchType: 'manual'
          };
          
          // 매칭 목록에 추가
          setMatchedOrders(prev => [...prev, newMatch]);
          
          // 실패 목록에서 제거
          setFailedMatches(prev => prev.filter(f => f.trackingNo !== trackingNo));
          
          toast.success(`송장번호 ${trackingNo}를 주문 ${orderId}에 수동 매칭했습니다.`);
        }
      }
    } else {
      newManualMatches.delete(trackingNo);
    }
    
    setManualMatches(newManualMatches);
  };

  const handleConfirmUpload = async () => {
    setIsProcessing(true);
    const failed: any[] = [];

    // 전송 전 최종 확인 로그
    console.group('🚀 카페24 송장 등록 시작');
    console.log(`총 ${matchedOrders.length}개 주문 처리 예정`);
    console.table(matchedOrders.map((order, index) => ({
      순번: index + 1,
      주문번호: order.orderId,
      수취인: order.receiverName,
      송장번호: order.trackingNo,
      매칭타입: order.matchType
    })));
    console.groupEnd();

    try {
      // 100개씩 나누어 처리
      const batchSize = 100;
      const batches = [];
      
      for (let i = 0; i < matchedOrders.length; i += batchSize) {
        batches.push(matchedOrders.slice(i, i + batchSize));
      }

      let totalSuccess = 0;
      let batchIndex = 0;
      
      for (const batch of batches) {
        batchIndex++;
        console.group(`📤 배치 ${batchIndex}/${batches.length} 전송`);
        console.log(`처리 건수: ${batch.length}개`);
        
        // 대량 등록 API 사용
        const ordersToRegister = batch.map(match => ({
          order_id: match.orderId,
          tracking_no: match.trackingNo,
          shipping_company_code: '0003', // 한진택배 코드
          status: 'standby'
        }));

        console.table(ordersToRegister);

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
            console.log(`✅ 성공: ${result.succeeded || 0}개`);
            totalSuccess += result.succeeded || 0;
            
            // 실패한 건들 수집
            if (result.failed && result.failed.length > 0) {
              console.warn(`⚠️ 실패: ${result.failed.length}개`);
              console.table(result.failed);
              
              result.failed.forEach((failedOrder: any) => {
                failed.push({
                  orderId: failedOrder.order_id,
                  trackingNo: failedOrder.tracking_no,
                  error: failedOrder.error || '등록 실패'
                });
              });
            }
          } else {
            console.error(`❌ 배치 전체 실패: ${result.error}`);
            console.error(result);
            
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
          console.error('❌ 네트워크 오류:', error);
          
          // 네트워크 오류 시
          batch.forEach(match => {
            failed.push({
              orderId: match.orderId,
              trackingNo: match.trackingNo,
              error: '네트워크 오류'
            });
          });
        } finally {
          console.groupEnd();
        }
      }

      setFailedOrders(failed);
      setCurrentStep('complete');
      
      // 최종 결과 로그
      console.group('📊 카페24 송장 등록 완료');
      console.log(`✅ 성공: ${totalSuccess}개`);
      console.log(`❌ 실패: ${failed.length}개`);
      if (failed.length > 0) {
        console.table(failed);
      }
      console.groupEnd();
      
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
    setFailedMatches([]);
    setPartialMatches([]);
    setManualMatches(new Map());
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
                  </>
                )}
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">지원 컬럼명</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• <strong>운송장번호</strong> (필수): "운송장", "송장"이 포함된 컬럼</li>
                  <li>• <strong>수하인명</strong> (필수): "수하인", "받는분", "수령자", "수취인"이 포함된 컬럼</li>
                  <li>• <strong>수하인주소</strong> (필수): "수하인주소" 또는 "수하인"+"주소"가 포함된 컬럼</li>
                  <li>• <strong>수하인전화</strong> (선택): "수하인전화" 또는 "수하인"+"전화"가 포함된 컬럼</li>
                </ul>
                <p className="text-xs text-blue-600 mt-2">
                  ※ 매칭 우선순위: 1순위(수하인명) → 2순위(전화번호) → 3순위(주소)
                </p>
              </div>
            </div>
          )}

          {currentStep === 'preview' && (
            <div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">매칭 결과</h3>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-600">
                      ✅ 정확: {matchedOrders.filter(m => m.matchType === 'exact').length}
                    </span>
                    <span className="text-yellow-600">
                      ⚠️ 부분: {partialMatches.length}
                    </span>
                    <span className="text-red-600">
                      ❌ 실패: {failedMatches.length}
                    </span>
                  </div>
                </div>
                
                {/* 매칭 실패 경고 */}
                {failedMatches.length > 0 && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start">
                      <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2" />
                      <div>
                        <p className="text-sm font-medium text-red-800">
                          {failedMatches.length}개 항목이 매칭되지 않았습니다
                        </p>
                        <p className="text-xs text-red-600 mt-1">
                          수하인명과 주소가 정확한지 확인해주세요. 아래 실패 목록을 참고하세요.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 탭 버튼 */}
              <div className="flex gap-2 mb-4 border-b border-gray-200">
                <button
                  className="px-4 py-2 border-b-2 border-blue-500 text-blue-600 font-medium"
                >
                  매칭 성공 ({matchedOrders.length})
                </button>
                <button
                  className="px-4 py-2 border-b-2 border-transparent text-gray-600 hover:text-gray-800"
                  onClick={() => {
                    // 실패 목록 표시 토글 (추후 구현)
                  }}
                >
                  매칭 실패 ({failedMatches.length})
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">주문번호</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">수취인</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">주소</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">송장번호</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">매칭 방법</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {matchedOrders.map((match, index) => (
                      <tr key={index} className={match.matchType === 'partial' ? 'bg-yellow-50' : ''}>
                        <td className="px-4 py-2 text-sm text-gray-900">{match.orderId}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{match.receiverName}</td>
                        <td className="px-4 py-2 text-sm text-gray-600 text-xs">{match.receiverAddress}</td>
                        <td className="px-4 py-2 text-sm font-mono text-blue-600">{match.trackingNo}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            match.matchType === 'exact' 
                              ? 'bg-green-100 text-green-800' 
                              : match.matchType === 'manual'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {match.matchType === 'exact' ? '정확 매칭' : 
                             match.matchType === 'manual' ? '수동 매칭' : '부분 매칭'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 매칭 실패 목록 */}
              {failedMatches.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold text-gray-900 mb-3">
                    매칭 실패 목록 
                    <span className="text-sm font-normal text-gray-600 ml-2">
                      (주문번호를 직접 입력하여 수동 매칭 가능)
                    </span>
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-red-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">행</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">송장번호</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">수취인명</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">주소</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">실패 사유</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">수동 매칭</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {failedMatches.map((fail, index) => (
                          <tr key={index} className="bg-red-50">
                            <td className="px-4 py-2 text-sm text-gray-900">{fail.row}</td>
                            <td className="px-4 py-2 text-sm font-mono text-gray-600">{fail.trackingNo}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{fail.shipmentName}</td>
                            <td className="px-4 py-2 text-sm text-gray-600 text-xs">{fail.shipmentAddress}</td>
                            <td className="px-4 py-2 text-sm text-red-600">{fail.reason || fail.matchMethod}</td>
                            <td className="px-4 py-2">
                              <input
                                type="text"
                                placeholder="주문번호 입력"
                                className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onBlur={(e) => handleManualMatch(fail.trackingNo, e.target.value)}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    handleManualMatch(fail.trackingNo, (e.target as HTMLInputElement).value);
                                  }
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 text-sm text-gray-600">
                    <p>💡 팁: 주문번호 형식은 "20250901-0000024"와 같습니다.</p>
                    <p className="mt-1">입력 후 Enter 키를 누르거나 다른 곳을 클릭하면 매칭됩니다.</p>
                  </div>
                </div>
              )}

              {matchedOrders.length === 0 && failedMatches.length === 0 && (
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