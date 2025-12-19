# 🛠️ SoundLab 실습 앱 개발 계획서 v3 (실전 개발용)

> **버전**: 3.0 (VSCode 개발 준비 완료)
> 
> **변경사항**: 기존 v2 검토 후 실현 가능성 재점검, 즉시 개발 가능한 형태로 수정

---

## 🔍 기존 계획서(v2) 점검 결과

### ✅ 유지할 것
- Frontend Only 아키텍처 (Vercel 무료 배포)
- React + TypeScript + Vite + Tailwind
- Web Audio API / Web Speech API 활용
- 4개 모듈 구조 (Wave Lab, STT Lab, TTS Lab, Playground)

### ⚠️ 수정이 필요한 것

| 항목 | 기존 계획 | 문제점 | 수정 |
|------|----------|--------|------|
| **Meyda.js** | Mel-Spectrogram 생성 | `melBands`만 제공, full spectrogram 아님 | 직접 Canvas로 구현 (더 간단) |
| **D3.js** | Beam Search 트리 | React와 조합 복잡 | **react-d3-tree** 또는 순수 SVG |
| **Recharts** | FFT 그래프 | 실시간 업데이트 성능 이슈 | **Canvas 직접 렌더링** (더 빠름) |
| **프로젝트 구조** | 15개+ 컴포넌트 | 과도하게 분리됨 | **8개 핵심 컴포넌트**로 단순화 |
| **G2P 구현** | 규칙 기반 딕셔너리 | 커버리지 부족 | **대표 예시 30개 + 설명** 위주 |

### ❌ 제거/축소할 것
- Attention 히트맵 (실시간 생성 불가 → 정적 이미지로 대체)
- Vocoder 비교 (샘플 오디오 재생만)
- 복잡한 Text Normalization (간단한 예시만)

---

## 📁 수정된 프로젝트 구조

```
soundlab/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── TabNav.tsx
│   │   │   └── Footer.tsx
│   │   │
│   │   ├── WaveLab/
│   │   │   ├── index.tsx              # 탭 컨테이너
│   │   │   ├── WaveformCanvas.tsx     # 실시간 파형 (Canvas)
│   │   │   ├── FFTCanvas.tsx          # 주파수 분석 (Canvas)
│   │   │   └── SpectrogramCanvas.tsx  # 스펙트로그램 (Canvas)
│   │   │
│   │   ├── STTLab/
│   │   │   ├── index.tsx              # 탭 컨테이너
│   │   │   ├── CTCSimulator.tsx       # CTC 디코딩 시뮬레이션
│   │   │   ├── SpeechRecognizer.tsx   # Web Speech API STT
│   │   │   └── BeamSearchDemo.tsx     # Beam Search 시각화 (SVG)
│   │   │
│   │   ├── TTSLab/
│   │   │   ├── index.tsx              # 탭 컨테이너
│   │   │   ├── G2PDemo.tsx            # G2P 변환 데모
│   │   │   └── SpeechSynthesizer.tsx  # Web Speech API TTS
│   │   │
│   │   └── Playground/
│   │       ├── index.tsx              # 탭 컨테이너
│   │       ├── STTTTSCycle.tsx        # STT→TTS 순환
│   │       └── MetricsDemo.tsx        # WER/CER 계산
│   │
│   ├── hooks/
│   │   ├── useAudioContext.ts         # Web Audio 관리
│   │   ├── useMediaRecorder.ts        # 녹음 관리
│   │   ├── useSpeechRecognition.ts    # STT 훅
│   │   └── useSpeechSynthesis.ts      # TTS 훅
│   │
│   ├── utils/
│   │   ├── audioUtils.ts              # FFT, 파형 데이터 처리
│   │   ├── ctcDecoder.ts              # CTC 로직
│   │   ├── g2pRules.ts                # 한국어 G2P 규칙
│   │   └── metrics.ts                 # WER/CER 계산
│   │
│   ├── data/
│   │   └── g2pExamples.ts             # G2P 예시 데이터
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css                      # Tailwind 진입점
│
├── public/
│   ├── samples/
│   │   ├── griffin_lim.mp3            # Griffin-Lim 샘플
│   │   └── hifigan.mp3                # HiFi-GAN 샘플
│   └── images/
│       └── attention_heatmap.png      # 정적 Attention 이미지
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── vercel.json
```

**컴포넌트 수**: 15개 → **12개** (30% 감소)

---

## 📦 package.json (복사해서 바로 사용)

```json
{
  "name": "soundlab",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.294.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.55.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.3.6",
    "typescript": "^5.3.3",
    "vite": "^5.0.8"
  }
}
```

### 📌 의존성 설명

| 패키지 | 버전 | 용도 |
|--------|------|------|
| react | 18.2.0 | UI 프레임워크 |
| lucide-react | 0.294.0 | 아이콘 (경량) |
| tailwindcss | 3.3.6 | 스타일링 |
| vite | 5.0.8 | 빌드 도구 |

**제거된 패키지**:
- ~~recharts~~ → Canvas 직접 사용
- ~~d3~~ → SVG 직접 사용 또는 간단한 트리 구현
- ~~meyda~~ → Web Audio API로 충분

---

## 🚀 VSCode에서 시작하기

### Step 1: 프로젝트 생성

```bash
# 1. Vite로 React + TypeScript 프로젝트 생성
npm create vite@latest soundlab -- --template react-ts

# 2. 폴더 이동
cd soundlab

# 3. 의존성 설치
npm install

# 4. Tailwind 설치
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# 5. 아이콘 설치
npm install lucide-react

# 6. 개발 서버 시작
npm run dev
```

### Step 2: Tailwind 설정

**tailwind.config.js**:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4F46E5',    // 인디고
        secondary: '#06B6D4',  // 시안
        accent: '#F59E0B',     // 앰버
      }
    },
  },
  plugins: [],
}
```

**src/index.css**:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 커스텀 스타일 */
body {
  @apply bg-gray-50 text-gray-900;
}
```

### Step 3: 핵심 설정 파일들

**vite.config.ts**:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
})
```

**vercel.json**:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

**tsconfig.json** (수정 부분):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

---

## 🎯 개발 우선순위 (MVP 먼저!)

### Phase 1: 핵심 기능 (3일) ⭐ MVP

| 순서 | 컴포넌트 | 소요 | 난이도 |
|------|----------|------|--------|
| 1 | App.tsx + 탭 네비게이션 | 2h | ⭐ |
| 2 | WaveformCanvas (실시간 파형) | 3h | ⭐⭐ |
| 3 | SpeechRecognizer (STT) | 2h | ⭐ |
| 4 | SpeechSynthesizer (TTS) | 2h | ⭐ |
| 5 | CTCSimulator | 3h | ⭐⭐ |
| 6 | G2PDemo | 2h | ⭐ |

**Phase 1 완료 시**: 세미나 실습 가능한 최소 기능 완성

### Phase 2: 시각화 강화 (2일)

| 순서 | 컴포넌트 | 소요 | 난이도 |
|------|----------|------|--------|
| 7 | FFTCanvas (주파수 분석) | 3h | ⭐⭐ |
| 8 | SpectrogramCanvas | 4h | ⭐⭐⭐ |
| 9 | BeamSearchDemo | 3h | ⭐⭐ |

### Phase 3: 완성도 (1일)

| 순서 | 컴포넌트 | 소요 | 난이도 |
|------|----------|------|--------|
| 10 | STTTTSCycle (순환 테스트) | 2h | ⭐⭐ |
| 11 | MetricsDemo (WER/CER) | 2h | ⭐ |
| 12 | UI 다듬기 + 반응형 | 3h | ⭐ |

---

## 🔧 핵심 코드 스니펫

### 1. useAudioContext.ts (Web Audio 훅)

```typescript
import { useRef, useState, useCallback } from 'react';

export function useAudioContext() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
      
      setIsRecording(true);
      return { analyser: analyserRef.current, audioContext: audioContextRef.current };
    } catch (error) {
      console.error('마이크 접근 실패:', error);
      throw error;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setIsRecording(false);
  }, []);

  const getWaveformData = useCallback(() => {
    if (!analyserRef.current) return null;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(dataArray);
    return dataArray;
  }, []);

  const getFrequencyData = useCallback(() => {
    if (!analyserRef.current) return null;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    return dataArray;
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    getWaveformData,
    getFrequencyData,
  };
}
```

### 2. useSpeechRecognition.ts (STT 훅)

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';

interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [results, setResults] = useState<SpeechRecognitionResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    // 브라우저 지원 확인
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해주세요.');
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = 'ko-KR';
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;

    recognitionRef.current.onresult = (event) => {
      const newResults: SpeechRecognitionResult[] = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        newResults.push({
          transcript: event.results[i][0].transcript,
          confidence: event.results[i][0].confidence,
          isFinal: event.results[i].isFinal,
        });
      }
      setResults(prev => [...prev, ...newResults]);
    };

    recognitionRef.current.onerror = (event) => {
      setError(`음성 인식 오류: ${event.error}`);
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const startListening = useCallback(() => {
    setResults([]);
    setError(null);
    recognitionRef.current?.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return {
    isListening,
    results,
    error,
    startListening,
    stopListening,
    isSupported: !!recognitionRef.current,
  };
}
```

### 3. useSpeechSynthesis.ts (TTS 훅)

```typescript
import { useState, useCallback, useEffect } from 'react';

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      // 한국어 음성 기본 선택
      const koreanVoice = availableVoices.find(v => v.lang.includes('ko'));
      if (koreanVoice) setSelectedVoice(koreanVoice);
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const speak = useCallback((text: string, rate = 1, pitch = 1) => {
    if (isSpeaking) {
      speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = rate;
    utterance.pitch = pitch;
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    speechSynthesis.speak(utterance);
  }, [isSpeaking, selectedVoice]);

  const stop = useCallback(() => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return {
    isSpeaking,
    voices,
    selectedVoice,
    setSelectedVoice,
    speak,
    stop,
  };
}
```

### 4. ctcDecoder.ts (CTC 로직)

```typescript
export interface CTCStep {
  step: number;
  description: string;
  sequence: string[];
  result: string;
}

export function ctcDecode(input: string[]): CTCStep[] {
  const steps: CTCStep[] = [];
  
  // Step 0: 원본 입력
  steps.push({
    step: 0,
    description: 'Raw CTC Output',
    sequence: [...input],
    result: input.join('-'),
  });

  // Step 1: 연속 중복 제거
  const collapsed: string[] = [];
  let prev: string | null = null;
  for (const char of input) {
    if (char !== prev) {
      collapsed.push(char);
      prev = char;
    }
  }
  steps.push({
    step: 1,
    description: 'Collapse Consecutive Duplicates',
    sequence: [...collapsed],
    result: collapsed.join('-'),
  });

  // Step 2: Blank 제거
  const final = collapsed.filter(c => c !== 'ε' && c !== '-' && c !== 'blank');
  steps.push({
    step: 2,
    description: 'Remove Blanks (ε)',
    sequence: [...final],
    result: final.join(''),
  });

  return steps;
}

// 랜덤 CTC 출력 생성 (데모용)
export function generateRandomCTC(targetWord: string): string[] {
  const result: string[] = [];
  for (const char of targetWord) {
    // 랜덤하게 blank 추가
    if (Math.random() > 0.5) result.push('ε');
    // 랜덤하게 중복 추가
    const repeatCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < repeatCount; i++) {
      result.push(char);
    }
  }
  result.push('ε');
  return result;
}
```

### 5. g2pRules.ts (G2P 규칙)

```typescript
export interface G2PExample {
  input: string;
  output: string;
  rule: string;
  ruleKo: string;
  description: string;
}

export const g2pExamples: G2PExample[] = [
  // 구개음화
  { input: '같이', output: '가치', rule: 'Palatalization', ruleKo: '구개음화', description: 'ㄷ/ㅌ + 이 → ㅈ/ㅊ' },
  { input: '굳이', output: '구지', rule: 'Palatalization', ruleKo: '구개음화', description: 'ㄷ + 이 → ㅈ' },
  { input: '붙이다', output: '부치다', rule: 'Palatalization', ruleKo: '구개음화', description: 'ㅌ + 이 → ㅊ' },
  { input: '해돋이', output: '해도지', rule: 'Palatalization', ruleKo: '구개음화', description: 'ㄷ + 이 → ㅈ' },
  
  // 경음화
  { input: '학교', output: '학꾜', rule: 'Fortition', ruleKo: '경음화', description: 'ㄱ + ㄱ → ㄱ + ㄲ' },
  { input: '국밥', output: '국빱', rule: 'Fortition', ruleKo: '경음화', description: 'ㄱ + ㅂ → ㄱ + ㅃ' },
  { input: '식당', output: '식땅', rule: 'Fortition', ruleKo: '경음화', description: 'ㄱ + ㄷ → ㄱ + ㄸ' },
  { input: '입구', output: '입꾸', rule: 'Fortition', ruleKo: '경음화', description: 'ㅂ + ㄱ → ㅂ + ㄲ' },
  
  // 비음화
  { input: '국민', output: '궁민', rule: 'Nasalization', ruleKo: '비음화', description: 'ㄱ + ㅁ → ㅇ + ㅁ' },
  { input: '갑니다', output: '감니다', rule: 'Nasalization', ruleKo: '비음화', description: 'ㅂ + ㄴ → ㅁ + ㄴ' },
  { input: '있는', output: '인는', rule: 'Nasalization', ruleKo: '비음화', description: 'ㅆ + ㄴ → ㄴ + ㄴ' },
  { input: '맏누나', output: '만누나', rule: 'Nasalization', ruleKo: '비음화', description: 'ㄷ + ㄴ → ㄴ + ㄴ' },
  
  // 연음
  { input: '음악을', output: '으마글', rule: 'Liaison', ruleKo: '연음', description: '받침 + 모음 → 연음' },
  { input: '옷을', output: '오슬', rule: 'Liaison', ruleKo: '연음', description: 'ㅅ받침 연음' },
  { input: '밖에', output: '바께', rule: 'Liaison', ruleKo: '연음', description: 'ㄱ받침 연음 + 경음화' },
  { input: '꽃이', output: '꼬치', rule: 'Liaison', ruleKo: '연음', description: 'ㅊ받침 연음' },
  
  // ㅎ 탈락
  { input: '좋아', output: '조아', rule: 'H-deletion', ruleKo: 'ㅎ탈락', description: 'ㅎ + 모음 → 탈락' },
  { input: '놓아', output: '노아', rule: 'H-deletion', ruleKo: 'ㅎ탈락', description: 'ㅎ + 아 → 아' },
  { input: '넣어', output: '너어', rule: 'H-deletion', ruleKo: 'ㅎ탈락', description: 'ㅎ + 어 → 어' },
  
  // 격음화
  { input: '축하', output: '추카', rule: 'Aspiration', ruleKo: '격음화', description: 'ㄱ + ㅎ → ㅋ' },
  { input: '입학', output: '이팍', rule: 'Aspiration', ruleKo: '격음화', description: 'ㅂ + ㅎ → ㅍ' },
  { input: '못하다', output: '모타다', rule: 'Aspiration', ruleKo: '격음화', description: 'ㄷ + ㅎ → ㅌ' },
];

// 간단한 G2P 변환 (딕셔너리 기반)
const g2pDict: Record<string, string> = {};
g2pExamples.forEach(ex => {
  g2pDict[ex.input] = ex.output;
});

export function simpleG2P(text: string): string {
  let result = text;
  for (const [input, output] of Object.entries(g2pDict)) {
    result = result.replace(new RegExp(input, 'g'), output);
  }
  return result;
}

// 규칙별 그룹화
export function getExamplesByRule(): Record<string, G2PExample[]> {
  const grouped: Record<string, G2PExample[]> = {};
  g2pExamples.forEach(ex => {
    if (!grouped[ex.ruleKo]) {
      grouped[ex.ruleKo] = [];
    }
    grouped[ex.ruleKo].push(ex);
  });
  return grouped;
}
```

### 6. metrics.ts (WER/CER 계산)

```typescript
// Levenshtein Distance
function levenshteinDistance<T>(a: T[], b: T[]): number {
  const matrix: number[][] = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,       // 삽입
        matrix[j - 1][i] + 1,       // 삭제
        matrix[j - 1][i - 1] + cost // 대체
      );
    }
  }

  return matrix[b.length][a.length];
}

export interface MetricResult {
  value: number;
  percentage: string;
  details: {
    substitutions: number;
    deletions: number;
    insertions: number;
    total: number;
  };
}

export function calculateWER(reference: string, hypothesis: string): MetricResult {
  const refWords = reference.trim().split(/\s+/);
  const hypWords = hypothesis.trim().split(/\s+/);
  const distance = levenshteinDistance(refWords, hypWords);
  const value = distance / refWords.length;
  
  return {
    value,
    percentage: (value * 100).toFixed(2) + '%',
    details: {
      substitutions: 0, // 상세 계산은 복잡해서 생략
      deletions: 0,
      insertions: 0,
      total: distance,
    },
  };
}

export function calculateCER(reference: string, hypothesis: string): MetricResult {
  const refChars = [...reference.replace(/\s/g, '')];
  const hypChars = [...hypothesis.replace(/\s/g, '')];
  const distance = levenshteinDistance(refChars, hypChars);
  const value = distance / refChars.length;
  
  return {
    value,
    percentage: (value * 100).toFixed(2) + '%',
    details: {
      substitutions: 0,
      deletions: 0,
      insertions: 0,
      total: distance,
    },
  };
}
```

---

## ⚠️ 주의사항 & 팁

### 브라우저 호환성

```typescript
// 반드시 체크해야 할 것들
const checkBrowserSupport = () => {
  const support = {
    webAudio: typeof AudioContext !== 'undefined',
    speechRecognition: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
    speechSynthesis: 'speechSynthesis' in window,
    getUserMedia: 'mediaDevices' in navigator,
  };
  
  return support;
};
```

### 마이크 권한 처리

```typescript
// 권한 거부 시 친절한 안내
const handleMicPermission = async () => {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    return true;
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        alert('마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
      } else if (error.name === 'NotFoundError') {
        alert('마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.');
      }
    }
    return false;
  }
};
```

### Canvas 성능 최적화

```typescript
// requestAnimationFrame 사용
const drawWaveform = (analyser: AnalyserNode, canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d')!;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  
  const draw = () => {
    analyser.getByteTimeDomainData(dataArray);
    
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4F46E5';
    ctx.beginPath();
    
    const sliceWidth = canvas.width / dataArray.length;
    let x = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    
    ctx.stroke();
    requestAnimationFrame(draw);
  };
  
  draw();
};
```

---

## 📅 수정된 개발 일정

| Phase | 기간 | 목표 | 체크포인트 |
|-------|------|------|-----------|
| **Phase 1** | 2일 | MVP 완성 | STT/TTS 작동, CTC 시뮬레이터 |
| **Phase 2** | 2일 | 시각화 | 파형, FFT, 스펙트로그램 |
| **Phase 3** | 1일 | 마무리 | UI 다듬기, 테스트, 배포 |

**총 5일** (기존 7일 → 2일 단축)

---

## ✅ 최종 체크리스트

### 개발 시작 전
- [ ] Node.js 18+ 설치 확인
- [ ] VSCode 설치 + 확장 (ES7 React, Tailwind CSS IntelliSense)
- [ ] Chrome DevTools 사용법 숙지

### Phase 1 완료 후 (MVP)
- [ ] Chrome에서 STT 동작 확인
- [ ] TTS 동작 확인
- [ ] CTC 시뮬레이터 동작 확인
- [ ] 마이크 권한 거부 시 안내 메시지

### 배포 전
- [ ] Vercel 계정 생성
- [ ] 빌드 성공 확인 (`npm run build`)
- [ ] 모바일에서 접속 테스트 (선택)

### 세미나 전
- [ ] 실제 URL 테스트
- [ ] 백업용 스크린샷 준비
- [ ] "Chrome 사용해주세요" 안내 문구 준비

---

> 📝 **문서 버전**: 3.0 (실전 개발용)
> 
> 📅 **작성일**: 2024년 12월
> 
> 🔄 **주요 변경**: 
> - 불필요한 라이브러리 제거
> - 컴포넌트 수 30% 감소
> - 핵심 코드 스니펫 추가
> - 개발 일정 단축 (7일 → 5일)
