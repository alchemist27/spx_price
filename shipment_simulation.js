// 카페24 API 배송준비중 주문 조회 및 엑셀 송장 데이터 매칭 시뮬레이션
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ShipmentUploadModal의 정규화 함수들을 복사
function normalizeString(str) {
  if (!str) return '';
  return str.replace(/[\s\-()]/g, '').toLowerCase();
}

function normalizeAddress(address) {
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
}

function normalizeName(name) {
  if (!name) return '';
  let cleaned = name.trim();
  
  // "고객*", "팀장*" 등의 패턴 제거 - 더 포괄적으로
  cleaned = cleaned.replace(/\s*(고객|팀장|원장|본부장|로스터|원두|님|씨|선생님|사장님|대표님|담당자|사장)\**/gi, '');
  
  // 별표 제거
  cleaned = cleaned.replace(/\*/g, '').trim();
  
  // 공백과 특수문자 제거하고 소문자로
  return cleaned.replace(/[\s\-\(\)]/g, '').toLowerCase();
}

function normalizeNameEnhanced(name) {
  if (!name) return '';
  let cleaned = name.trim();
  
  // 확장된 직급/호칭 패턴
  const expandedTitlePattern = /\s*(고객|팀장|원장|본부장|실장|과장|대리|사원|매니저|이사|대표|사장|부장|차장|님|씨|선생님|사장님|대표님|로스터|원두|담당자)\**/gi;
  
  // 직급/호칭이 이름 뒤에 붙은 경우 제거
  cleaned = cleaned.replace(/\s+(실장|과장|대리|팀장|부장|차장|이사|사원|담당자|사장)$/g, '');
  cleaned = cleaned.replace(expandedTitlePattern, '');
  
  // 별표 제거
  cleaned = cleaned.replace(/\*/g, '').trim();
  
  // 공백과 특수문자 제거하고 소문자로
  return cleaned.replace(/[\s\-\(\)]/g, '').toLowerCase();
}

function normalizeCompanyName(name) {
  if (!name) return '';
  
  // 앞뒤의 회사 형태 제거
  let normalized = name
    .replace(/^(주식회사|주\)|유한회사|합자회사|\(주\))\s*/gi, '')
    .replace(/\s*(주식회사|주\)|유한회사|합자회사|\(주\))$/gi, '')
    .trim();
  
  // 공백과 특수문자 제거하고 소문자로
  return normalized.replace(/[\s\-\(\)]/g, '').toLowerCase();
}

function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/[\s\-()]/g, '');
}

function areNamesSimilarWithMasking(name1, name2) {
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
}

function getCommonPrefixLength(str1, str2) {
  let i = 0;
  while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
    i++;
  }
  return i;
}

function extractBaseAddress(address) {
  if (!address) return '';
  
  // 먼저 기본 정규화 적용
  const normalized = normalizeAddress(address);
  
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
}

// 엑셀 파일 처리 함수
function processExcelFile(filePath) {
  console.log('📄 엑셀 파일 읽기:', filePath);
  
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { 
      header: 1,
      raw: false, // 숫자를 문자열로 변환
      defval: ''
    });
    
    const headers = jsonData[0];
    console.log('📋 엑셀 헤더:', headers);
    
    // 컬럼 인덱스 찾기
    const trackingNoIndex = headers.findIndex(h => 
      h && (h.includes('운송장') || h.includes('송장'))
    );
    const receiverNameIndex = headers.findIndex(h => 
      h && (h.includes('받는분') || h.includes('수령자') || h.includes('수취인') || h.includes('수하인'))
    );
    const receiverPhoneIndex = headers.findIndex(h => {
      if (!h) return false;
      if (h.includes('송하인')) return false;
      return h.includes('수하인전화') || (h.includes('수하인') && h.includes('전화')) || 
             (!h.includes('송하인') && (h.includes('전화') || h.includes('연락처')));
    });
    const receiverZipcodeIndex = headers.findIndex(h => {
      if (!h) return false;
      if (h.includes('송하인')) return false;
      return h.includes('수하인우편번호') || (h.includes('수하인') && h.includes('우편')) ||
             (!h.includes('송하인') && (h.includes('우편번호') || h.includes('우편')));
    });
    const receiverAddressIndex = headers.findIndex(h => {
      if (!h) return false;
      if (h.includes('송하인')) return false;
      return h.includes('수하인주소') || (h.includes('수하인') && h.includes('주소'));
    });
    
    console.log('📍 컬럼 인덱스:', {
      trackingNoIndex,
      receiverNameIndex,
      receiverPhoneIndex,
      receiverZipcodeIndex,
      receiverAddressIndex
    });

    if (trackingNoIndex === -1 || receiverNameIndex === -1 || receiverAddressIndex === -1) {
      let missingColumns = [];
      if (trackingNoIndex === -1) missingColumns.push('운송장번호');
      if (receiverNameIndex === -1) missingColumns.push('수하인명');
      if (receiverAddressIndex === -1) missingColumns.push('주소');
      
      console.error('❌ 필수 컬럼 누락:', missingColumns.join(', '));
      return [];
    }

    const uniqueMap = new Map();
    
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row[trackingNoIndex]) continue;
      
      const receiverName = String(row[receiverNameIndex] || '');
      const zipcode = String(row[receiverZipcodeIndex] || '');
      const address = String(row[receiverAddressIndex] || '');
      
      const uniqueKey = `${normalizeString(receiverName)}|${zipcode}|${normalizeString(address)}`;
      
      if (!uniqueMap.has(uniqueKey)) {
        // 송장번호 처리
        let trackingNumber = String(row[trackingNoIndex] || '').trim();
        if (trackingNumber.includes('E+') || trackingNumber.includes('e+')) {
          trackingNumber = parseFloat(trackingNumber).toFixed(0);
        }
        trackingNumber = trackingNumber.replace(/\.0+$/, '');
        
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

    const shipmentData = Array.from(uniqueMap.values());
    console.log(`📦 추출된 고유 배송 데이터: ${shipmentData.length}건`);
    
    return shipmentData;
  } catch (error) {
    console.error('❌ 엑셀 파일 처리 오류:', error);
    return [];
  }
}

// 매칭 시뮬레이션 함수
function simulateMatching(orders, shipmentData) {
  console.log('\n🔄 매칭 시뮬레이션 시작');
  console.log(`📋 주문 데이터: ${orders.length}건`);
  console.log(`📦 송장 데이터: ${shipmentData.length}건`);
  
  const matched = [];
  const matchingLog = [];
  const matchedOrderIds = new Set();
  
  // 고객별 주문 그룹화
  const customerOrdersMap = new Map();
  orders.forEach(order => {
    const normalizedName = normalizeName(order.receiver_name);
    const enhancedName = normalizeNameEnhanced(order.receiver_name);
    const companyName = normalizeCompanyName(order.receiver_name);
    
    [normalizedName, enhancedName, companyName].forEach(name => {
      if (name && !matchedOrderIds.has(order.order_id)) {
        if (!customerOrdersMap.has(name)) {
          customerOrdersMap.set(name, []);
        }
        if (!customerOrdersMap.get(name).includes(order.order_id)) {
          customerOrdersMap.get(name).push(order.order_id);
        }
      }
    });
  });
  
  shipmentData.forEach((shipment, index) => {
    console.log(`\n📋 매칭 시도 [${index + 1}/${shipmentData.length}]:`, shipment.receiverName);
    
    const normalizedShipmentName = normalizeName(shipment.receiverName);
    const normalizedShipmentAddress = normalizeAddress(shipment.receiverAddress);
    const normalizedShipmentPhone = normalizePhone(shipment.receiverPhone);
    
    let matchFound = false;
    let matchType = 'manual';
    
    // 1순위: 수하인명 매칭
    const nameMatchOrders = orders.filter(order => {
      if (matchedOrderIds.has(order.order_id)) return false;
      
      const normalizedOrderName = normalizeName(order.receiver_name);
      
      // 기본 정규화 매칭
      if (normalizedOrderName === normalizedShipmentName) {
        return true;
      }
      
      // 비식별 처리된 이름 매칭
      if ((shipment.receiverName.includes('*') || order.receiver_name.includes('*')) &&
          areNamesSimilarWithMasking(shipment.receiverName, order.receiver_name)) {
        return true;
      }
      
      return false;
    });
    
    if (nameMatchOrders.length === 1) {
      const orderId = nameMatchOrders[0].order_id;
      
      if (!matchedOrderIds.has(orderId)) {
        matched.push({
          orderId: orderId,
          receiverName: nameMatchOrders[0].receiver_name,
          receiverAddress: nameMatchOrders[0].receiver_address,
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
          matchedName: nameMatchOrders[0].receiver_name,
          matchMethod: '1순위: 수하인명 매칭',
          success: true
        });
      }
    } else if (nameMatchOrders.length > 1) {
      // 주소로 추가 필터링
      const addressMatchOrders = nameMatchOrders.filter(order => {
        const normalizedOrderAddress = normalizeAddress(order.receiver_address);
        return normalizedOrderAddress.includes(normalizedShipmentAddress) || 
               normalizedShipmentAddress.includes(normalizedOrderAddress) ||
               normalizedOrderAddress === normalizedShipmentAddress;
      });
      
      if (addressMatchOrders.length === 1) {
        const orderId = addressMatchOrders[0].order_id;
        
        if (!matchedOrderIds.has(orderId)) {
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
    }
    
    // 2순위: 전화번호 매칭
    if (!matchFound && normalizedShipmentPhone) {
      const phoneMatchOrders = orders.filter(order => {
        if (matchedOrderIds.has(order.order_id)) return false;
        const normalizedOrderPhone = normalizePhone(order.receiver_phone);
        return normalizedOrderPhone === normalizedShipmentPhone;
      });
      
      if (phoneMatchOrders.length === 1) {
        const orderId = phoneMatchOrders[0].order_id;
        
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
          matchedOrderId: orderId,
          matchedName: phoneMatchOrders[0].receiver_name,
          matchMethod: '2순위: 전화번호 매칭',
          success: true
        });
      }
    }
    
    // 3순위: 주소 매칭
    if (!matchFound && normalizedShipmentAddress && normalizedShipmentAddress.length >= 5) {
      const addressMatchOrders = orders.filter(order => {
        if (matchedOrderIds.has(order.order_id)) return false;
        const normalizedOrderAddress = normalizeAddress(order.receiver_address);
        
        if (normalizedOrderAddress === normalizedShipmentAddress) {
          return true;
        }
        
        // 핵심 주소 매칭
        const coreShipmentAddr = extractBaseAddress(normalizedShipmentAddress);
        const coreOrderAddr = extractBaseAddress(normalizedOrderAddress);
        
        if (coreOrderAddr === coreShipmentAddr || 
            coreOrderAddr.includes(coreShipmentAddr) || 
            coreShipmentAddr.includes(coreOrderAddr)) {
          return true;
        }
        
        return normalizedOrderAddress.includes(normalizedShipmentAddress) || 
               normalizedShipmentAddress.includes(normalizedOrderAddress);
      });
      
      if (addressMatchOrders.length === 1) {
        const orderId = addressMatchOrders[0].order_id;
        
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
        
        matchingLog.push({
          row: index + 1,
          trackingNo: shipment.trackingNo,
          shipmentName: shipment.receiverName,
          matchedOrderId: orderId,
          matchedName: addressMatchOrders[0].receiver_name,
          matchMethod: '3순위: 주소 매칭',
          success: true
        });
      }
    }
    
    // 개선된 로직 (기존 매칭 실패 시)
    if (!matchFound) {
      const enhancedShipmentName = normalizeNameEnhanced(shipment.receiverName);
      const companyShipmentName = normalizeCompanyName(shipment.receiverName);
      
      const enhancedNameMatches = orders.filter(order => {
        if (matchedOrderIds.has(order.order_id)) return false;
        
        const enhancedOrderName = normalizeNameEnhanced(order.receiver_name);
        const companyOrderName = normalizeCompanyName(order.receiver_name);
        
        if (enhancedOrderName === enhancedShipmentName || 
            companyOrderName === companyShipmentName ||
            (companyShipmentName && companyOrderName && companyOrderName === companyShipmentName)) {
          return true;
        }
        
        if (areNamesSimilarWithMasking(shipment.receiverName, order.receiver_name)) {
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
        
        matchingLog.push({
          row: index + 1,
          trackingNo: shipment.trackingNo,
          shipmentName: shipment.receiverName,
          matchedOrderId: orderId,
          matchedName: enhancedNameMatches[0].receiver_name,
          matchMethod: '개선: 확장된 이름 정규화 매칭',
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
    }
    
    // 매칭 실패
    if (!matchFound) {
      // 동일 고객의 분할 주문 가능성 체크
      const possibleSplitOrdersSet = new Set();
      const normalizedNames = [
        normalizeName(shipment.receiverName),
        normalizeNameEnhanced(shipment.receiverName),
        normalizeCompanyName(shipment.receiverName)
      ].filter(name => name);
      
      normalizedNames.forEach(name => {
        if (customerOrdersMap.has(name)) {
          const customerOrders = customerOrdersMap.get(name).filter(id => !matchedOrderIds.has(id));
          customerOrders.forEach(orderId => possibleSplitOrdersSet.add(orderId));
        }
      });
      
      const possibleSplitOrders = Array.from(possibleSplitOrdersSet);
      
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
  
  return {
    matched,
    matchingLog,
    statistics: {
      totalShipments: shipmentData.length,
      exactMatches: matched.filter(m => m.matchType === 'exact').length,
      partialMatches: matched.filter(m => m.matchType === 'partial').length,
      failedMatches: matchingLog.filter(log => !log.success).length
    }
  };
}

// 정형준 고객 복수 주문 확인 함수
function checkMultipleOrders(orders, customerName) {
  console.log(`\n🔍 ${customerName} 고객 주문 조회`);
  
  const customerOrders = orders.filter(order => 
    order.receiver_name && 
    (order.receiver_name.includes(customerName) ||
     normalizeName(order.receiver_name) === normalizeName(customerName) ||
     normalizeNameEnhanced(order.receiver_name) === normalizeNameEnhanced(customerName))
  );
  
  console.log(`📋 ${customerName} 관련 주문:`, customerOrders.length, '건');
  
  if (customerOrders.length > 0) {
    console.table(customerOrders.map(order => ({
      주문번호: order.order_id,
      수취인: order.receiver_name,
      주소: order.receiver_address ? order.receiver_address.substring(0, 50) + '...' : '',
      전화번호: order.receiver_phone,
      주문상태: order.order_status_text
    })));
  }
  
  return customerOrders;
}

// 결과를 표 형태로 출력하는 함수
function printResults(orders, shipmentData, matchResult) {
  console.log('\n📊 === 매칭 시뮬레이션 결과 ===');
  console.log(`총 주문: ${orders.length}건`);
  console.log(`총 송장: ${shipmentData.length}건`);
  console.log(`정확 매칭: ${matchResult.statistics.exactMatches}건`);
  console.log(`부분 매칭: ${matchResult.statistics.partialMatches}건`);
  console.log(`매칭 실패: ${matchResult.statistics.failedMatches}건`);
  
  console.log('\n✅ === 매칭 성공 목록 ===');
  if (matchResult.matched.length > 0) {
    console.table(matchResult.matched.map(match => ({
      주문번호: match.orderId,
      수취인: match.receiverName,
      주소: match.receiverAddress ? match.receiverAddress.substring(0, 40) + '...' : '',
      송장번호: match.trackingNo,
      매칭타입: match.matchType === 'exact' ? '정확' : '부분'
    })));
  }
  
  console.log('\n❌ === 매칭 실패 목록 ===');
  const failedMatches = matchResult.matchingLog.filter(log => !log.success);
  if (failedMatches.length > 0) {
    console.table(failedMatches.map(fail => ({
      행번호: fail.row,
      송장번호: fail.trackingNo,
      수취인: fail.shipmentName,
      주소: fail.shipmentAddress ? fail.shipmentAddress.substring(0, 40) + '...' : '',
      실패사유: fail.reason || '매칭 실패',
      분할주문가능성: fail.possibleSplitOrders ? fail.possibleSplitOrders.join(',') : '없음'
    })));
  }
}

// 메인 실행 함수 (실제 API 호출용)
async function runSimulation() {
  try {
    console.log('🚀 카페24 API 시뮬레이션 시작');
    
    // 1. 배송준비중(N40) 주문 조회
    console.log('\n📞 카페24 API 호출: 배송준비중 주문 조회');
    const ordersResponse = await fetch('http://localhost:3000/api/orders?order_status=N40&limit=1000');
    
    if (!ordersResponse.ok) {
      throw new Error(`API 호출 실패: ${ordersResponse.status}`);
    }
    
    const ordersData = await ordersResponse.json();
    const orders = ordersData.orders || [];
    
    console.log(`✅ 배송준비중 주문 조회 완료: ${orders.length}건`);
    
    // 2. 엑셀 파일 처리
    const excelPath = '/Users/alchemist/Downloads/9-9운송장.xlsx';
    const shipmentData = processExcelFile(excelPath);
    
    if (shipmentData.length === 0) {
      console.error('❌ 엑셀 파일 처리 실패 또는 데이터 없음');
      return;
    }
    
    // 3. 매칭 시뮬레이션
    const matchResult = simulateMatching(orders, shipmentData);
    
    // 4. 결과 출력
    printResults(orders, shipmentData, matchResult);
    
    // 5. 정형준 고객 복수 주문 확인
    checkMultipleOrders(orders, '정형준');
    
    // 6. CSV 결과 파일 생성
    const csvResults = [
      ['구분', '주문번호', '수취인', '주소', '송장번호', '매칭타입', '매칭방법'],
      ...matchResult.matched.map(match => [
        '성공',
        match.orderId,
        match.receiverName,
        match.receiverAddress,
        match.trackingNo,
        match.matchType === 'exact' ? '정확' : '부분',
        '자동매칭'
      ]),
      ...matchResult.matchingLog.filter(log => !log.success).map(fail => [
        '실패',
        fail.possibleSplitOrders ? fail.possibleSplitOrders.join(',') : '',
        fail.shipmentName,
        fail.shipmentAddress || '',
        fail.trackingNo,
        '실패',
        fail.reason || '매칭실패'
      ])
    ];
    
    const csvContent = csvResults.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    fs.writeFileSync('shipment_matching_results.csv', '\ufeff' + csvContent); // UTF-8 BOM 추가
    
    console.log('\n📄 결과 파일 생성: shipment_matching_results.csv');
    
  } catch (error) {
    console.error('❌ 시뮬레이션 오류:', error);
  }
}

// 오프라인 시뮬레이션 함수 (샘플 데이터 사용)
function runOfflineSimulation() {
  console.log('🔄 오프라인 시뮬레이션 모드');
  
  // 샘플 주문 데이터 (배송준비중 상태)
  const sampleOrders = [
    {
      order_id: '20250909001',
      receiver_name: '정형준',
      receiver_phone: '010-1234-5678',
      receiver_address: '서울특별시 강남구 테헤란로 123 ABC빌딩 5층',
      order_status: 'N40',
      order_status_text: '배송준비중'
    },
    {
      order_id: '20250909002',
      receiver_name: '정형준',
      receiver_phone: '010-1234-5678',
      receiver_address: '서울특별시 강남구 테헤란로 456 DEF센터 2층',
      order_status: 'N40',
      order_status_text: '배송준비중'
    },
    {
      order_id: '20250909003',
      receiver_name: '김영수',
      receiver_phone: '010-9876-5432',
      receiver_address: '경기도 안양시 동안구 귀인로 172번길 42',
      order_status: 'N40',
      order_status_text: '배송준비중'
    },
    {
      order_id: '20250909004',
      receiver_name: '박병준 고객*',
      receiver_phone: '010-5555-1234',
      receiver_address: '경기도 양주시 부흥로 2278-13',
      order_status: 'N40',
      order_status_text: '배송준비중'
    },
    {
      order_id: '20250909005',
      receiver_name: '주식회사 그린로더',
      receiver_phone: '02-123-4567',
      receiver_address: '서울특별시 송파구 올림픽로 300',
      order_status: 'N40',
      order_status_text: '배송준비중'
    }
  ];
  
  // 샘플 송장 데이터
  const sampleShipments = [
    {
      trackingNo: '460012345678901234',
      receiverName: '정형준',
      receiverPhone: '010-1234-5678',
      receiverAddress: '서울 강남구 테헤란로 123 ABC빌딩 5층',
      receiverZipcode: '06159',
      originalRow: 2
    },
    {
      trackingNo: '460012345678901235',
      receiverName: '김영수',
      receiverPhone: '010-9876-5432',
      receiverAddress: '경기 안양시 동안구 귀인로172번길42 1층 숨맑은집',
      receiverZipcode: '14060',
      originalRow: 3
    },
    {
      trackingNo: '460012345678901236',
      receiverName: '박병준',
      receiverPhone: '010-5555-1234',
      receiverAddress: '경기 양주시 부흥로 2278-13 나동 다비스터',
      receiverZipcode: '11413',
      originalRow: 4
    },
    {
      trackingNo: '460012345678901237',
      receiverName: '그린로더*',
      receiverPhone: '02-123-4567',
      receiverAddress: '서울 송파구 올림픽로 300',
      receiverZipcode: '05540',
      originalRow: 5
    },
    {
      trackingNo: '460012345678901238',
      receiverName: '이미연',
      receiverPhone: '010-7777-8888',
      receiverAddress: '부산 해운대구 센텀중앙로 100',
      receiverZipcode: '48060',
      originalRow: 6
    }
  ];
  
  // 매칭 시뮬레이션 실행
  const matchResult = simulateMatching(sampleOrders, sampleShipments);
  
  // 결과 출력
  printResults(sampleOrders, sampleShipments, matchResult);
  
  // 정형준 고객 복수 주문 확인
  checkMultipleOrders(sampleOrders, '정형준');
}

// 실행
console.log('📦 카페24 송장 매칭 시뮬레이션');
console.log('='.repeat(50));

// 엑셀 파일이 있는지 확인
const excelPath = '/Users/alchemist/Downloads/9-9운송장.xlsx';
if (fs.existsSync(excelPath)) {
  console.log('📄 엑셀 파일 발견, 실제 데이터로 시뮬레이션 실행');
  
  // 실제 엑셀 파일로 오프라인 시뮬레이션
  const shipmentData = processExcelFile(excelPath);
  if (shipmentData.length > 0) {
    console.log('\n📊 엑셀 파일에서 추출된 송장 데이터:');
    console.table(shipmentData.slice(0, 10).map(item => ({
      행: item.originalRow,
      송장번호: item.trackingNo,
      수취인: item.receiverName,
      주소: item.receiverAddress.substring(0, 30) + '...',
      전화번호: item.receiverPhone
    })));
    
    console.log('\n⚠️ API 서버가 실행 중이지 않으므로 샘플 주문 데이터로 시뮬레이션합니다.');
    runOfflineSimulation();
  }
} else {
  console.log('❌ 엑셀 파일을 찾을 수 없음, 샘플 데이터로 시뮬레이션 실행');
  runOfflineSimulation();
}

module.exports = {
  processExcelFile,
  simulateMatching,
  normalizeString,
  normalizeAddress,
  normalizeName,
  normalizeNameEnhanced,
  normalizeCompanyName
};