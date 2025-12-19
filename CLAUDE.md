# CLAUDE.md - SoundLab Project Guide

## Project Overview

**SoundLab** is an educational web application for hands-on learning of STT (Speech-to-Text) and TTS (Text-to-Speech) technology principles. Built as a Frontend-only SPA for seminar/workshop demonstrations.

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 3
- **Icons**: Lucide React
- **APIs**: Web Audio API, Web Speech API (native browser APIs)
- **Deployment**: Vercel (free tier)

## Project Structure

```
soundlab/
├── src/
│   ├── components/
│   │   ├── layout/          # Header, TabNav, Footer
│   │   ├── WaveLab/         # Audio visualization (waveform, FFT, spectrogram)
│   │   ├── STTLab/          # CTC simulator, speech recognition
│   │   ├── TTSLab/          # G2P demo, speech synthesis
│   │   └── Playground/      # STT→TTS cycle, WER/CER calculator
│   ├── hooks/
│   │   ├── useAudioContext.ts       # Web Audio API management
│   │   ├── useSpeechRecognition.ts  # Web Speech API STT
│   │   └── useSpeechSynthesis.ts    # Web Speech API TTS
│   ├── utils/
│   │   ├── ctcDecoder.ts    # CTC decoding logic & simulation
│   │   ├── g2pRules.ts      # Korean G2P phonological rules
│   │   └── metrics.ts       # WER/CER calculation
│   ├── App.tsx              # Main app with tab navigation
│   ├── main.tsx             # Entry point
│   └── index.css            # Tailwind entry
├── public/
│   ├── favicon.svg
│   ├── samples/             # Audio samples (Griffin-Lim, HiFi-GAN)
│   └── images/              # Static images (attention heatmap)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── vercel.json
```

## Key Commands

```bash
# Development
npm run dev        # Start dev server at localhost:5173

# Build
npm run build      # TypeScript check + production build

# Preview
npm run preview    # Preview production build locally

# Lint
npm run lint       # ESLint check
```

## Application Modules

### 1. Wave Lab (Audio Fundamentals)
- Real-time waveform visualization (Canvas)
- FFT frequency analysis
- Spectrogram generation
- Uses `useAudioContext` hook

### 2. STT Lab (Speech Recognition)
- Web Speech API-based speech recognition
- CTC decoding step-by-step simulator
- Beam Search visualization (planned)
- Uses `useSpeechRecognition` hook

### 3. TTS Lab (Speech Synthesis)
- Web Speech API-based TTS with voice selection
- Korean G2P (Grapheme-to-Phoneme) demo
- Rate/pitch controls
- Uses `useSpeechSynthesis` hook

### 4. Playground
- STT → TTS circular test
- WER/CER metric calculator
- Integrated demo scenarios

## Key Implementation Notes

### Browser Compatibility
- **STT**: Chrome, Edge only (Web Speech API limitation)
- **TTS**: All modern browsers
- **Web Audio**: All modern browsers
- Always display browser compatibility notice to users

### Microphone Permission
```typescript
// Always handle permission errors gracefully
try {
  await navigator.mediaDevices.getUserMedia({ audio: true });
} catch (error) {
  if (error.name === 'NotAllowedError') {
    // Show permission denied message
  }
}
```

### Canvas Performance
- Use `requestAnimationFrame` for smooth animations
- Clean up animation loops in useEffect return

### Korean G2P Rules Covered
- Palatalization (구개음화): 같이 → 가치
- Fortition (경음화): 학교 → 학꾜
- Nasalization (비음화): 국민 → 궁민
- Liaison (연음): 음악을 → 으마글
- H-deletion (ㅎ탈락): 좋아 → 조아
- Aspiration (격음화): 축하 → 추카

## Deployment

### Vercel Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### vercel.json Configuration
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

## Development Guidelines

### Adding New Components
1. Create component in appropriate directory under `src/components/`
2. Use TypeScript interfaces for props
3. Use Tailwind CSS for styling (follow existing color scheme)
4. Export from index.tsx if creating a module folder

### Custom Hooks
- Prefix with `use`
- Return object with state and actions
- Handle errors gracefully with user-friendly messages
- Clean up resources in useEffect return

### Utils
- Pure functions preferred
- Include JSDoc comments for complex functions
- Export types/interfaces along with functions

## Color Palette (Tailwind)
- Primary: `#4F46E5` (Indigo) - Main actions
- Secondary: `#06B6D4` (Cyan) - Secondary actions
- Accent: `#F59E0B` (Amber) - Highlights
- Background: `gray-900` (Dark mode)
- Text: `white`, `gray-400` (muted)

## Known Limitations
- STT only works in Chrome/Edge browsers
- G2P implementation is dictionary-based (educational demo only)
- No backend - all processing is client-side
- Attention heatmap is static image (real-time generation not feasible in browser)

## Future Improvements (Phase 2-3)
- [ ] Real-time spectrogram with color mapping
- [ ] Beam Search tree visualization with SVG
- [ ] More G2P rule coverage
- [ ] Mobile responsive optimization
- [ ] PWA support
