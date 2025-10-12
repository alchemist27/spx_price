# 송장번호 매칭 로직 이슈 분석

## 발생한 문제

**케이스:** "정찬우" (서울)와 "장정우" (제주)가 잘못 매칭됨
- 이름: 정찬우 vs 장정우 (다름)
- 주소: 서울특별시 vs 제주시 (완전히 다름)
- 전화번호: 다름

**실제 데이터:**
- 송장: "정찬우 고**" (비식별 처리)
- 주문: "장정우 고**" (비식별 처리)

## 현재 매칭 로직 분석

### 파일 위치
`/components/ShipmentUploadModal.tsx`

### 주요 함수들

#### 1. `areNamesSimilarWithMasking` (line 170-213)
비식별 처리된 이름 비교 함수

```typescript
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
  if ((name1.includes('*') || name2.includes('*'))) {
    const base1 = clean1.toLowerCase();
    const base2 = clean2.toLowerCase();

    // 짧은 쪽이 긴 쪽에 포함되는지 확인
    if (base1.length < base2.length) {
      return base2.startsWith(base1) || base2.includes(base1);  // ← 위험!
    } else {
      return base1.startsWith(base2) || base1.includes(base2);  // ← 위험!
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
```

#### 2. `normalizeNameEnhanced` (line 137-153)
직급/호칭 제거

```typescript
const normalizeNameEnhanced = (name: string) => {
  if (!name) return '';
  let cleaned = name.trim();

  // 확장된 직급/호칭 패턴
  const expandedTitlePattern = /\s*(고객|팀장|원장|본부장|실장|과장|대리|사원|매니저|이사|대표|사장|부장|차장|님|씨|선생님|사장님|대표님|로스터|원두|담당자)\**/gi;

  cleaned = cleaned.replace(/\s+(실장|과장|대리|팀장|부장|차장|이사|사원|담당자|사장)$/g, '');
  cleaned = cleaned.replace(expandedTitlePattern, '');
  cleaned = cleaned.replace(/\*/g, '').trim();

  // 공백과 특수문자 제거하고 소문자로
  return cleaned.replace(/[\s\-\(\)]/g, '').toLowerCase();
};
```

## "정찬우 고**" vs "장정우 고**" 매칭 분석

### 단계별 처리

1. **별표 제거** (line 174-175):
   - `clean1 = "정찬우 고**".replace(/\*/g, '').trim()` → **"정찬우 고"**
   - `clean2 = "장정우 고**".replace(/\*/g, '').trim()` → **"장정우 고"**

2. **완전 일치 체크** (line 178):
   - `"정찬우 고" === "장정우 고"` → ❌ false

3. **정규화 후 비교** (line 181-183):
   - `normalizeNameEnhanced("정찬우 고")` → "정찬우"
   - `normalizeNameEnhanced("장정우 고")` → "장정우"
   - `"정찬우" === "장정우"` → ❌ false

4. **별표 포함 조건** (line 188-198):
   - 조건: `name1.includes('*') || name2.includes('*')` → ✅ true
   - `base1 = "정찬우 고"` (4글자)
   - `base2 = "장정우 고"` (4글자)
   - 길이가 같으므로 `else` 분기 실행
   - `"정찬우 고".includes("장정우 고")` → ❌ false
   - **결과: 매칭 안 됨**

5. **80% 유사도 체크** (line 200-210):
   - `minLength = 4`, `maxLength = 4`
   - `minLength >= 3 && 4/4 >= 0.8` → ✅ true
   - `getCommonPrefixLength("정찬우 고", "장정우 고")` → 0 (첫 글자부터 다름)
   - `0 >= 4 * 0.8 (3.2)` → ❌ false
   - **결과: 매칭 안 됨**

## 결론

### 현재 로직으로는 매칭되면 안 됨

위 분석에 따르면 "정찬우 고**"와 "장정우 고**"는 현재 로직으로 매칭되면 안 됩니다.

### 실제로 매칭되었다면 가능한 원인

1. **다른 매칭 경로를 탔을 가능성**:
   - 1순위: 수하인명 매칭 (line 528-604)
   - 복수 주문 처리 (line 604-676)
   - 2순위: 전화번호 매칭 (line 678-726)
   - 3순위: 주소 매칭 (line 728-842)
   - 개선된 매칭 (line 844-933)

2. **데이터 이슈**:
   - 보이지 않는 공백이나 특수문자
   - 정규화 과정에서 예상치 못한 문자 제거
   - "고" 이후 추가 텍스트 존재

3. **복수 주문 처리 로직**:
   - 이름이 비슷한 복수 주문이 있을 때 주소로 추가 필터링하는데, 이 과정에서 문제가 있을 수 있음

## 문제가 있는 코드 섹션

### Line 188-198: 너무 관대한 `includes` 체크

```typescript
if ((name1.includes('*') || name2.includes('*'))) {
  const base1 = clean1.toLowerCase();
  const base2 = clean2.toLowerCase();

  if (base1.length < base2.length) {
    return base2.startsWith(base1) || base2.includes(base1);  // ← 위험!
  } else {
    return base1.startsWith(base2) || base1.includes(base2);  // ← 위험!
  }
}
```

**문제점:**
- `includes()`는 부분 문자열을 찾음
- "정찬우 고"와 "장정우 고"는 "고"를 공유하지만, `includes()`는 전체 문자열을 찾으므로 이 케이스에서는 문제없음
- 하지만 더 짧은 문자열이나 단일 문자가 포함된 경우 오매칭 가능성 있음

**예시:**
- "김철수 팀*" vs "김영희 팀*" → "팀"이 공통이지만 현재 로직으로는 매칭 안 됨 (정상)
- "김*" vs "김철수*" → `"김철수".includes("김")` → ✅ 매칭됨 (위험!)

## 권장 사항

### 1. 매칭 로그 확인
매칭 로그의 `matchMethod` 필드를 확인하여 어느 경로로 매칭되었는지 파악

### 2. 추가 검증 필요
비식별 처리된 이름 매칭 시 추가 검증 조건 필요:
- 최소 문자열 길이 제한 (2글자 이하는 위험)
- `includes` 대신 더 정확한 유사도 알고리즘 사용
- 이름 매칭 성공 시 주소나 전화번호로 추가 검증

### 3. 로깅 강화
문제 케이스 발생 시 디버깅을 위한 상세 로그 추가

## 다음 조치 사항

1. 실제 매칭 로그 확인 (matchMethod 필드)
2. 문제 케이스 재현 테스트
3. 필요시 매칭 로직 수정
