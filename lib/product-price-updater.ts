export interface Product {
  product_no: number;
  product_name: string;
  base_price: number;
  variant_5kg_code: string;
  variant_20kg_code: string;
  price_per_kg_1: number;
  price_per_kg_5: number;
  price_per_kg_20: number;
}

export interface UpdateProgress {
  total: number;
  completed: number;
  failed: number;
  current_product: string;
  current_step: string;
  percentage: number;
  errors: Array<{
    product_name: string;
    step: string;
    error: string;
    timestamp: Date;
  }>;
  estimated_remaining_time: number;
}

class ProductPriceUpdater {
  private queue: Array<{
    id: string;
    apiCall: () => Promise<any>;
    productName: string;
    step: string;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    retryCount: number;
  }> = [];
  
  private processing = false;
  private progress: UpdateProgress;
  private startTime: Date = new Date();
  private requestsPerSecond = 3; // 안전한 속도로 설정
  private maxRetries = 3;
  private progressCallback?: (progress: UpdateProgress) => void;

  constructor(progressCallback?: (progress: UpdateProgress) => void) {
    this.progressCallback = progressCallback;
    this.progress = {
      total: 0,
      completed: 0,
      failed: 0,
      current_product: '',
      current_step: '',
      percentage: 0,
      errors: [],
      estimated_remaining_time: 0
    };
  }

  async updateMultipleProducts(products: Product[]): Promise<void> {
    console.log(`🚀 상품 가격 업데이트 시작: ${products.length}개 상품`);
    
    this.initializeProgress(products.length);
    this.startTime = new Date();

    // 모든 상품의 모든 단계를 큐에 추가
    for (const product of products) {
      await this.queueProductUpdates(product);
    }

    // 큐 처리 시작
    await this.processQueue();
    
    console.log('✅ 모든 상품 가격 업데이트 완료!');
    this.logFinalReport();
  }

  private initializeProgress(totalProducts: number): void {
    this.progress = {
      total: totalProducts * 4, // 상품당 4개 API 호출
      completed: 0,
      failed: 0,
      current_product: '',
      current_step: '',
      percentage: 0,
      errors: [],
      estimated_remaining_time: 0
    };
  }

  private async queueProductUpdates(product: Product): Promise<void> {
    // 1단계: 기본가격 수정
    await this.addToQueue(
      `${product.product_no}-base-price`,
      () => this.updateBasePrice(product),
      product.product_name,
      '기본가격 수정'
    );

    // 2단계: 옵션명 수정
    await this.addToQueue(
      `${product.product_no}-options`,
      () => this.updateOptions(product),
      product.product_name,
      '옵션명 수정'
    );

    // 3단계: 5kg variant 수정
    await this.addToQueue(
      `${product.product_no}-5kg`,
      () => this.updateVariant5kg(product),
      product.product_name,
      '5kg 옵션 수정'
    );

    // 4단계: 20kg variant 수정
    await this.addToQueue(
      `${product.product_no}-20kg`,
      () => this.updateVariant20kg(product),
      product.product_name,
      '20kg 옵션 수정'
    );
  }

  private async addToQueue(
    id: string,
    apiCall: () => Promise<any>,
    productName: string,
    step: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        id,
        apiCall,
        productName,
        step,
        resolve,
        reject,
        retryCount: 0
      });
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    
    this.processing = true;
    const interval = 1000 / this.requestsPerSecond;

    console.log(`📊 큐 처리 시작: 총 ${this.queue.length}개 작업`);

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      
      this.updateCurrentProgress(task.productName, task.step);

      try {
        console.log(`🔄 처리중: ${task.productName} - ${task.step}`);
        
        const result = await task.apiCall();
        task.resolve(result);
        
        this.progress.completed++;
        console.log(`✅ 완료: ${task.productName} - ${task.step}`);
        
      } catch (error) {
        await this.handleError(task, error);
      }

      this.updateProgressPercentage();
      this.notifyProgress();
      
      // API 제한을 피하기 위한 지연
      await this.sleep(interval);
    }

    this.processing = false;
  }

  private async handleError(task: any, error: any): Promise<void> {
    console.error(`❌ 오류: ${task.productName} - ${task.step}:`, error.message);
    
    // 재시도 로직
    if (task.retryCount < this.maxRetries) {
      task.retryCount++;
      
      // 지수적 백오프
      const retryDelay = Math.pow(2, task.retryCount) * 1000;
      console.log(`🔄 재시도 ${task.retryCount}/${this.maxRetries}: ${task.productName} - ${task.step} (${retryDelay}ms 후)`);
      
      await this.sleep(retryDelay);
      this.queue.unshift(task); // 큐 앞쪽에 다시 추가
      
    } else {
      // 최대 재시도 횟수 초과
      this.progress.failed++;
      this.progress.errors.push({
        product_name: task.productName,
        step: task.step,
        error: error.message,
        timestamp: new Date()
      });
      
      task.reject(error);
      console.error(`💀 최종 실패: ${task.productName} - ${task.step}`);
    }
  }

  private updateCurrentProgress(productName: string, step: string): void {
    this.progress.current_product = productName;
    this.progress.current_step = step;
  }

  private updateProgressPercentage(): void {
    this.progress.percentage = Math.round(
      (this.progress.completed / this.progress.total) * 100
    );
    
    // 예상 남은 시간 계산
    if (this.progress.completed > 0) {
      const elapsedTime = Date.now() - this.startTime.getTime();
      const avgTimePerTask = elapsedTime / this.progress.completed;
      const remainingTasks = this.progress.total - this.progress.completed;
      this.progress.estimated_remaining_time = Math.round(
        (remainingTasks * avgTimePerTask) / 1000 / 60 // 분 단위
      );
    }
  }

  private notifyProgress(): void {
    if (this.progressCallback) {
      this.progressCallback({ ...this.progress });
    }
    
    // 콘솔에도 진행상황 출력
    console.log(`📈 진행률: ${this.progress.percentage}% (${this.progress.completed}/${this.progress.total}) | 실패: ${this.progress.failed} | 예상 남은 시간: ${this.progress.estimated_remaining_time}분`);
  }

  private logFinalReport(): void {
    const totalTime = Math.round((Date.now() - this.startTime.getTime()) / 1000 / 60);
    
    console.log('\n📋 === 최종 리포트 ===');
    console.log(`⏱️  총 소요시간: ${totalTime}분`);
    console.log(`✅ 성공: ${this.progress.completed}개`);
    console.log(`❌ 실패: ${this.progress.failed}개`);
    console.log(`📊 성공률: ${Math.round((this.progress.completed / this.progress.total) * 100)}%`);
    
    if (this.progress.errors.length > 0) {
      console.log('\n❌ 실패한 작업들:');
      this.progress.errors.forEach(error => {
        console.log(`  - ${error.product_name} (${error.step}): ${error.error}`);
      });
    }
  }

  // API 호출 함수들
  private async updateBasePrice(product: Product): Promise<any> {
    // 실제 카페24 API 호출
    const response = await fetch(`/api/products/${product.product_no}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          price: product.base_price.toString()
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`기본가격 수정 실패: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  private async updateOptions(product: Product): Promise<any> {
    const response = await fetch(`/api/products/${product.product_no}/options`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          options: [{
            option_name: "중량",
            option_value: [
              { option_text: `1kg (${product.price_per_kg_1.toLocaleString()}원/kg)` },
              { option_text: `5kg (${product.price_per_kg_5.toLocaleString()}원/kg)` },
              { option_text: `20kg (${product.price_per_kg_20.toLocaleString()}원/kg)` }
            ]
          }]
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`옵션명 수정 실패: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  private async updateVariant5kg(product: Product): Promise<any> {
    const additionalAmount = (product.price_per_kg_5 * 5) - product.base_price;
    
    const response = await fetch(`/api/products/${product.product_no}/variants/${product.variant_5kg_code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          additional_amount: additionalAmount.toString()
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`5kg 옵션 수정 실패: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  private async updateVariant20kg(product: Product): Promise<any> {
    const additionalAmount = (product.price_per_kg_20 * 20) - product.base_price;
    
    const response = await fetch(`/api/products/${product.product_no}/variants/${product.variant_20kg_code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          additional_amount: additionalAmount.toString()
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`20kg 옵션 수정 실패: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 진행상황 조회용 메서드
  getProgress(): UpdateProgress {
    return { ...this.progress };
  }

  // 큐 정지/재시작
  stop(): void {
    this.processing = false;
    console.log('⏸️  작업이 일시정지되었습니다.');
  }

  async resume(): Promise<void> {
    if (!this.processing && this.queue.length > 0) {
      console.log('▶️  작업을 재시작합니다.');
      await this.processQueue();
    }
  }
}

export default ProductPriceUpdater; 