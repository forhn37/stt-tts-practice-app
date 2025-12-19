/**
 * G2P (Grapheme to Phoneme) 변환 - 한국어 음운 규칙
 * 
 * 참고: 이 구현은 교육용 데모이며, 실제 서비스에서는 
 * g2pk 같은 전문 라이브러리 사용을 권장합니다.
 */

export interface G2PExample {
  id: string;
  input: string;        // 원래 표기
  output: string;       // 실제 발음
  rule: string;         // 규칙 영문명
  ruleKo: string;       // 규칙 한글명
  description: string;  // 설명
  category: G2PCategory;
}

export type G2PCategory = 
  | 'palatalization'    // 구개음화
  | 'fortition'         // 경음화
  | 'nasalization'      // 비음화
  | 'liaison'           // 연음
  | 'h-deletion'        // ㅎ탈락
  | 'aspiration';       // 격음화

export const CATEGORY_LABELS: Record<G2PCategory, { ko: string; en: string; emoji: string }> = {
  'palatalization': { ko: '구개음화', en: 'Palatalization', emoji: '👅' },
  'fortition': { ko: '경음화', en: 'Fortition', emoji: '💪' },
  'nasalization': { ko: '비음화', en: 'Nasalization', emoji: '👃' },
  'liaison': { ko: '연음', en: 'Liaison', emoji: '🔗' },
  'h-deletion': { ko: 'ㅎ탈락', en: 'H-deletion', emoji: '🫥' },
  'aspiration': { ko: '격음화', en: 'Aspiration', emoji: '💨' },
};

export const G2P_EXAMPLES: G2PExample[] = [
  // ===== 구개음화 =====
  {
    id: 'pal-1',
    input: '같이',
    output: '가치',
    rule: 'Palatalization',
    ruleKo: '구개음화',
    description: 'ㄷ/ㅌ 받침 + 이 → ㅈ/ㅊ으로 변환',
    category: 'palatalization',
  },
  {
    id: 'pal-2',
    input: '굳이',
    output: '구지',
    rule: 'Palatalization',
    ruleKo: '구개음화',
    description: 'ㄷ 받침 + 이 → ㅈ',
    category: 'palatalization',
  },
  {
    id: 'pal-3',
    input: '붙이다',
    output: '부치다',
    rule: 'Palatalization',
    ruleKo: '구개음화',
    description: 'ㅌ 받침 + 이 → ㅊ',
    category: 'palatalization',
  },
  {
    id: 'pal-4',
    input: '해돋이',
    output: '해도지',
    rule: 'Palatalization',
    ruleKo: '구개음화',
    description: 'ㄷ 받침 + 이 → ㅈ',
    category: 'palatalization',
  },

  // ===== 경음화 =====
  {
    id: 'for-1',
    input: '학교',
    output: '학꾜',
    rule: 'Fortition',
    ruleKo: '경음화',
    description: 'ㄱ 받침 + ㄱ → ㄱ + ㄲ',
    category: 'fortition',
  },
  {
    id: 'for-2',
    input: '국밥',
    output: '국빱',
    rule: 'Fortition',
    ruleKo: '경음화',
    description: 'ㄱ 받침 + ㅂ → ㄱ + ㅃ',
    category: 'fortition',
  },
  {
    id: 'for-3',
    input: '식당',
    output: '식땅',
    rule: 'Fortition',
    ruleKo: '경음화',
    description: 'ㄱ 받침 + ㄷ → ㄱ + ㄸ',
    category: 'fortition',
  },
  {
    id: 'for-4',
    input: '입구',
    output: '입꾸',
    rule: 'Fortition',
    ruleKo: '경음화',
    description: 'ㅂ 받침 + ㄱ → ㅂ + ㄲ',
    category: 'fortition',
  },
  {
    id: 'for-5',
    input: '듣고',
    output: '듣꼬',
    rule: 'Fortition',
    ruleKo: '경음화',
    description: 'ㄷ 받침 + ㄱ → ㄷ + ㄲ',
    category: 'fortition',
  },

  // ===== 비음화 =====
  {
    id: 'nas-1',
    input: '국민',
    output: '궁민',
    rule: 'Nasalization',
    ruleKo: '비음화',
    description: 'ㄱ 받침 + ㅁ → ㅇ + ㅁ',
    category: 'nasalization',
  },
  {
    id: 'nas-2',
    input: '갑니다',
    output: '감니다',
    rule: 'Nasalization',
    ruleKo: '비음화',
    description: 'ㅂ 받침 + ㄴ → ㅁ + ㄴ',
    category: 'nasalization',
  },
  {
    id: 'nas-3',
    input: '있는',
    output: '인는',
    rule: 'Nasalization',
    ruleKo: '비음화',
    description: 'ㅆ 받침 + ㄴ → ㄴ + ㄴ',
    category: 'nasalization',
  },
  {
    id: 'nas-4',
    input: '맏누나',
    output: '만누나',
    rule: 'Nasalization',
    ruleKo: '비음화',
    description: 'ㄷ 받침 + ㄴ → ㄴ + ㄴ',
    category: 'nasalization',
  },
  {
    id: 'nas-5',
    input: '작년',
    output: '장년',
    rule: 'Nasalization',
    ruleKo: '비음화',
    description: 'ㄱ 받침 + ㄴ → ㅇ + ㄴ',
    category: 'nasalization',
  },

  // ===== 연음 =====
  {
    id: 'lia-1',
    input: '음악을',
    output: '으마글',
    rule: 'Liaison',
    ruleKo: '연음',
    description: '받침이 뒤 음절의 초성으로 연결',
    category: 'liaison',
  },
  {
    id: 'lia-2',
    input: '옷을',
    output: '오슬',
    rule: 'Liaison',
    ruleKo: '연음',
    description: 'ㅅ 받침 연음',
    category: 'liaison',
  },
  {
    id: 'lia-3',
    input: '꽃이',
    output: '꼬치',
    rule: 'Liaison',
    ruleKo: '연음',
    description: 'ㅊ 받침 연음',
    category: 'liaison',
  },
  {
    id: 'lia-4',
    input: '책을',
    output: '채글',
    rule: 'Liaison',
    ruleKo: '연음',
    description: 'ㄱ 받침 연음',
    category: 'liaison',
  },
  // 이름 연음 (자주 발생하는 케이스)
  {
    id: 'lia-5',
    input: '김현',
    output: '기면',
    rule: 'Liaison',
    ruleKo: '연음',
    description: 'ㅁ 받침 + 모음 → 연음 (이름)',
    category: 'liaison',
  },
  {
    id: 'lia-6',
    input: '임하나',
    output: '이마나',
    rule: 'Liaison',
    ruleKo: '연음',
    description: 'ㅁ 받침 + ㅎ → ㅎ탈락 후 연음 (이름)',
    category: 'liaison',
  },
  {
    id: 'lia-7',
    input: '박은지',
    output: '바근지',
    rule: 'Liaison',
    ruleKo: '연음',
    description: 'ㄱ 받침 + 모음 → 연음 (이름)',
    category: 'liaison',
  },
  {
    id: 'lia-8',
    input: '한아름',
    output: '하나름',
    rule: 'Liaison',
    ruleKo: '연음',
    description: 'ㄴ 받침 + 모음 → 연음 (이름)',
    category: 'liaison',
  },
  {
    id: 'lia-9',
    input: '밥을',
    output: '바블',
    rule: 'Liaison',
    ruleKo: '연음',
    description: 'ㅂ 받침 연음',
    category: 'liaison',
  },

  // ===== ㅎ탈락 =====
  {
    id: 'hdel-1',
    input: '좋아',
    output: '조아',
    rule: 'H-deletion',
    ruleKo: 'ㅎ탈락',
    description: 'ㅎ 받침 + 모음 → ㅎ 탈락',
    category: 'h-deletion',
  },
  {
    id: 'hdel-2',
    input: '놓아',
    output: '노아',
    rule: 'H-deletion',
    ruleKo: 'ㅎ탈락',
    description: 'ㅎ 받침 + 아 → ㅎ 탈락',
    category: 'h-deletion',
  },
  {
    id: 'hdel-3',
    input: '넣어',
    output: '너어',
    rule: 'H-deletion',
    ruleKo: 'ㅎ탈락',
    description: 'ㅎ 받침 + 어 → ㅎ 탈락',
    category: 'h-deletion',
  },
  {
    id: 'hdel-4',
    input: '많이',
    output: '마니',
    rule: 'H-deletion',
    ruleKo: 'ㅎ탈락',
    description: 'ㅎ 받침 + 이 → ㅎ 탈락',
    category: 'h-deletion',
  },

  // ===== 격음화 =====
  {
    id: 'asp-1',
    input: '축하',
    output: '추카',
    rule: 'Aspiration',
    ruleKo: '격음화',
    description: 'ㄱ 받침 + ㅎ → ㅋ',
    category: 'aspiration',
  },
  {
    id: 'asp-2',
    input: '입학',
    output: '이팍',
    rule: 'Aspiration',
    ruleKo: '격음화',
    description: 'ㅂ 받침 + ㅎ → ㅍ',
    category: 'aspiration',
  },
  {
    id: 'asp-3',
    input: '못하다',
    output: '모타다',
    rule: 'Aspiration',
    ruleKo: '격음화',
    description: 'ㄷ 받침 + ㅎ → ㅌ',
    category: 'aspiration',
  },
  {
    id: 'asp-4',
    input: '급하다',
    output: '그파다',
    rule: 'Aspiration',
    ruleKo: '격음화',
    description: 'ㅂ 받침 + ㅎ → ㅍ',
    category: 'aspiration',
  },
];

// 딕셔너리 기반 간단 변환
const g2pDict: Record<string, string> = {};
G2P_EXAMPLES.forEach(ex => {
  g2pDict[ex.input] = ex.output;
});

/**
 * 간단한 G2P 변환 (딕셔너리 매칭)
 */
export function simpleG2P(text: string): { result: string; matched: G2PExample[] } {
  let result = text;
  const matched: G2PExample[] = [];
  
  for (const example of G2P_EXAMPLES) {
    if (result.includes(example.input)) {
      result = result.replace(new RegExp(example.input, 'g'), example.output);
      matched.push(example);
    }
  }
  
  return { result, matched };
}

/**
 * 카테고리별로 예시 그룹화
 */
export function getExamplesByCategory(): Record<G2PCategory, G2PExample[]> {
  const grouped: Record<G2PCategory, G2PExample[]> = {
    'palatalization': [],
    'fortition': [],
    'nasalization': [],
    'liaison': [],
    'h-deletion': [],
    'aspiration': [],
  };
  
  G2P_EXAMPLES.forEach(ex => {
    grouped[ex.category].push(ex);
  });
  
  return grouped;
}

/**
 * 랜덤 예시 가져오기
 */
export function getRandomExample(): G2PExample {
  return G2P_EXAMPLES[Math.floor(Math.random() * G2P_EXAMPLES.length)];
}

/**
 * 카테고리별 랜덤 예시 가져오기
 */
export function getRandomExampleByCategory(category: G2PCategory): G2PExample {
  const examples = G2P_EXAMPLES.filter(ex => ex.category === category);
  return examples[Math.floor(Math.random() * examples.length)];
}
