/**
 * STT 평가 지표 계산 유틸리티
 * - WER (Word Error Rate): 단어 단위 오류율
 * - CER (Character Error Rate): 글자 단위 오류율
 */

/**
 * Levenshtein Distance (편집 거리) 계산
 * 두 시퀀스 사이의 최소 편집 연산(삽입, 삭제, 대체) 횟수
 */
function levenshteinDistance<T>(a: T[], b: T[]): {
  distance: number;
  operations: {
    substitutions: number;
    deletions: number;
    insertions: number;
  };
} {
  const m = a.length;
  const n = b.length;
  
  // DP 테이블 초기화
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // 첫 행과 첫 열 초기화
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // DP 테이블 채우기
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // 삭제
        dp[i][j - 1] + 1,      // 삽입
        dp[i - 1][j - 1] + cost // 대체 (또는 일치)
      );
    }
  }

  // 역추적하여 연산 종류 계산
  let i = m, j = n;
  let substitutions = 0, deletions = 0, insertions = 0;
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      // 일치
      i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      // 대체
      substitutions++;
      i--; j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      // 삽입
      insertions++;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      // 삭제
      deletions++;
      i--;
    } else {
      break;
    }
  }

  return {
    distance: dp[m][n],
    operations: { substitutions, deletions, insertions },
  };
}

export interface MetricResult {
  value: number;              // 0~1 사이 값
  percentage: string;         // "25.00%"
  distance: number;           // 편집 거리
  referenceLength: number;    // 정답 길이
  operations: {
    substitutions: number;    // 대체 횟수 (S)
    deletions: number;        // 삭제 횟수 (D)
    insertions: number;       // 삽입 횟수 (I)
  };
  formula: string;            // 계산식 표시용
}

/**
 * WER (Word Error Rate) 계산
 * 공식: (S + D + I) / N
 * - S: Substitution (대체)
 * - D: Deletion (삭제)
 * - I: Insertion (삽입)
 * - N: 정답 단어 수
 */
export function calculateWER(reference: string, hypothesis: string): MetricResult {
  // 공백 기준으로 단어 분리
  const refWords = reference.trim().split(/\s+/).filter(w => w);
  const hypWords = hypothesis.trim().split(/\s+/).filter(w => w);
  
  if (refWords.length === 0) {
    return {
      value: hypWords.length > 0 ? 1 : 0,
      percentage: hypWords.length > 0 ? '100.00%' : '0.00%',
      distance: hypWords.length,
      referenceLength: 0,
      operations: { substitutions: 0, deletions: 0, insertions: hypWords.length },
      formula: `(0 + 0 + ${hypWords.length}) / 0`,
    };
  }
  
  const { distance, operations } = levenshteinDistance(refWords, hypWords);
  const value = distance / refWords.length;
  
  return {
    value: Math.min(value, 1), // 1을 초과할 수 있지만 100%로 제한
    percentage: (Math.min(value, 1) * 100).toFixed(2) + '%',
    distance,
    referenceLength: refWords.length,
    operations,
    formula: `(${operations.substitutions} + ${operations.deletions} + ${operations.insertions}) / ${refWords.length}`,
  };
}

/**
 * CER (Character Error Rate) 계산
 * WER과 동일한 공식이지만 글자 단위로 계산
 * 한국어처럼 교착어에서는 CER이 더 공정한 지표
 */
export function calculateCER(reference: string, hypothesis: string): MetricResult {
  // 공백 제거 후 글자 단위 분리
  const refChars = [...reference.replace(/\s/g, '')];
  const hypChars = [...hypothesis.replace(/\s/g, '')];
  
  if (refChars.length === 0) {
    return {
      value: hypChars.length > 0 ? 1 : 0,
      percentage: hypChars.length > 0 ? '100.00%' : '0.00%',
      distance: hypChars.length,
      referenceLength: 0,
      operations: { substitutions: 0, deletions: 0, insertions: hypChars.length },
      formula: `(0 + 0 + ${hypChars.length}) / 0`,
    };
  }
  
  const { distance, operations } = levenshteinDistance(refChars, hypChars);
  const value = distance / refChars.length;
  
  return {
    value: Math.min(value, 1),
    percentage: (Math.min(value, 1) * 100).toFixed(2) + '%',
    distance,
    referenceLength: refChars.length,
    operations,
    formula: `(${operations.substitutions} + ${operations.deletions} + ${operations.insertions}) / ${refChars.length}`,
  };
}

/**
 * WER과 CER 동시 계산
 */
export function calculateMetrics(reference: string, hypothesis: string): {
  wer: MetricResult;
  cer: MetricResult;
} {
  return {
    wer: calculateWER(reference, hypothesis),
    cer: calculateCER(reference, hypothesis),
  };
}

/**
 * 예시 생성 (데모용)
 */
export const METRIC_EXAMPLES: Array<{
  name: string;
  reference: string;
  hypothesis: string;
  description: string;
}> = [
  {
    name: '완벽 일치',
    reference: '오늘 날씨가 좋습니다',
    hypothesis: '오늘 날씨가 좋습니다',
    description: 'WER=0%, CER=0%',
  },
  {
    name: '단어 하나 틀림',
    reference: 'the weather is good',
    hypothesis: 'the weather is great',
    description: 'WER=25% (1/4), good→great',
  },
  {
    name: '조사 하나 틀림 (한국어)',
    reference: '학교에 갑니다',
    hypothesis: '학교가 갑니다',
    description: 'WER: 50% vs CER: ~14% (한 글자 차이)',
  },
  {
    name: '단어 누락',
    reference: '오늘 서울 날씨는 맑음',
    hypothesis: '오늘 날씨는 맑음',
    description: '"서울" 누락 → 삭제 오류',
  },
  {
    name: '단어 추가',
    reference: '회의는 3시에',
    hypothesis: '오늘 회의는 3시에',
    description: '"오늘" 추가 → 삽입 오류',
  },
];
