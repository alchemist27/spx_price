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

interface ProcessingStatus {
  [key: string]: {
    status: 'pending' | 'processing' | 'success' | 'failed';
    message?: string;
    shippingCode?: string;
  };
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
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({}); // 개별 처리 상태

  const normalizeString = (str: string) => {
    if (!str) return '';
    return str.replace(/[\s\-()]/g, '').toLowerCase();
  };
  
  const normalizeAddress = (address: string) => {
    if (!address) return '';
    
    // 먼저 여러 공백을 하나로 통일
    let normalized = address.replace(/\s+/g, ' ').trim();
    
    // 주소 정규화: 시도 명칭 통일
    normalized = normalized
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
      .replace(/특별자치/g, '');
    
    // 모든 공백 제거 (정규화 최종 단계)
    normalized = normalized.replace(/\s+/g, '');
    
    // 특수문자 제거 (하이픈은 주소의 일부이므로 유지)
    normalized = normalized.replace(/[\(\)\[\]\{\}\.,:;'"]/g, '');
    
    // 소문자로 변환
    normalized = normalized.toLowerCase();
    
    // 숫자 뒤 건물명/상호명 처리
    // 예: "귀인로172번길42" vs "귀인로172번길421층숨맑은집"
    // 예: "부흥로2278-13나동다비스터" vs "부흥로2278-13"
    
    // 도로명 주소 패턴 뒤의 상세주소 제거
    // 주의: 기본 주소는 유지하면서 건물명/층수 등만 제거
    
    // 1. 명확한 상세주소 키워드가 있는 경우 제거
    normalized = normalized.replace(/(층|호|동|실|호실|관|빌딩|아파트|오피스텔|상가|타워|센터|프라자|빌라|하우스|맨션|파크).*$/g, '');
    
    // 2. 도로명 주소 뒤 한글 건물명 제거 (숫자는 유지)
    // 번길 패턴: "172번길42" 뒤의 한글 제거
    if (normalized.includes('번길')) {
      normalized = normalized.replace(/(\d+번길\d+)[가-힣].*$/g, '$1');
    }
    // 숫자-숫자 패턴: "2278-13" 뒤의 한글 제거
    if (normalized.includes('-')) {
      normalized = normalized.replace(/(\d+-\d+)[가-힣].*$/g, '$1');
    }
    
    return normalized;
  };
  
  const normalizeName = (name: string) => {
    if (!name) return '';
    let cleaned = name.trim();
    
    // "고객*", "팀장*" 등의 패턴 제거 - 더 포괄적으로
    // 공백이 있든 없든 처리 (예: "박병준 고객*", "박병준고객*")
    // 담당자, 사장 패턴 추가
    cleaned = cleaned.replace(/\s*(고객|팀장|원장|본부장|로스터|원두|님|씨|선생님|사장님|대표님|담당자|사장)\**/gi, '');
    
    // 별표 제거
    cleaned = cleaned.replace(/\*/g, '').trim();
    
    // 공백과 특수문자 제거하고 소문자로
    return cleaned.replace(/[\s\-\(\)]/g, '').toLowerCase();
  };
  
  // 개선된 이름 정규화 (직급/호칭 추가 제거)
  const normalizeNameEnhanced = (name: string) => {
    if (!name) return '';
    let cleaned = name.trim();
    
    // 확장된 직급/호칭 패턴 (실장, 과장, 대리, 부장, 차장, 담당자, 사장 등 추가)
    const expandedTitlePattern = /\s*(고객|팀장|원장|본부장|실장|과장|대리|사원|매니저|이사|대표|사장|부장|차장|님|씨|선생님|사장님|대표님|로스터|원두|담당자)\**/gi;
    
    // 직급/호칭이 이름 뒤에 붙은 경우 제거 (예: "김준열 실장")
    cleaned = cleaned.replace(/\s+(실장|과장|대리|팀장|부장|차장|이사|사원|담당자|사장)$/g, '');
    cleaned = cleaned.replace(expandedTitlePattern, '');
    
    // 별표 제거
    cleaned = cleaned.replace(/\*/g, '').trim();
    
    // 공백과 특수문자 제거하고 소문자로
    return cleaned.replace(/[\s\-\(\)]/g, '').toLowerCase();
  };
  
  // 회사명 정규화 (주식회사, (주) 등 제거)
  const normalizeCompanyName = (name: string) => {
    if (!name) return '';
    
    // 앞뒤의 회사 형태 제거
    let normalized = name
      .replace(/^(주식회사|주\)|유한회사|합자회사|\(주\))\s*/gi, '')
      .replace(/\s*(주식회사|주\)|유한회사|합자회사|\(주\))$/gi, '')
      .trim();
    
    // 공백과 특수문자 제거하고 소문자로
    return normalized.replace(/[\s\-\(\)]/g, '').toLowerCase();
  };
  
  // 비식별 처리된 이름 비교 (별표 무시하고 유사도 체크)
  const areNamesSimilarWithMasking = (name1: string, name2: string): boolean => {
    if (!name1 || !name2) return false;
    
    // 별표를 제거한 버전
    const clean1 = name1.replace(/\*/g, '').trim();
    const clean2 = name2.replace(/\*/g, '').trim();
    
    // 완전 일치
    if (clean1 === clean2) return true;
    
    // 정규화 후 비교
    const normalized1 = normalizeNameEnhanced(clean1);
    const normalized2 = normalizeNameEnhanced(clean2);
    if (normalized1 === normalized2) return true;
    
    // 한쪽에 별표가 있고, 나머지 부분이 포함관계인 경우
    // 예: "주식회사 그린로더*" vs "주식회사 그린로더"
    // 예: "커피통로스터*" vs "커피통로스터"
    if ((name1.includes('*') || name2.includes('*'))) {
      const base1 = clean1.toLowerCase();
      const base2 = clean2.toLowerCase();
      
      // 짧은 쪽이 긴 쪽에 포함되는지 확인
      if (base1.length < base2.length) {
        return base2.startsWith(base1) || base2.includes(base1);
      } else {
        return base1.startsWith(base2) || base1.includes(base2);
      }
    }
    
    // 글자 대부분이 일치하는지 확인 (80% 이상)
    const minLength = Math.min(clean1.length, clean2.length);
    const maxLength = Math.max(clean1.length, clean2.length);
    
    if (minLength >= 3 && minLength / maxLength >= 0.8) {
      // 앞부분이 일치하는지 확인
      const commonPrefix = getCommonPrefixLength(clean1.toLowerCase(), clean2.toLowerCase());
      if (commonPrefix >= minLength * 0.8) {
        return true;
      }
    }
    
    return false;
  };
  
  // 공통 접두사 길이 계산
  const getCommonPrefixLength = (str1: string, str2: string): number => {
    let i = 0;
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
      i++;
    }
    return i;
  };

  const normalizePhone = (phone: string) => {
    if (!phone) return '';
    return phone.replace(/[\s\-()]/g, '');
  };
  
  // 도로명 주소의 기본 부분만 추출 (동/호 정보 제외)
  const extractBaseAddress = (address: string) => {
    if (!address) return '';
    
    // 먼저 기본 정규화 적용
    const normalized = normalizeAddress(address);
    
    // 도로명 주소 패턴에서 기본 부분만 추출
    // 예: "경기안양시동안구귀인로172번길42" → "경기안양시동안구귀인로172번길42"
    // 예: "대구수성구들안로42길24" → "대구수성구들안로42길24"
    
    // 번지/번길 뒤의 숫자까지만 추출 (건물명, 동호수 제외)
    const patterns = [
      /(.*?(?:로|길)\d+번길\d+)/,  // ~로123번길45
      /(.*?(?:로|길)\d+-\d+)/,      // ~로123-45
      /(.*?(?:로|길)\d+)/,          // ~로123
    ];
    
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    // 패턴이 매칭되지 않으면 원본 정규화 주소 반환
    return normalized;
  };

  const processExcelFile = (file: File) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { 
          type: 'binary',
          // 송장번호를 텍스트로 읽기 위한 옵션
          raw: false,
          cellText: false,
          cellDates: true
        });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { 
          header: 1,
          raw: false, // 숫자를 문자열로 변환
          defval: ''
        });
        
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
            // 송장번호를 문자열로 변환하고 정리
            let trackingNumber = String(row[trackingNoIndex] || '').trim();
            // 과학적 표기법(예: 4.6E+12) 처리
            if (trackingNumber.includes('E+') || trackingNumber.includes('e+')) {
              trackingNumber = parseFloat(trackingNumber).toFixed(0);
            }
            // 소수점 제거
            trackingNumber = trackingNumber.replace(/\.0+$/, '');
            
            console.log(`송장번호 처리 [행 ${i+1}]:`, {
              원본값: row[trackingNoIndex],
              변환값: trackingNumber
            });
            
            uniqueMap.set(uniqueKey, {
              trackingNo: trackingNumber,
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
    
    // 동일 수령자의 분할 주문 처리를 위한 맵
    const customerOrdersMap = new Map<string, string[]>(); // 정규화된 이름 -> 주문ID 배열
    const customerShipmentsMap = new Map<string, ShipmentData[]>(); // 정규화된 이름 -> 송장 배열
    const customerOrderIndex = new Map<string, number>(); // 라운드 로빈을 위한 인덱스
    
    // 주문을 고객별로 그룹화
    orders.forEach(order => {
      const normalizedName = normalizeName(order.receiver_name);
      const enhancedName = normalizeNameEnhanced(order.receiver_name);
      const companyName = normalizeCompanyName(order.receiver_name);
      
      // 여러 정규화 방식으로 그룹화
      [normalizedName, enhancedName, companyName].forEach(name => {
        if (name && !matchedOrderIds.has(order.order_id)) {
          if (!customerOrdersMap.has(name)) {
            customerOrdersMap.set(name, []);
          }
          if (!customerOrdersMap.get(name)!.includes(order.order_id)) {
            customerOrdersMap.get(name)!.push(order.order_id);
          }
        }
      });
    });
    
    // 송장을 고객별로 그룹화
    shipmentData.forEach(shipment => {
      const normalizedName = normalizeName(shipment.receiverName);
      const enhancedName = normalizeNameEnhanced(shipment.receiverName);
      const companyName = normalizeCompanyName(shipment.receiverName);
      
      [normalizedName, enhancedName, companyName].forEach(name => {
        if (name) {
          if (!customerShipmentsMap.has(name)) {
            customerShipmentsMap.set(name, []);
          }
          if (!customerShipmentsMap.get(name)!.includes(shipment)) {
            customerShipmentsMap.get(name)!.push(shipment);
          }
        }
      });
    });
    
    // 디버깅: 주문 데이터 샘플 출력
    console.log('주문 데이터 샘플 (처음 3개):', orders.slice(0, 3).map(order => ({
      order_id: order.order_id,
      receiver_name: order.receiver_name,
      receiver_phone: order.receiver_phone,
      receiver_address: order.receiver_address
    })));
    
    console.log('🚚 개선된 매칭 모드: 하이브리드 접근법 (기존 로직 + 개선 로직)');
    console.log('📌 동일 고객 분할 주문 자동 감지 및 처리');
    
    shipmentData.forEach((shipment, index) => {
      // ===== 1단계: 기존 정규화 시도 =====
      const normalizedShipmentName = normalizeName(shipment.receiverName);
      const normalizedShipmentAddress = normalizeAddress(shipment.receiverAddress);
      const normalizedShipmentPhone = normalizePhone(shipment.receiverPhone);
      
      // 디버깅: 첫 번째 항목과 특정 문제 케이스 상세 로그
      if (index === 0 || 
          shipment.receiverName.includes('박병준') || 
          shipment.receiverAddress.includes('양주시') ||
          shipment.receiverAddress.includes('2278-13') ||
          shipment.receiverAddress.includes('귀인로')) {
        console.log(`📋 매칭 시도 [${index + 1}번째]:`, {
          송장: {
            원본이름: shipment.receiverName,
            정규화이름: normalizedShipmentName,
            원본주소: shipment.receiverAddress,
            정규화주소: normalizedShipmentAddress,
            전화번호: normalizedShipmentPhone
          }
        });
        
        // 테스트: 이름 정규화 단계별 확인
        if (shipment.receiverName.includes('박병준')) {
          let testName = shipment.receiverName.trim();
          console.log('이름 정규화 단계:');
          console.log('1. 원본:', testName);
          testName = testName.replace(/\s*(고객|팀장|원장|본부장|로스터|원두|님|씨|선생님|사장님|대표님)\**/gi, '');
          console.log('2. 호칭 제거:', testName);
          testName = testName.replace(/\*/g, '').trim();
          console.log('3. 별표 제거:', testName);
          testName = testName.replace(/[\s\-\(\)]/g, '').toLowerCase();
          console.log('4. 최종:', testName);
        }
        
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
      let matchedOrder: any = null;
      
      // ===== 기존 로직으로 먼저 시도 =====
      // 1순위: 수하인명 매칭 (기존 정규화 + 비식별 처리 지원)
      
      const nameMatchOrders = orders.filter(order => {
        // 이미 매칭된 주문은 제외
        if (matchedOrderIds.has(order.order_id)) return false;
        
        const normalizedOrderName = normalizeName(order.receiver_name);
        
        // 기본 정규화 매칭
        if (normalizedOrderName === normalizedShipmentName) {
          return true;
        }
        
        // 비식별 처리된 이름도 체크 (별표 포함된 경우)
        if ((shipment.receiverName.includes('*') || order.receiver_name.includes('*')) &&
            areNamesSimilarWithMasking(shipment.receiverName, order.receiver_name)) {
          return true;
        }
        
        return false;
      });
      
      // 디버깅: 이름 매칭 결과
      if (index === 0 || nameMatchOrders.length === 0) {
        console.log(`이름 매칭 결과 [${index + 1}번째]:`, {
          송장정규화이름: normalizedShipmentName,
          매칭개수: nameMatchOrders.length,
          매칭주문: nameMatchOrders.map(o => ({
            주문번호: o.order_id,
            이름: o.receiver_name,
            정규화된이름: normalizeName(o.receiver_name)
          }))
        });
        
        // 매칭 실패 시 비슷한 이름 찾기
        if (nameMatchOrders.length === 0 && normalizedShipmentName) {
          const similarNames = orders.filter(o => {
            const orderName = normalizeName(o.receiver_name);
            return orderName.includes(normalizedShipmentName.substring(0, 2)) || 
                   normalizedShipmentName.includes(orderName.substring(0, 2));
          }).slice(0, 3);
          
          if (similarNames.length > 0) {
            console.log('비슷한 이름 주문:', similarNames.map(o => ({
              이름: o.receiver_name,
              정규화: normalizeName(o.receiver_name)
            })));
          }
        }
      }
      
      if (nameMatchOrders.length === 1) {
        const orderId = nameMatchOrders[0].order_id;
        
        // 이미 filter에서 매칭된 주문은 제외했으므로 중복 체크 불필요
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
        
        const isMasked = shipment.receiverName.includes('*') || nameMatchOrders[0].receiver_name.includes('*');
        
        matchingLog.push({
          row: index + 1,
          trackingNo: shipment.trackingNo,
          shipmentName: shipment.receiverName,
          matchedOrderId: orderId,
          matchedName: nameMatchOrders[0].receiver_name,
          matchMethod: isMasked ? '1순위: 수하인명 매칭 (비식별 처리)' : '1순위: 수하인명 매칭',
          success: true
        });
      } else if (nameMatchOrders.length > 1) {
        // 복수 주문 처리: 각 주문에 하나씩만 할당
        console.log(`🔄 복수 주문 감지 [${normalizedShipmentName}]: ${nameMatchOrders.length}개 주문`);
        
        // 먼저 주소로 필터링 시도
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
        
        // 주소 매칭 결과에 따라 처리
        const ordersToUse = addressMatchOrders.length > 0 ? addressMatchOrders : nameMatchOrders;
        
        if (ordersToUse.length > 0) {
          // 이미 매칭된 주문들 필터링
          const availableOrders = ordersToUse.filter(order => !matchedOrderIds.has(order.order_id));
          
          if (availableOrders.length > 0) {
            // 첫 번째 사용 가능한 주문 선택
            const selectedOrder = availableOrders[0];
            const orderId = selectedOrder.order_id;
            
            matched.push({
              orderId: orderId,
              receiverName: selectedOrder.receiver_name,
              receiverAddress: selectedOrder.receiver_address,
              trackingNo: shipment.trackingNo,
              matchType: addressMatchOrders.length > 0 ? 'exact' : 'partial'
            });
            matchFound = true;
            matchType = addressMatchOrders.length > 0 ? 'exact' : 'partial';
            matchedOrderIds.add(orderId); // 사용된 주문 표시
            
            const methodDesc = addressMatchOrders.length > 0 
              ? '1순위: 수하인명 + 주소 매칭' 
              : `1순위: 수하인명 매칭 (복수 주문)`;
            
            matchingLog.push({
              row: index + 1,
              trackingNo: shipment.trackingNo,
              shipmentName: shipment.receiverName,
              matchedOrderId: orderId,
              matchedName: selectedOrder.receiver_name,
              matchMethod: methodDesc,
              success: true,
              note: `${ordersToUse.length}개 주문 중 선택`
            });
          } else {
            // 모든 주문이 이미 매칭됨 - 송장이 주문보다 많은 경우 (정상 - 스킵)
            console.log(`🔸 잉여 송장 스킵 [${index + 1}번째]: ${shipment.trackingNo} (${shipment.receiverName})`);
            console.log(`   → 주문 ${ordersToUse.length}개 모두 할당 완료, 남은 송장은 무시`);
            
            matchingLog.push({
              row: index + 1,
              trackingNo: shipment.trackingNo,
              shipmentName: shipment.receiverName,
              matchMethod: '잉여 송장 (스킵)',
              success: true,  // 실패가 아님
              skipped: true,  // UI에서 표시하지 않기 위한 플래그
              reason: '모든 주문이 이미 송장 할당됨',
              note: `주문 ${ordersToUse.length}개 모두 할당 완료`
            });
            // 잉여 송장은 매칭 목록에 추가하지 않음 (UI에 표시 안 함)
            // 하지만 실패로 처리하지도 않음
            return; // 다음 송장으로 넘어감
          }
        }
      }
      
      // 2순위: 전화번호 매칭 (1순위에서 매칭 실패 시)
      if (!matchFound && normalizedShipmentPhone) {
        const phoneMatchOrders = orders.filter(order => {
          // 이미 매칭된 주문은 제외
          if (matchedOrderIds.has(order.order_id)) return false;
          const normalizedOrderPhone = normalizePhone(order.receiver_phone);
          return normalizedOrderPhone === normalizedShipmentPhone;
        });
        
        if (index === 0 && phoneMatchOrders.length > 0) {
          console.log('전화번호 매칭 결과:', phoneMatchOrders.length, '개');
        }
        
        if (phoneMatchOrders.length === 1) {
          const orderId = phoneMatchOrders[0].order_id;
          
          // 이미 filter에서 매칭된 주문은 제외했으므로 중복 체크 불필요
          
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
          // 이미 매칭된 주문은 제외
          if (matchedOrderIds.has(order.order_id)) return false;
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
          
          // 이미 filter에서 매칭된 주문은 제외했으므로 중복 체크 불필요
          
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
      
      // ===== 개선된 로직 적용 (기존 매칭 실패 시) =====
      if (!matchFound) {
        console.log(`🔄 개선된 매칭 시도 [${index + 1}번째 송장]`);
        
        // 개선된 이름 정규화로 재시도
        const enhancedShipmentName = normalizeNameEnhanced(shipment.receiverName);
        const companyShipmentName = normalizeCompanyName(shipment.receiverName);
        
        // 개선된 이름 매칭 (비식별 처리 포함)
        const enhancedNameMatches = orders.filter(order => {
          if (matchedOrderIds.has(order.order_id)) return false;
          
          const enhancedOrderName = normalizeNameEnhanced(order.receiver_name);
          const companyOrderName = normalizeCompanyName(order.receiver_name);
          
          // 기본 정규화 매칭
          if (enhancedOrderName === enhancedShipmentName || 
              companyOrderName === companyShipmentName ||
              (companyShipmentName && companyOrderName && companyOrderName === companyShipmentName)) {
            return true;
          }
          
          // 비식별 처리된 이름 매칭 (별표 포함)
          if (areNamesSimilarWithMasking(shipment.receiverName, order.receiver_name)) {
            console.log(`🔍 비식별 이름 매칭 감지:`, {
              송장: shipment.receiverName,
              주문: order.receiver_name
            });
            return true;
          }
          
          return false;
        });
        
        if (enhancedNameMatches.length === 1) {
          const orderId = enhancedNameMatches[0].order_id;
          matched.push({
            orderId: orderId,
            receiverName: enhancedNameMatches[0].receiver_name,
            receiverAddress: enhancedNameMatches[0].receiver_address,
            trackingNo: shipment.trackingNo,
            matchType: 'partial'
          });
          matchFound = true;
          matchedOrderIds.add(orderId);
          
          const isMaskedMatch = areNamesSimilarWithMasking(shipment.receiverName, enhancedNameMatches[0].receiver_name);
          
          matchingLog.push({
            row: index + 1,
            trackingNo: shipment.trackingNo,
            shipmentName: shipment.receiverName,
            matchedOrderId: orderId,
            matchedName: enhancedNameMatches[0].receiver_name,
            matchMethod: isMaskedMatch ? '개선: 비식별 이름 매칭 (별표 처리)' : '개선: 확장된 이름 정규화 매칭',
            success: true
          });
        } else if (enhancedNameMatches.length > 1) {
          // 주소로 추가 필터링
          const baseShipmentAddr = extractBaseAddress(shipment.receiverAddress);
          const addressFilteredMatches = enhancedNameMatches.filter(order => {
            const baseOrderAddr = extractBaseAddress(order.receiver_address);
            return baseShipmentAddr === baseOrderAddr || 
                   baseOrderAddr.includes(baseShipmentAddr) || 
                   baseShipmentAddr.includes(baseOrderAddr);
          });
          
          if (addressFilteredMatches.length === 1) {
            const orderId = addressFilteredMatches[0].order_id;
            matched.push({
              orderId: orderId,
              receiverName: addressFilteredMatches[0].receiver_name,
              receiverAddress: addressFilteredMatches[0].receiver_address,
              trackingNo: shipment.trackingNo,
              matchType: 'partial'
            });
            matchFound = true;
            matchedOrderIds.add(orderId);
            
            matchingLog.push({
              row: index + 1,
              trackingNo: shipment.trackingNo,
              shipmentName: shipment.receiverName,
              matchedOrderId: orderId,
              matchedName: addressFilteredMatches[0].receiver_name,
              matchMethod: '개선: 이름 + 기본주소 매칭',
              success: true
            });
          }
        }
        
        // 기본 주소만으로 매칭 시도 (이름 매칭 실패 시)
        if (!matchFound) {
          const baseShipmentAddr = extractBaseAddress(shipment.receiverAddress);
          if (baseShipmentAddr && baseShipmentAddr.length > 10) { // 너무 짧은 주소는 제외
            const baseAddressMatches = orders.filter(order => {
              if (matchedOrderIds.has(order.order_id)) return false;
              const baseOrderAddr = extractBaseAddress(order.receiver_address);
              return baseShipmentAddr === baseOrderAddr;
            });
            
            if (baseAddressMatches.length === 1) {
              const orderId = baseAddressMatches[0].order_id;
              matched.push({
                orderId: orderId,
                receiverName: baseAddressMatches[0].receiver_name,
                receiverAddress: baseAddressMatches[0].receiver_address,
                trackingNo: shipment.trackingNo,
                matchType: 'partial'
              });
              matchFound = true;
              matchedOrderIds.add(orderId);
              
              const isNameDifferent = normalizeNameEnhanced(baseAddressMatches[0].receiver_name) !== enhancedShipmentName;
              
              matchingLog.push({
                row: index + 1,
                trackingNo: shipment.trackingNo,
                shipmentName: shipment.receiverName,
                shipmentAddress: shipment.receiverAddress,
                matchedOrderId: orderId,
                matchedName: baseAddressMatches[0].receiver_name,
                matchedAddress: baseAddressMatches[0].receiver_address,
                matchMethod: '개선: 기본 주소 매칭' + (isNameDifferent ? ' (이름 불일치)' : ''),
                success: true,
                note: isNameDifferent ? `송장: ${shipment.receiverName} ≠ 주문: ${baseAddressMatches[0].receiver_name}` : undefined
              });
            }
          }
        }
      }
      
      // 최종 매칭 실패 로그
      if (!matchFound) {
        // 동일 고객의 분할 주문 가능성 체크
        const possibleSplitOrdersSet = new Set<string>();
        
        // 여러 정규화 방식으로 가능한 주문 찾기
        const normalizedNames = [
          normalizeName(shipment.receiverName),
          normalizeNameEnhanced(shipment.receiverName),
          normalizeCompanyName(shipment.receiverName)
        ].filter(name => name); // 빈 문자열 제거
        
        normalizedNames.forEach(name => {
          if (customerOrdersMap.has(name)) {
            const customerOrders = customerOrdersMap.get(name)!.filter(id => !matchedOrderIds.has(id));
            customerOrders.forEach(orderId => possibleSplitOrdersSet.add(orderId));
          }
        });
        
        const possibleSplitOrders = Array.from(possibleSplitOrdersSet);
        
        if (possibleSplitOrders.length > 0) {
          console.log(`⚠️ 분할 주문 가능성 감지 [${index + 1}번째]:`, {
            송장: shipment.receiverName,
            가능한주문: possibleSplitOrders
          });
        }
        
        matchingLog.push({
          row: index + 1,
          trackingNo: shipment.trackingNo,
          shipmentName: shipment.receiverName,
          shipmentPhone: shipment.receiverPhone,
          shipmentAddress: shipment.receiverAddress,
          matchMethod: '매칭 실패',
          success: false,
          reason: '일치하는 주문을 찾을 수 없음',
          possibleSplitOrders: possibleSplitOrders.length > 0 ? possibleSplitOrders : undefined
        });
      }
    });

    // 매칭 결과 분류
    const exactMatches = matched.filter(m => m.matchType === 'exact');
    const partialMatchList = matched.filter(m => m.matchType === 'partial');
    const failedMatchList = matchingLog.filter(log => !log.success && !log.skipped); // 잉여 송장은 실패 목록에서 제외
    const skippedList = matchingLog.filter(log => log.skipped); // 잉여 송장 목록
    
    // 개선된 매칭 통계
    const improvedMatches = matchingLog.filter(log => log.success && !log.skipped && log.matchMethod?.includes('개선'));
    const legacyMatches = matchingLog.filter(log => log.success && !log.skipped && !log.matchMethod?.includes('개선'));
    
    // 디버깅 로그 출력
    console.group('📦 송장 매칭 결과 (개선된 버전)');
    console.log(`총 ${shipmentData.length}개 송장 처리`);
    console.log(`✅ 정확 매칭: ${exactMatches.length}개`);
    console.log(`⚠️ 부분 매칭: ${partialMatchList.length}개`);
    console.log(`❌ 매칭 실패: ${failedMatchList.length}개`);
    if (skippedList.length > 0) {
      console.log(`🔸 잉여 송장 (스킵): ${skippedList.length}개`);
    }
    console.log('---');
    console.log(`🔄 기존 로직 매칭: ${legacyMatches.length}개`);
    console.log(`✨ 개선 로직 매칭: ${improvedMatches.length}개 (추가 매칭)`);
    
    // 분할 주문 가능성이 있는 실패 건
    const splitOrderCandidates = failedMatchList.filter(f => f.possibleSplitOrders?.length > 0);
    if (splitOrderCandidates.length > 0) {
      console.log(`📌 분할 주문 가능성: ${splitOrderCandidates.length}개`);
    }
    
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

  // 개별 주문 처리 함수
  const handleProcessSingleOrder = async (match: MatchedOrder) => {
    const orderKey = `${match.orderId}-${match.trackingNo}`;
    
    // 처리 시작
    setProcessingStatus(prev => ({
      ...prev,
      [orderKey]: { status: 'processing', message: '처리 중...' }
    }));

    console.group(`🎯 개별 주문 처리: ${match.orderId}`);
    console.log('📦 주문 정보:', match);

    try {
      // 송장번호 형식 정리
      const cleanedTrackingNo = match.trackingNo.replace(/[\s\-]/g, '').trim();
      
      // Step 1: 송장번호 등록
      console.log('📝 [1/2] 송장번호 등록...');
      const registerResponse = await fetch(`/api/orders/${match.orderId}/shipments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tracking_no: cleanedTrackingNo,
          shipping_company_code: '0018', // 한진택배
          status: 'standby' // 배송대기 상태로 먼저 등록
        })
      });

      const registerResult = await registerResponse.json();
      
      if (registerResponse.ok) {
        console.log('✅ 송장번호 등록 성공');
        
        const shippingCode = registerResult.shipment?.shipping_code;
        
        if (shippingCode) {
          // Step 2: 배송중으로 상태 변경 (카페24 공식 API 사용)
          console.log('🚚 배송중 상태 변경 시도...');
          const statusUpdateResponse = await fetch(`/api/orders/${match.orderId}/shipments/${shippingCode}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              status: 'shipping' // 배송중으로 변경
            })
          });
          
          const statusUpdateResult = await statusUpdateResponse.json();
          
          if (statusUpdateResponse.ok) {
            console.log('✅ 배송중 상태 변경 성공');
            setProcessingStatus(prev => ({
              ...prev,
              [orderKey]: { 
                status: 'success', 
                message: '완료',
                shippingCode: shippingCode
              }
            }));
            toast.success(`주문 ${match.orderId} 처리 완료`);
          } else {
            console.warn('⚠️ 상태 변경 실패:', statusUpdateResult);
            setProcessingStatus(prev => ({
              ...prev,
              [orderKey]: { 
                status: 'success', 
                message: '송장 등록됨 (상태 변경 실패)'
              }
            }));
            toast(`주문 ${match.orderId}: 송장 등록 완료 (배송중 변경 실패)`, {
              icon: '⚠️'
            });
          }
        } else {
          // shipping_code가 없으면 상태 변경 불가
          setProcessingStatus(prev => ({
            ...prev,
            [orderKey]: { 
              status: 'success', 
              message: '송장 등록됨'
            }
          }));
          toast(`주문 ${match.orderId}: 송장 등록 완료`, {
            icon: '⚠️'
          });
        }
      } else {
        console.error('❌ 송장 등록 API 실패 응답:', registerResult);
        if (registerResult.tracking_no_info) {
          console.error('송장번호 정보:', registerResult.tracking_no_info);
        }
        if (registerResult.cafe24_error) {
          console.error('Cafe24 에러:', registerResult.cafe24_error);
        }
        throw new Error(registerResult.error || '송장 등록 실패');
      }
    } catch (error: any) {
      console.error('❌ 처리 실패:', error);
      console.error('  Error Details:', error.message);
      setProcessingStatus(prev => ({
        ...prev,
        [orderKey]: { 
          status: 'failed', 
          message: error.message || '처리 실패'
        }
      }));
      toast.error(`주문 ${match.orderId} 처리 실패: ${error.message}`);
    } finally {
      console.groupEnd();
    }
  };

  const handleConfirmUpload = async () => {
    setIsProcessing(true);
    const failed: any[] = [];
    const succeeded: any[] = [];
    let totalSuccess = 0;

    // 전송 전 최종 확인 로그
    console.group('🚀 카페24 송장 등록 시작 (개별 API 호출)');
    console.log(`총 ${matchedOrders.length}개 주문 개별 처리 예정`);
    console.table(matchedOrders.map((order, index) => ({
      순번: index + 1,
      주문번호: order.orderId,
      수취인: order.receiverName,
      송장번호: order.trackingNo,
      매칭타입: order.matchType
    })));
    console.groupEnd();

    try {
      // 개별 처리로 변경
      for (let i = 0; i < matchedOrders.length; i++) {
        const match = matchedOrders[i];
        
        console.group(`📦 [${i + 1}/${matchedOrders.length}] 주문 ${match.orderId} 개별 처리`);
        console.log('🔹 송장번호:', match.trackingNo);
        console.log('🔹 수취인:', match.receiverName);
        console.log('🔹 주소:', match.receiverAddress);
        console.log('🔹 매칭타입:', match.matchType);
        
        try {
          // 송장번호 형식 정리 (공백, 하이픈 제거)
          const cleanedTrackingNo = match.trackingNo.replace(/[\s\-]/g, '').trim();
          
          // Step 1: 송장번호 등록
          console.log('📝 [1/2] 송장번호 등록 시작...');
          console.log('  원본 송장번호:', match.trackingNo);
          console.log('  정리된 송장번호:', cleanedTrackingNo);
          
          const registerResponse = await fetch(`/api/orders/${match.orderId}/shipments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tracking_no: cleanedTrackingNo,
              shipping_company_code: '0018', // 한진택배
              status: 'standby' // 배송대기 상태로 먼저 등록
            })
          });

          const registerResult = await registerResponse.json();
          
          if (registerResponse.ok) {
            console.log('✅ 송장번호 등록 성공');
            console.log('📌 Response:', registerResult);
            
            // shipping_code 추출
            const shippingCode = registerResult.shipment?.shipping_code;
            
            if (shippingCode) {
              console.log('🔑 Shipping Code:', shippingCode);
              
              // Step 2: 배송중으로 상태 변경 (카페24 공식 API 사용)
              console.log('🚚 [2/2] 배송중(shipping)으로 상태 변경 시작...');
              const statusUpdateResponse = await fetch(`/api/orders/${match.orderId}/shipments/${shippingCode}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  status: 'shipping' // 배송중
                })
              });
              
              const statusUpdateResult = await statusUpdateResponse.json();
              
              if (statusUpdateResponse.ok) {
                console.log('✅ 배송중 상태 변경 성공');
                totalSuccess++;
                succeeded.push({
                  orderId: match.orderId,
                  trackingNo: match.trackingNo,
                  receiverName: match.receiverName,
                  shippingCode: shippingCode
                });
              } else {
                console.error('❌ 배송중 상태 변경 실패:', statusUpdateResult);
                failed.push({
                  orderId: match.orderId,
                  trackingNo: match.trackingNo,
                  error: `상태 변경 실패: ${statusUpdateResult.error || '알 수 없는 오류'}`
                });
              }
            } else {
              console.warn('⚠️ shipping_code를 찾을 수 없음');
              // 송장은 등록되었지만 상태 변경은 불가
              totalSuccess++; // 송장 등록은 성공
              succeeded.push({
                orderId: match.orderId,
                trackingNo: match.trackingNo,
                receiverName: match.receiverName,
                warning: '송장 등록 성공 (상태 변경 불가)'
              });
            }
          } else {
            console.error('❌ 송장번호 등록 실패');
            console.error('  Status:', registerResponse.status);
            console.error('  Error:', registerResult);
            
            // 상세 에러 메시지 처리
            let errorMessage = registerResult.error || '등록 실패';
            
            if (registerResponse.status === 409) {
              console.warn('⚠️ 이미 등록된 송장번호');
              errorMessage = '이미 등록된 송장번호';
            } else if (registerResponse.status === 422) {
              console.error('⚠️ 송장번호 형식 오류');
              if (registerResult.details) {
                console.error('  Details:', registerResult.details);
                errorMessage = `형식 오류: ${registerResult.error}`;
              }
            }
            
            failed.push({
              orderId: match.orderId,
              trackingNo: match.trackingNo,
              originalTrackingNo: match.trackingNo,
              cleanedTrackingNo: cleanedTrackingNo,
              error: errorMessage,
              details: registerResult.details
            });
          }
        } catch (error) {
          console.error('❌ 네트워크 오류:', error);
          failed.push({
            orderId: match.orderId,
            trackingNo: match.trackingNo,
            error: '네트워크 오류'
          });
        } finally {
          console.groupEnd();
        }
      }

      // 성공한 주문 로그
      if (succeeded.length > 0) {
        console.group('✅ 성공한 주문 목록');
        console.table(succeeded);
        console.groupEnd();
      }

      // 실패한 주문 로그
      if (failed.length > 0) {
        console.group('❌ 실패한 주문 목록');
        console.table(failed);
        console.groupEnd();
      }

      setFailedOrders(failed);
      setCurrentStep('complete');
      
      // 최종 결과 로그
      console.group('📊 카페24 송장 등록 완료');
      console.log(`✅ 성공: ${totalSuccess}개`);
      console.log(`❌ 실패: ${failed.length}개`);
      console.log('🔹 총 처리 시도:', matchedOrders.length);
      console.log('🔹 성공률:', totalSuccess > 0 ? `${Math.round((totalSuccess / matchedOrders.length) * 100)}%` : '0%');
      console.groupEnd();
      
      if (totalSuccess > 0) {
        toast.success(`${totalSuccess}개 주문에 송장번호를 등록하고 배송중으로 변경했습니다.`);
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
      ['주문번호', '원본 송장번호', '정리된 송장번호', '오류 메시지', '상세 정보'],
      ...failedOrders.map(item => [
        item.orderId,
        item.originalTrackingNo || item.trackingNo,
        item.cleanedTrackingNo || item.trackingNo,
        item.error,
        item.details ? JSON.stringify(item.details) : ''
      ])
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
    setProcessingStatus({});
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
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">개별 처리</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {matchedOrders.map((match, index) => {
                      const orderKey = `${match.orderId}-${match.trackingNo}`;
                      const status = processingStatus[orderKey];
                      
                      return (
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
                          <td className="px-4 py-2 text-center">
                            {!status ? (
                              <button
                                onClick={() => handleProcessSingleOrder(match)}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                              >
                                처리
                              </button>
                            ) : status.status === 'processing' ? (
                              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-600">
                                <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                처리 중...
                              </span>
                            ) : status.status === 'success' ? (
                              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                {status.message}
                              </span>
                            ) : status.status === 'failed' ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  실패
                                </span>
                                <button
                                  onClick={() => handleProcessSingleOrder(match)}
                                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                >
                                  재시도
                                </button>
                              </div>
                            ) : null}
                            {status?.message && status.status === 'failed' && (
                              <div className="text-xs text-red-600 mt-1">{status.message}</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
              <>
                <button
                  onClick={handleConfirmUpload}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      처리 중...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      전체 일괄 등록
                    </>
                  )}
                </button>
                
                {/* 처리 상태 요약 */}
                {Object.keys(processingStatus).length > 0 && (
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-green-600">
                      ✅ 완료: {Object.values(processingStatus).filter(s => s.status === 'success').length}
                    </span>
                    <span className="text-red-600">
                      ❌ 실패: {Object.values(processingStatus).filter(s => s.status === 'failed').length}
                    </span>
                    <span className="text-gray-600">
                      대기: {matchedOrders.length - Object.keys(processingStatus).length}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}