// 실제 데이터로 시뮬레이션 실행
const fs = require('fs');
const fetch = require('node-fetch');  // npm install node-fetch@2 필요
const { processExcelFile, simulateMatching } = require('./shipment_simulation');

async function runRealSimulation() {
  try {
    console.log('🚀 실제 데이터 시뮬레이션 시작');
    console.log('='.repeat(60));
    
    // 1. 카페24 API에서 배송준비중 주문 조회
    console.log('\n📞 1. 카페24 API 호출: 배송준비중 주문 조회');
    const ordersResponse = await fetch('http://localhost:3001/api/orders?order_status=N20&limit=100&start_date=2025-09-01&end_date=2025-09-09', {
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!ordersResponse.ok) {
      throw new Error(`API 호출 실패: ${ordersResponse.status}`);
    }
    
    const ordersData = await ordersResponse.json();
    const orders = ordersData.orders || [];
    
    console.log(`✅ 배송준비중 주문 조회 완료: ${orders.length}건`);
    
    // 주문 데이터 샘플 출력 (처음 5건)
    console.log('\n📋 조회된 주문 샘플 (처음 5건):');
    console.table(orders.slice(0, 5).map(order => ({
      주문번호: order.order_id,
      수취인: order.receiver_name,
      전화번호: order.receiver_phone,
      주소: order.receiver_address ? order.receiver_address.substring(0, 40) + '...' : '',
      주문상태: order.order_status_text
    })));
    
    // 2. 엑셀 파일 처리
    console.log('\n📄 2. 엑셀 파일 처리');
    const excelPath = '/Users/alchemist/Downloads/9-9운송장.xlsx';
    const shipmentData = processExcelFile(excelPath);
    
    if (shipmentData.length === 0) {
      console.error('❌ 엑셀 파일 처리 실패 또는 데이터 없음');
      return;
    }
    
    console.log(`✅ 엑셀에서 송장 데이터 추출 완료: ${shipmentData.length}건`);
    
    // 송장 데이터 샘플 출력
    console.log('\n📦 추출된 송장 샘플 (처음 10건):');
    console.table(shipmentData.slice(0, 10).map(item => ({
      행: item.originalRow,
      송장번호: item.trackingNo,
      수취인: item.receiverName,
      주소: item.receiverAddress.substring(0, 35) + '...',
      전화번호: item.receiverPhone
    })));
    
    // 3. 매칭 시뮬레이션 실행
    console.log('\n🔄 3. 매칭 시뮬레이션 실행');
    const matchResult = simulateMatching(orders, shipmentData);
    
    // 4. 결과 분석 및 출력
    console.log('\n📊 === 매칭 시뮬레이션 결과 ===');
    console.log(`총 주문: ${orders.length}건`);
    console.log(`총 송장: ${shipmentData.length}건`);
    console.log(`정확 매칭: ${matchResult.statistics.exactMatches}건`);
    console.log(`부분 매칭: ${matchResult.statistics.partialMatches}건`);
    console.log(`매칭 실패: ${matchResult.statistics.failedMatches}건`);
    console.log(`매칭 성공률: ${Math.round(((matchResult.statistics.exactMatches + matchResult.statistics.partialMatches) / shipmentData.length) * 100)}%`);
    
    // 5. 매칭 성공 목록
    console.log('\n✅ === 매칭 성공 목록 ===');
    if (matchResult.matched.length > 0) {
      console.table(matchResult.matched.map((match, index) => ({
        순번: index + 1,
        주문번호: match.orderId,
        수취인: match.receiverName,
        주소: match.receiverAddress ? match.receiverAddress.substring(0, 35) + '...' : '',
        송장번호: match.trackingNo,
        매칭타입: match.matchType === 'exact' ? '정확' : '부분'
      })));
    } else {
      console.log('매칭 성공한 항목이 없습니다.');
    }
    
    // 6. 매칭 실패 목록 (상위 11건만)
    const failedMatches = matchResult.matchingLog.filter(log => !log.success);
    console.log(`\n❌ === 매칭 실패 목록 (상위 ${Math.min(failedMatches.length, 11)}건) ===`);
    if (failedMatches.length > 0) {
      console.table(failedMatches.slice(0, 11).map((fail, index) => ({
        순번: index + 1,
        행번호: fail.row,
        송장번호: fail.trackingNo,
        수취인: fail.shipmentName,
        주소: fail.shipmentAddress ? fail.shipmentAddress.substring(0, 35) + '...' : '',
        전화번호: fail.shipmentPhone || '',
        실패사유: fail.reason || '매칭 실패',
        분할주문가능성: fail.possibleSplitOrders ? fail.possibleSplitOrders.slice(0, 2).join(',') : '없음'
      })));
      
      if (failedMatches.length > 11) {
        console.log(`... 외 ${failedMatches.length - 11}건 더`);
      }
    }
    
    // 7. 정형준 고객 복수 주문 확인
    console.log('\n🔍 7. 정형준 고객 복수 주문 여부 확인');
    const jungOrders = orders.filter(order => 
      order.receiver_name && 
      (order.receiver_name.includes('정형준') ||
       order.receiver_name.includes('형준'))
    );
    
    console.log(`📋 정형준 관련 주문: ${jungOrders.length}건`);
    if (jungOrders.length > 0) {
      console.table(jungOrders.map((order, index) => ({
        순번: index + 1,
        주문번호: order.order_id,
        수취인: order.receiver_name,
        전화번호: order.receiver_phone,
        주소: order.receiver_address ? order.receiver_address.substring(0, 40) + '...' : '',
        주문상태: order.order_status_text
      })));
      
      // 정형준 고객의 송장 확인
      const jungShipments = shipmentData.filter(item =>
        item.receiverName && 
        (item.receiverName.includes('정형준') || 
         item.receiverName.includes('형준'))
      );
      
      console.log(`📦 정형준 관련 송장: ${jungShipments.length}건`);
      if (jungShipments.length > 0) {
        console.table(jungShipments.map((item, index) => ({
          순번: index + 1,
          행번호: item.originalRow,
          송장번호: item.trackingNo,
          수취인: item.receiverName,
          주소: item.receiverAddress.substring(0, 35) + '...',
          전화번호: item.receiverPhone
        })));
      }
      
      if (jungOrders.length > 1) {
        console.log('🔍 정형준 고객은 복수 주문을 보유하고 있습니다.');
      } else if (jungShipments.length > 1) {
        console.log('🔍 정형준 고객의 송장이 복수 건 존재하여 분할 주문일 가능성이 있습니다.');
      } else {
        console.log('✅ 정형준 고객은 단일 주문입니다.');
      }
    }
    
    // 8. 매칭 방법별 통계
    console.log('\n📈 8. 매칭 방법별 통계');
    const methodStats = {};
    matchResult.matchingLog.filter(log => log.success).forEach(log => {
      const method = log.matchMethod;
      methodStats[method] = (methodStats[method] || 0) + 1;
    });
    
    console.table(Object.entries(methodStats).map(([method, count]) => ({
      매칭방법: method,
      건수: count,
      비율: `${Math.round((count / matchResult.matched.length) * 100)}%`
    })));
    
    // 9. CSV 결과 파일 생성
    console.log('\n📄 9. 결과 파일 생성');
    const csvResults = [
      ['구분', '순번', '주문번호', '수취인', '주소', '전화번호', '송장번호', '매칭타입', '매칭방법', '비고'],
      ...matchResult.matched.map((match, index) => [
        '성공',
        index + 1,
        match.orderId,
        match.receiverName,
        match.receiverAddress,
        orders.find(o => o.order_id === match.orderId)?.receiver_phone || '',
        match.trackingNo,
        match.matchType === 'exact' ? '정확' : '부분',
        '자동매칭',
        ''
      ]),
      ...failedMatches.map((fail, index) => [
        '실패',
        index + 1,
        fail.possibleSplitOrders ? fail.possibleSplitOrders.join(',') : '',
        fail.shipmentName,
        fail.shipmentAddress || '',
        fail.shipmentPhone || '',
        fail.trackingNo,
        '실패',
        fail.reason || '매칭실패',
        fail.possibleSplitOrders ? '분할주문 가능성' : ''
      ])
    ];
    
    const csvContent = csvResults.map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const filename = `shipment_matching_results_${new Date().toISOString().split('T')[0]}.csv`;
    fs.writeFileSync(filename, '\ufeff' + csvContent); // UTF-8 BOM 추가
    
    console.log(`📄 결과 파일 생성 완료: ${filename}`);
    
    // 10. 최종 요약
    console.log('\n🎯 === 최종 요약 ===');
    console.log('📊 매칭 현황:');
    console.log(`  - 전체 송장: ${shipmentData.length}건`);
    console.log(`  - 매칭 성공: ${matchResult.matched.length}건 (${Math.round((matchResult.matched.length / shipmentData.length) * 100)}%)`);
    console.log(`  - 매칭 실패: ${failedMatches.length}건 (${Math.round((failedMatches.length / shipmentData.length) * 100)}%)`);
    console.log(`  - 정확 매칭: ${matchResult.statistics.exactMatches}건`);
    console.log(`  - 부분 매칭: ${matchResult.statistics.partialMatches}건`);
    
    console.log('\n🔍 정형준 고객:');
    console.log(`  - 주문 건수: ${jungOrders.length}건`);
    const jungShipmentCount = shipmentData.filter(item =>
      item.receiverName && 
      (item.receiverName.includes('정형준') || item.receiverName.includes('형준'))
    ).length;
    console.log(`  - 송장 건수: ${jungShipmentCount}건`);
    console.log(`  - 복수 주문 여부: ${jungOrders.length > 1 ? 'YES' : 'NO'}`);
    
    console.log('\n✅ 시뮬레이션 완료!');
    
  } catch (error) {
    console.error('❌ 시뮬레이션 오류:', error.message);
    console.error('스택 트레이스:', error.stack);
  }
}

// 필요한 패키지가 있는지 확인
try {
  require('node-fetch');
} catch (e) {
  console.error('❌ node-fetch 패키지가 필요합니다. 다음 명령어로 설치하세요:');
  console.error('npm install node-fetch@2');
  process.exit(1);
}

// 실행
runRealSimulation();