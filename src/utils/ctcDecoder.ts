/**
 * CTC (Connectionist Temporal Classification) 디코딩 시뮬레이터
 */

export interface CTCStep {
  step: number;
  title: string;
  description: string;
  sequence: string[];
  highlighted: number[]; // 변경된 인덱스
}

/**
 * CTC 디코딩 전체 과정을 단계별로 반환
 */
export function ctcDecodeWithSteps(input: string[]): CTCStep[] {
  const steps: CTCStep[] = [];
  const BLANK = 'ε';
  
  // Step 0: 원본 입력
  steps.push({
    step: 0,
    title: 'Raw CTC Output',
    description: '모델이 각 프레임마다 출력한 결과입니다.',
    sequence: [...input],
    highlighted: [],
  });

  // Step 1: 연속 중복 제거
  const collapsed: string[] = [];
  const collapsedHighlight: number[] = [];
  let prev: string | null = null;
  
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char !== prev) {
      collapsed.push(char);
      collapsedHighlight.push(collapsed.length - 1);
      prev = char;
    }
  }
  
  steps.push({
    step: 1,
    title: 'Collapse Consecutive Duplicates',
    description: '연속으로 중복된 문자를 하나로 합칩니다. (예: HH → H)',
    sequence: [...collapsed],
    highlighted: collapsedHighlight,
  });

  // Step 2: Blank 제거
  const final: string[] = [];
  const finalHighlight: number[] = [];
  
  for (let i = 0; i < collapsed.length; i++) {
    if (collapsed[i] !== BLANK && collapsed[i] !== '-' && collapsed[i].toLowerCase() !== 'blank') {
      final.push(collapsed[i]);
      finalHighlight.push(final.length - 1);
    }
  }
  
  steps.push({
    step: 2,
    title: 'Remove Blanks (ε)',
    description: 'Blank 토큰(ε)을 제거하여 최종 결과를 얻습니다.',
    sequence: [...final],
    highlighted: finalHighlight,
  });

  return steps;
}

/**
 * CTC 디코딩 최종 결과만 반환
 */
export function ctcDecode(input: string[]): string {
  const steps = ctcDecodeWithSteps(input);
  const lastStep = steps[steps.length - 1];
  return lastStep.sequence.join('');
}

/**
 * 입력 문자열을 CTC 시퀀스로 파싱
 * 지원 형식: "ε-H-H-E-L-L-O" 또는 "ε,H,H,E,L,L,O" 또는 "ε H H E L L O"
 */
export function parseCTCInput(input: string): string[] {
  // 구분자 감지 및 분리
  if (input.includes('-')) {
    return input.split('-').map(s => s.trim()).filter(s => s);
  } else if (input.includes(',')) {
    return input.split(',').map(s => s.trim()).filter(s => s);
  } else if (input.includes(' ')) {
    return input.split(/\s+/).map(s => s.trim()).filter(s => s);
  }
  
  // 구분자 없으면 글자 단위로 분리
  return [...input].filter(s => s.trim());
}

/**
 * 타겟 단어로부터 랜덤 CTC 출력 생성 (데모용)
 */
export function generateRandomCTC(targetWord: string): string[] {
  const result: string[] = [];
  const BLANK = 'ε';
  
  for (const char of targetWord) {
    // 앞에 랜덤하게 blank 추가 (50% 확률)
    if (Math.random() > 0.5) {
      result.push(BLANK);
    }
    
    // 문자 반복 (1~3회)
    const repeatCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < repeatCount; i++) {
      result.push(char);
    }
  }
  
  // 마지막에 blank 추가
  result.push(BLANK);
  
  return result;
}

/**
 * CTC 퀴즈 생성
 */
export interface CTCQuiz {
  input: string[];
  answer: string;
  hint: string;
}

export function generateCTCQuiz(difficulty: 'easy' | 'medium' | 'hard' = 'easy'): CTCQuiz {
  const words = {
    easy: ['HELLO', 'CAT', 'DOG', 'SUN', 'MOON'],
    medium: ['APPLE', 'WATER', 'HAPPY', 'SMILE', 'PEACE'],
    hard: ['BEAUTIFUL', 'COMPUTER', 'LANGUAGE', 'SCIENCE', 'TOGETHER'],
  };
  
  const wordList = words[difficulty];
  const answer = wordList[Math.floor(Math.random() * wordList.length)];
  const input = generateRandomCTC(answer);
  
  const hints = {
    easy: '힌트: 연속 중복 제거 후 Blank(ε)를 제거하세요.',
    medium: '힌트: Step 1에서 HH→H, Step 2에서 ε 제거!',
    hard: '힌트: 차근차근 두 단계를 거치면 됩니다.',
  };
  
  return {
    input,
    answer,
    hint: hints[difficulty],
  };
}
