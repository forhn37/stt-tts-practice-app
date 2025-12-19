# 🎙️ SoundLab

> STT/TTS 원리를 눈으로 보고 체험하는 세미나 실습 앱

## 🚀 빠른 시작

### 1. 프로젝트 생성

```bash
# Vite + React + TypeScript 프로젝트 생성
npm create vite@latest soundlab -- --template react-ts
cd soundlab

# 의존성 설치
npm install

# Tailwind CSS 설치
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# 아이콘 설치
npm install lucide-react
```

### 2. 설정 파일 수정

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
        primary: '#4F46E5',
        secondary: '#06B6D4',
        accent: '#F59E0B',
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
```

### 3. 스타터 파일 복사

이 폴더의 파일들을 프로젝트에 복사하세요:

```
soundlab-starter/
├── App.tsx              → src/App.tsx (덮어쓰기)
├── hooks/
│   ├── useAudioContext.ts      → src/hooks/
│   ├── useSpeechRecognition.ts → src/hooks/
│   └── useSpeechSynthesis.ts   → src/hooks/
└── utils/
    ├── ctcDecoder.ts    → src/utils/
    ├── g2pRules.ts      → src/utils/
    └── metrics.ts       → src/utils/
```

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:5173 접속!

---

## 📁 프로젝트 구조

```
src/
├── components/
│   ├── layout/          # Header, TabNav, Footer
│   ├── WaveLab/         # 파형, FFT, 스펙트로그램
│   ├── STTLab/          # CTC 시뮬레이터, 음성인식
│   ├── TTSLab/          # G2P, 음성합성
│   └── Playground/      # 순환테스트, WER/CER
├── hooks/
│   ├── useAudioContext.ts       # Web Audio API
│   ├── useSpeechRecognition.ts  # Web Speech API (STT)
│   └── useSpeechSynthesis.ts    # Web Speech API (TTS)
├── utils/
│   ├── ctcDecoder.ts    # CTC 디코딩 로직
│   ├── g2pRules.ts      # 한국어 G2P 규칙
│   └── metrics.ts       # WER/CER 계산
├── App.tsx
├── main.tsx
└── index.css
```

---

## 🛠️ 핵심 기능

### Wave Lab
- 실시간 파형 시각화 (Canvas)
- FFT 주파수 분석
- 스펙트로그램 생성

### STT Lab
- Web Speech API 음성 인식
- CTC 디코딩 시뮬레이터
- Beam Search 시각화

### TTS Lab
- Web Speech API 음성 합성
- G2P 변환 데모 (한국어 음운 규칙)
- 속도/음높이 조절

### Playground
- STT → TTS 순환 테스트
- WER/CER 계산기

---

## ⚠️ 브라우저 지원

| 브라우저 | STT | TTS | Web Audio |
|---------|-----|-----|-----------|
| Chrome | ✅ | ✅ | ✅ |
| Edge | ✅ | ✅ | ✅ |
| Safari | ⚠️ | ✅ | ✅ |
| Firefox | ❌ | ✅ | ✅ |

> **권장**: Chrome 또는 Edge 브라우저 사용

---

## 🚀 배포 (Vercel)

```bash
# Vercel CLI 설치
npm i -g vercel

# 빌드 & 배포
npm run build
vercel --prod
```

**vercel.json**:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

---

## 📚 참고 자료

- [Web Audio API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Web Speech API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [Vite 공식 문서](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)

---

## 📝 라이선스

MIT License
