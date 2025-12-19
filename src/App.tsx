import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Waves, Mic, Volume2, PlayCircle, Square, AlertCircle, Gauge, Volume1, VolumeX, Activity } from 'lucide-react';
import { useAudioContext } from './hooks/useAudioContext';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { ctcDecodeWithSteps, parseCTCInput, generateRandomCTC } from './utils/ctcDecoder';
import { simpleG2P, G2P_EXAMPLES, CATEGORY_LABELS, type G2PCategory } from './utils/g2pRules';
import { calculateWER, calculateCER } from './utils/metrics';
import { type VoiceFeatures } from './utils/audioFeatures';

// CTC vs Attention 비교용 예시 데이터
const ATTENTION_EXAMPLES = [
  {
    id: 'hello',
    text: '안녕하세요',
    chars: ['안', '녕', '하', '세', '요'],
    frames: 8,
    // Attention: 각 출력 문자가 어느 입력 프레임에 집중하는지 (소프트 가중치)
    matrix: [
      [0.9, 0.8, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0],
      [0.1, 0.2, 0.9, 0.8, 0.1, 0.0, 0.0, 0.0],
      [0.0, 0.0, 0.1, 0.2, 0.9, 0.1, 0.0, 0.0],
      [0.0, 0.0, 0.0, 0.0, 0.1, 0.9, 0.2, 0.0],
      [0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.8, 0.9],
    ],
    // CTC: 각 프레임에서 독립적으로 예측한 결과 (ε = blank)
    ctcOutput: ['안', '안', 'ε', '녕', 'ε', '하', '세', '요'],
    ctcDecoded: '안녕하세요', // blank 제거 + 중복 병합 후
    description: '대각선 패턴: 순차적으로 음성과 텍스트가 대응됩니다.'
  },
  {
    id: 'weather',
    text: '날씨가좋아요',
    chars: ['날', '씨', '가', '좋', '아', '요'],
    frames: 10,
    matrix: [
      [0.9, 0.7, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
      [0.1, 0.3, 0.9, 0.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
      [0.0, 0.0, 0.1, 0.8, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0],
      [0.0, 0.0, 0.0, 0.1, 0.9, 0.8, 0.1, 0.0, 0.0, 0.0],
      [0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 0.9, 0.3, 0.0, 0.0],
      [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.7, 0.9, 0.8],
    ],
    ctcOutput: ['날', 'ε', '씨', '씨', '가', 'ε', '좋', '아', 'ε', '요'],
    ctcDecoded: '날씨가좋아요',
    description: '자연스러운 대각선 패턴으로 좋은 인식 품질을 나타냅니다.'
  },
  {
    id: 'repeat',
    text: '가나다라',
    chars: ['가', '나', '다', '라'],
    frames: 8,
    matrix: [
      [0.5, 0.5, 0.5, 0.5, 0.1, 0.1, 0.1, 0.1],
      [0.3, 0.3, 0.3, 0.3, 0.5, 0.5, 0.1, 0.1],
      [0.1, 0.1, 0.1, 0.2, 0.4, 0.6, 0.8, 0.2],
      [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.3, 0.9],
    ],
    ctcOutput: ['가', '가', '나', 'ε', '나', '다', 'ε', '라'],
    ctcDecoded: '가나나다라', // CTC가 혼란스러워서 '나'를 두번 예측
    description: '분산된 패턴: 모델이 불확실하게 예측하고 있습니다. (나쁜 예시)'
  }
];

// Vocoder 비교용 샘플 데이터
const VOCODER_SAMPLES = [
  {
    id: 'griffin-lim',
    name: 'Griffin-Lim (전통 방식)',
    quality: 3,
    description: '기계적, 금속성 느낌',
    characteristics: '반복적 위상 복원 알고리즘',
    // 시뮬레이션 파라미터: 노이즈 많고, 하모닉스 왜곡
    noiseLevel: 0.15,
    distortion: 0.3,
  },
  {
    id: 'wavenet',
    name: 'WaveNet (2016)',
    quality: 5,
    description: '최고 품질이지만 매우 느림',
    characteristics: '자기회귀 모델, 1초 생성에 수분 소요',
    // 시뮬레이션 파라미터: 깨끗하고 자연스러움
    noiseLevel: 0.01,
    distortion: 0.02,
  },
  {
    id: 'hifi-gan',
    name: 'HiFi-GAN (2020, 현재 표준)',
    quality: 5,
    description: '실시간 + 고품질',
    characteristics: 'GAN 기반, Generator-Discriminator 학습',
    // 시뮬레이션 파라미터: 깨끗함
    noiseLevel: 0.02,
    distortion: 0.03,
  }
];

// 탭 타입 정의
type TabType = 'wave' | 'stt' | 'tts' | 'playground' | 'advanced';

// 탭 설정
const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'wave', label: 'Wave Lab', icon: <Waves className="w-5 h-5" /> },
  { id: 'stt', label: 'STT Lab', icon: <Mic className="w-5 h-5" /> },
  { id: 'tts', label: 'TTS Lab', icon: <Volume2 className="w-5 h-5" /> },
  { id: 'playground', label: 'Playground', icon: <PlayCircle className="w-5 h-5" /> },
  { id: 'advanced', label: 'Advanced Lab', icon: <Gauge className="w-5 h-5" /> },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('wave');

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-primary">
            SoundLab
          </h1>
          <p className="text-gray-400 text-sm">
            STT/TTS 원리를 눈으로 보고 체험하기
          </p>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                data-testid={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium
                  transition-colors duration-200
                  ${activeTab === tab.id
                    ? 'text-primary border-b-2 border-primary bg-gray-700/50'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/30'
                  }
                `}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {activeTab === 'wave' && <WaveLab />}
        {activeTab === 'stt' && <STTLab />}
        {activeTab === 'tts' && <TTSLab />}
        {activeTab === 'playground' && <Playground />}
        {activeTab === 'advanced' && <AdvancedLab />}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 border-t border-gray-700 py-4">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-500 text-sm">
          STT/TTS 세미나 실습용 앱 - Chrome/Edge 브라우저 권장
        </div>
      </footer>
    </div>
  );
}

// ============================================
// Wave Lab - 실시간 오디오 시각화
// ============================================
function WaveLab() {
  const { isRecording, isSupported, error, startRecording, stopRecording, getWaveformData, getFrequencyData } = useAudioContext();
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const fftCanvasRef = useRef<HTMLCanvasElement>(null);
  const melCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const getWaveformDataRef = useRef(getWaveformData);
  const getFrequencyDataRef = useRef(getFrequencyData);
  const melHistoryRef = useRef<number[][]>([]);

  // 샘플링 레이트 비교 상태
  const [selectedSampleRate, setSelectedSampleRate] = useState<number>(44100);
  const [showMelSpectrogram, setShowMelSpectrogram] = useState(false);

  // 다운샘플링 데모 상태
  const [recordedAudio, setRecordedAudio] = useState<AudioBuffer | null>(null);
  const [isPlayingDemo, setIsPlayingDemo] = useState(false);
  const [demoRecording, setDemoRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Keep refs updated
  useEffect(() => {
    getWaveformDataRef.current = getWaveformData;
    getFrequencyDataRef.current = getFrequencyData;
  }, [getWaveformData, getFrequencyData]);

  // Mel Filter Bank 생성 (간단화된 버전)
  const melFilterBank = useMemo(() => {
    const numMelBins = 40;
    const numFftBins = 128;
    const sampleRate = 44100;

    const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
    const melToHz = (mel: number) => 700 * (Math.pow(10, mel / 2595) - 1);

    const minMel = hzToMel(0);
    const maxMel = hzToMel(sampleRate / 2);
    const melPoints = Array.from({ length: numMelBins + 2 }, (_, i) =>
      melToHz(minMel + (maxMel - minMel) * i / (numMelBins + 1))
    );

    const fftBins = melPoints.map(hz => Math.floor((numFftBins * 2) * hz / sampleRate));

    const filterBank: number[][] = [];
    for (let i = 1; i <= numMelBins; i++) {
      const filter = new Array(numFftBins).fill(0);
      for (let j = fftBins[i - 1]; j < fftBins[i]; j++) {
        if (j < numFftBins) filter[j] = (j - fftBins[i - 1]) / (fftBins[i] - fftBins[i - 1]);
      }
      for (let j = fftBins[i]; j < fftBins[i + 1]; j++) {
        if (j < numFftBins) filter[j] = (fftBins[i + 1] - j) / (fftBins[i + 1] - fftBins[i]);
      }
      filterBank.push(filter);
    }
    return filterBank;
  }, []);

  const draw = useCallback(() => {
    // Waveform
    const waveCanvas = waveformCanvasRef.current;
    const waveData = getWaveformDataRef.current();
    if (waveCanvas && waveData) {
      const ctx = waveCanvas.getContext('2d')!;
      const width = waveCanvas.width;
      const height = waveCanvas.height;

      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, width, height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#4F46E5';
      ctx.beginPath();

      const sliceWidth = width / waveData.length;
      let x = 0;

      for (let i = 0; i < waveData.length; i++) {
        const v = waveData[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.stroke();
    }

    // FFT
    const fftCanvas = fftCanvasRef.current;
    const fftData = getFrequencyDataRef.current();
    if (fftCanvas && fftData) {
      const ctx = fftCanvas.getContext('2d')!;
      const width = fftCanvas.width;
      const height = fftCanvas.height;

      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, width, height);

      const barWidth = (width / fftData.length) * 2.5;
      let x = 0;

      for (let i = 0; i < fftData.length; i++) {
        const barHeight = (fftData[i] / 255) * height;

        const hue = (i / fftData.length) * 180 + 200;
        ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
        if (x > width) break;
      }

      // Mel-Spectrogram 그리기
      if (showMelSpectrogram && fftData) {
        // FFT를 Mel로 변환
        const melValues = melFilterBank.map(filter => {
          let sum = 0;
          for (let i = 0; i < Math.min(filter.length, fftData.length); i++) {
            sum += filter[i] * fftData[i];
          }
          return Math.log10(sum + 1) * 50; // 로그 스케일
        });

        // 히스토리에 추가
        melHistoryRef.current.push(melValues);
        if (melHistoryRef.current.length > 100) {
          melHistoryRef.current.shift();
        }

        // Mel-Spectrogram 캔버스에 그리기
        const melCanvas = melCanvasRef.current;
        if (melCanvas) {
          const melCtx = melCanvas.getContext('2d')!;
          const melWidth = melCanvas.width;
          const melHeight = melCanvas.height;

          melCtx.fillStyle = '#111827';
          melCtx.fillRect(0, 0, melWidth, melHeight);

          const history = melHistoryRef.current;
          const cellWidth = melWidth / 100;
          const cellHeight = melHeight / 40;

          for (let t = 0; t < history.length; t++) {
            for (let m = 0; m < history[t].length; m++) {
              const value = Math.min(255, history[t][m] * 2);
              const hue = 240 - (value / 255) * 240;
              melCtx.fillStyle = `hsl(${hue}, 80%, ${20 + value / 5}%)`;
              melCtx.fillRect(t * cellWidth, melHeight - (m + 1) * cellHeight, cellWidth, cellHeight);
            }
          }
        }
      }
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [melFilterBank, showMelSpectrogram]);

  useEffect(() => {
    if (isRecording) {
      melHistoryRef.current = [];
      draw();
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRecording, draw]);

  const handleToggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      try {
        await startRecording();
      } catch (e) {
        console.error(e);
      }
    }
  };

  // 샘플링 레이트별 설명
  const sampleRateInfo: Record<number, { label: string; description: string; quality: string }> = {
    8000: { label: '8 kHz', description: '전화 통화', quality: '최저 (목소리만 알아들을 정도)' },
    16000: { label: '16 kHz', description: 'STT 표준', quality: '음성 인식에 충분' },
    22050: { label: '22 kHz', description: 'AM 라디오', quality: '중간 품질' },
    44100: { label: '44.1 kHz', description: 'CD 음질', quality: '고품질 음악' },
  };

  // 데모 녹음 시작
  const startDemoRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        setRecordedAudio(audioBuffer);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setDemoRecording(true);
    } catch (err) {
      console.error('녹음 시작 실패:', err);
    }
  };

  // 데모 녹음 중지
  const stopDemoRecording = () => {
    if (mediaRecorderRef.current && demoRecording) {
      mediaRecorderRef.current.stop();
      setDemoRecording(false);
    }
  };

  // 다운샘플링 재생
  const playDownsampled = async (targetSampleRate: number) => {
    if (!recordedAudio || isPlayingDemo) return;
    setIsPlayingDemo(true);

    try {
      const originalSampleRate = recordedAudio.sampleRate;
      const originalData = recordedAudio.getChannelData(0);

      // 다운샘플링 비율 계산
      const ratio = originalSampleRate / targetSampleRate;
      const newLength = Math.floor(originalData.length / ratio);

      // 새 AudioContext 생성 (원래 샘플레이트로)
      const audioContext = new AudioContext();
      const newBuffer = audioContext.createBuffer(1, newLength, originalSampleRate);
      const newData = newBuffer.getChannelData(0);

      // 간단한 다운샘플링 (평균값 사용)
      for (let i = 0; i < newLength; i++) {
        const startIdx = Math.floor(i * ratio);
        const endIdx = Math.min(Math.floor((i + 1) * ratio), originalData.length);
        let sum = 0;
        for (let j = startIdx; j < endIdx; j++) {
          sum += originalData[j];
        }
        newData[i] = sum / (endIdx - startIdx);
      }

      // 업샘플링 (다시 원래 길이로 - 품질 저하 시뮬레이션)
      const playBuffer = audioContext.createBuffer(1, originalData.length, originalSampleRate);
      const playData = playBuffer.getChannelData(0);

      for (let i = 0; i < originalData.length; i++) {
        const srcIdx = Math.floor(i / ratio);
        playData[i] = newData[Math.min(srcIdx, newLength - 1)];
      }

      // 재생
      const source = audioContext.createBufferSource();
      source.buffer = playBuffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        setIsPlayingDemo(false);
        audioContext.close();
      };
      source.start();
    } catch (err) {
      console.error('재생 실패:', err);
      setIsPlayingDemo(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Waves className="w-6 h-6 text-primary" />
        Wave Lab - 소리의 기초
      </h2>

      {!isSupported && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span>이 브라우저는 Web Audio API를 지원하지 않습니다.</span>
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 파형 시각화 카드 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4">실시간 파형</h3>
          <div className="bg-gray-900 rounded h-40 flex items-center justify-center overflow-hidden">
            {isRecording ? (
              <canvas
                ref={waveformCanvasRef}
                width={400}
                height={160}
                className="w-full h-full"
                data-testid="waveform-canvas"
              />
            ) : (
              <p className="text-gray-500">녹음 버튼을 눌러주세요</p>
            )}
          </div>
          <button
            onClick={handleToggleRecording}
            disabled={!isSupported}
            data-testid="wave-record-btn"
            className={`mt-4 w-full py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2
              ${isRecording
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-primary hover:bg-primary/80 text-white'
              }
              ${!isSupported && 'opacity-50 cursor-not-allowed'}
            `}
          >
            {isRecording ? (
              <>
                <Square className="w-4 h-4" /> 녹음 중지
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" /> 녹음 시작
              </>
            )}
          </button>
        </div>

        {/* FFT 분석 카드 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4">주파수 분석 (FFT)</h3>
          <div className="bg-gray-900 rounded h-40 flex items-center justify-center overflow-hidden">
            {isRecording ? (
              <canvas
                ref={fftCanvasRef}
                width={400}
                height={160}
                className="w-full h-full"
                data-testid="fft-canvas"
              />
            ) : (
              <p className="text-gray-500">녹음하면 주파수가 표시됩니다</p>
            )}
          </div>
        </div>
      </div>

      {/* 샘플링 레이트 비교 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="font-medium mb-4 flex items-center gap-2">
          <Gauge className="w-5 h-5" />
          샘플링 레이트 비교 (나이퀴스트 정리)
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          샘플링 레이트는 1초에 몇 번 소리를 측정하는지 나타냅니다.
          나이퀴스트 정리에 따르면, 원본 주파수를 복원하려면 <span className="text-primary">최소 2배 이상</span>의 샘플링이 필요합니다.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {Object.entries(sampleRateInfo).map(([rate, info]) => (
            <button
              key={rate}
              onClick={() => setSelectedSampleRate(parseInt(rate))}
              data-testid={`sample-rate-${rate}`}
              className={`p-3 rounded-lg text-left transition-all ${
                selectedSampleRate === parseInt(rate)
                  ? 'bg-primary text-white ring-2 ring-primary'
                  : 'bg-gray-900 hover:bg-gray-700'
              }`}
            >
              <div className="font-bold text-lg">{info.label}</div>
              <div className="text-xs opacity-80">{info.description}</div>
            </button>
          ))}
        </div>

        <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400">선택된 샘플링 레이트:</span>
            <span className="text-primary font-bold">{sampleRateInfo[selectedSampleRate]?.label}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400">재현 가능 최대 주파수:</span>
            <span className="text-secondary font-bold">{(selectedSampleRate / 2).toLocaleString()} Hz</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400">품질:</span>
            <span>{sampleRateInfo[selectedSampleRate]?.quality}</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-700 text-sm text-gray-400">
            <p>
              인간 가청 범위: 20 ~ 20,000 Hz<br/>
              인간 목소리 핵심 주파수: 300 ~ 3,400 Hz
            </p>
            {selectedSampleRate === 16000 && (
              <p className="mt-2 text-primary">
                STT에서 16kHz를 사용하는 이유: 음성 인식에 충분하면서 데이터 크기가 작음!
              </p>
            )}
          </div>
        </div>

        {/* 다운샘플링 체험 */}
        <div className="mt-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Volume1 className="w-4 h-4" />
            샘플링 레이트 품질 체험
          </h4>
          <p className="text-xs text-gray-400 mb-3">
            녹음 후 각 샘플링 레이트로 다운샘플링된 품질을 직접 비교해보세요.
          </p>

          <div className="flex gap-2 mb-3">
            {!demoRecording ? (
              <button
                onClick={startDemoRecording}
                data-testid="demo-record-btn"
                className="flex-1 bg-primary hover:bg-primary/80 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Mic className="w-4 h-4" />
                {recordedAudio ? '다시 녹음' : '녹음하기'}
              </button>
            ) : (
              <button
                onClick={stopDemoRecording}
                data-testid="demo-stop-btn"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 animate-pulse"
              >
                <Square className="w-4 h-4" />
                녹음 중지
              </button>
            )}
          </div>

          {recordedAudio && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 mb-2">
                녹음 완료! ({(recordedAudio.duration).toFixed(1)}초) - 각 버튼을 눌러 품질 차이를 비교하세요:
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[8000, 16000, 22050, 44100].map(rate => (
                  <button
                    key={rate}
                    onClick={() => playDownsampled(rate)}
                    disabled={isPlayingDemo}
                    data-testid={`play-${rate}`}
                    className={`py-2 px-3 rounded text-sm transition-all ${
                      isPlayingDemo
                        ? 'bg-gray-700 opacity-50'
                        : rate === 44100
                          ? 'bg-green-600 hover:bg-green-700'
                          : rate === 16000
                            ? 'bg-blue-600 hover:bg-blue-700'
                            : rate === 8000
                              ? 'bg-red-600 hover:bg-red-700'
                              : 'bg-yellow-600 hover:bg-yellow-700'
                    }`}
                  >
                    {isPlayingDemo ? '재생중...' : `${rate / 1000}kHz`}
                  </button>
                ))}
              </div>
              <div className="text-xs text-gray-500 mt-2">
                <span className="text-red-400">8kHz</span>: 뭉개짐 /
                <span className="text-blue-400 ml-2">16kHz</span>: 음성 인식용 /
                <span className="text-yellow-400 ml-2">22kHz</span>: 중간 /
                <span className="text-green-400 ml-2">44kHz</span>: CD 품질
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mel-Spectrogram */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium flex items-center gap-2">
            Mel-Spectrogram (AI 입력 형식)
          </h3>
          <button
            onClick={() => setShowMelSpectrogram(!showMelSpectrogram)}
            data-testid="mel-toggle-btn"
            className={`px-3 py-1 rounded text-sm ${
              showMelSpectrogram ? 'bg-primary' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {showMelSpectrogram ? '활성화됨' : '비활성화'}
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Mel-Spectrogram은 인간 청각 특성을 반영한 주파수 분석입니다.
          <span className="text-primary"> 저주파에서는 세밀하게, 고주파에서는 뭉뚱그려</span> 분석합니다.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500 mb-2">일반 Spectrogram (선형 주파수)</div>
            <div className="bg-gray-900 rounded h-32 flex items-center justify-center">
              {isRecording && showMelSpectrogram ? (
                <canvas
                  ref={fftCanvasRef}
                  width={300}
                  height={128}
                  className="w-full h-full"
                />
              ) : (
                <p className="text-gray-500 text-sm">녹음 + Mel 활성화 필요</p>
              )}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-2">Mel-Spectrogram (40 Mel bins)</div>
            <div className="bg-gray-900 rounded h-32 flex items-center justify-center overflow-hidden">
              {isRecording && showMelSpectrogram ? (
                <canvas
                  ref={melCanvasRef}
                  width={300}
                  height={128}
                  className="w-full h-full"
                  data-testid="mel-canvas"
                />
              ) : (
                <p className="text-gray-500 text-sm">녹음 + Mel 활성화 필요</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-gray-900 rounded text-sm">
          <div className="grid grid-cols-2 gap-4 text-gray-400">
            <div>
              <span className="font-medium">일반 Spectrogram</span>
              <ul className="mt-1 space-y-1 text-xs">
                <li>• 차원: ~1000개</li>
                <li>• 선형 주파수</li>
                <li>• 노이즈에 민감</li>
              </ul>
            </div>
            <div>
              <span className="font-medium text-primary">Mel-Spectrogram</span>
              <ul className="mt-1 space-y-1 text-xs">
                <li>• 차원: 40~128개 (효율적)</li>
                <li>• 청각 특성 반영</li>
                <li>• STT/TTS의 표준 입력</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// STT Lab - 음성 인식 & CTC 시뮬레이터
// ============================================
// Beam Search 시뮬레이션 데이터
interface BeamNode {
  token: string;
  prob: number;
  cumProb: number;
  children?: BeamNode[];
}

const BEAM_SEARCH_DEMO: BeamNode = {
  token: '<start>',
  prob: 1.0,
  cumProb: 1.0,
  children: [
    {
      token: '안',
      prob: 0.7,
      cumProb: 0.7,
      children: [
        { token: '녕', prob: 0.9, cumProb: 0.63, children: [
          { token: '하', prob: 0.95, cumProb: 0.60 },
          { token: '!', prob: 0.05, cumProb: 0.03 }
        ]},
        { token: '전', prob: 0.1, cumProb: 0.07, children: [
          { token: '히', prob: 0.8, cumProb: 0.056 }
        ]}
      ]
    },
    {
      token: '오',
      prob: 0.2,
      cumProb: 0.2,
      children: [
        { token: '늘', prob: 0.6, cumProb: 0.12, children: [
          { token: '은', prob: 0.7, cumProb: 0.084 }
        ]},
        { token: '전', prob: 0.3, cumProb: 0.06 }
      ]
    },
    {
      token: '반',
      prob: 0.1,
      cumProb: 0.1,
      children: [
        { token: '갑', prob: 0.8, cumProb: 0.08, children: [
          { token: '습', prob: 0.9, cumProb: 0.072 }
        ]}
      ]
    }
  ]
};

function STTLab() {
  const { isListening, isSupported, error, results, interimResult, startListening, stopListening, clearResults } = useSpeechRecognition();
  const [ctcInput, setCtcInput] = useState('');
  const [ctcSteps, setCtcSteps] = useState<ReturnType<typeof ctcDecodeWithSteps>>([]);
  const [selectedAttention, setSelectedAttention] = useState(ATTENTION_EXAMPLES[0]);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

  // Beam Search 시뮬레이터 상태
  const [beamWidth, setBeamWidth] = useState(3);
  const [currentStep, setCurrentStep] = useState(0);
  const [searchMode, setSearchMode] = useState<'greedy' | 'beam'>('beam');

  const handleCTCDecode = () => {
    if (!ctcInput.trim()) return;
    const parsed = parseCTCInput(ctcInput);
    const steps = ctcDecodeWithSteps(parsed);
    setCtcSteps(steps);
  };

  const handleGenerateRandom = () => {
    const words = ['HELLO', 'WORLD', 'TEST', 'SPEECH'];
    const word = words[Math.floor(Math.random() * words.length)];
    const ctc = generateRandomCTC(word);
    setCtcInput(ctc.join('-'));
  };

  // 신뢰도에 따른 색상 반환
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-400';
    if (confidence >= 0.7) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getConfidenceBar = (confidence: number) => {
    const filled = Math.round(confidence * 5);
    return '█'.repeat(filled) + '░'.repeat(5 - filled);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Mic className="w-6 h-6 text-primary" />
        STT Lab - 음성을 텍스트로
      </h2>

      {!isSupported && (
        <div className="bg-yellow-900/50 border border-yellow-700 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-yellow-400" />
          <span>이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.</span>
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 음성 인식 카드 (신뢰도 표시 포함) */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4">실시간 음성 인식 (신뢰도 표시)</h3>
          <div className="bg-gray-900 rounded p-4 min-h-32" data-testid="stt-result">
            {results.length > 0 || interimResult ? (
              <div className="space-y-3">
                {results.map((r, i) => (
                  <div key={i} className="space-y-1">
                    <span className={`${getConfidenceColor(r.confidence)}`}>
                      {r.transcript}
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">신뢰도:</span>
                      <span className={`font-mono ${getConfidenceColor(r.confidence)}`}>
                        {getConfidenceBar(r.confidence)}
                      </span>
                      <span className={getConfidenceColor(r.confidence)}>
                        {(r.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
                {interimResult && (
                  <span className="text-gray-400 italic">{interimResult}</span>
                )}
              </div>
            ) : (
              <p className="text-gray-500">인식된 텍스트가 여기에 표시됩니다...</p>
            )}
          </div>
          <div className="mt-3 text-xs text-gray-500">
            <span className="text-green-400">███</span> 높은 신뢰도 (90%+)
            <span className="ml-3 text-yellow-400">███</span> 중간 (70-90%)
            <span className="ml-3 text-red-400">███</span> 낮은 신뢰도 (&lt;70%)
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={!isSupported}
              data-testid="stt-toggle-btn"
              className={`flex-1 py-2 px-4 rounded-lg transition-colors
                ${isListening
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-primary hover:bg-primary/80'
                }
                ${!isSupported && 'opacity-50 cursor-not-allowed'}
              `}
            >
              {isListening ? '정지' : '인식 시작'}
            </button>
            <button
              onClick={clearResults}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors"
            >
              초기화
            </button>
          </div>
        </div>

        {/* CTC 시뮬레이터 카드 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4">CTC 디코딩 시뮬레이터</h3>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={ctcInput}
              onChange={(e) => setCtcInput(e.target.value)}
              placeholder="예: ε-H-H-ε-E-ε-L-L-O"
              data-testid="ctc-input"
              className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
            />
            <button
              onClick={handleGenerateRandom}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm"
            >
              랜덤
            </button>
          </div>
          <button
            onClick={handleCTCDecode}
            data-testid="ctc-decode-btn"
            className="w-full bg-secondary hover:bg-secondary/80 text-white py-2 px-4 rounded-lg transition-colors"
          >
            디코딩 실행
          </button>
          <div className="mt-4 space-y-3" data-testid="ctc-result">
            {ctcSteps.length > 0 ? (
              ctcSteps.map((step) => (
                <div key={step.step} className="p-3 bg-gray-900 rounded">
                  <div className="text-sm text-gray-400 mb-1">
                    Step {step.step}: {step.title}
                  </div>
                  <div className="font-mono text-lg">
                    {step.sequence.join(' ')}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{step.description}</div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm p-4">결과가 여기에 표시됩니다</p>
            )}
          </div>
        </div>
      </div>

      {/* CTC vs Attention 비교 시각화 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="font-medium mb-4">CTC vs Attention 비교 시뮬레이터</h3>
        <p className="text-sm text-gray-400 mb-4">
          같은 음성 입력에 대해 <span className="text-primary">CTC</span>와 <span className="text-secondary">Attention</span>이
          어떻게 다르게 동작하는지 비교합니다. 예시를 선택하여 차이점을 확인하세요.
        </p>

        <div className="flex gap-2 mb-4 flex-wrap">
          {ATTENTION_EXAMPLES.map(ex => (
            <button
              key={ex.id}
              onClick={() => setSelectedAttention(ex)}
              data-testid={`attention-${ex.id}`}
              className={`px-3 py-2 rounded text-sm ${
                selectedAttention.id === ex.id
                  ? 'bg-primary text-white'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {ex.text}
            </button>
          ))}
        </div>

        {/* 병렬 비교 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* CTC 출력 시각화 */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-1 bg-primary/20 text-primary text-xs font-bold rounded">CTC</span>
              <span className="text-sm text-gray-400">프레임별 독립 예측</span>
            </div>

            {/* 프레임 번호 */}
            <div className="flex gap-1 mb-2">
              <div className="w-16 text-xs text-gray-500">프레임</div>
              {selectedAttention.ctcOutput.map((_, idx) => (
                <div key={idx} className="w-8 text-center text-xs text-gray-500">
                  {idx + 1}
                </div>
              ))}
            </div>

            {/* CTC 출력 */}
            <div className="flex gap-1 mb-3">
              <div className="w-16 text-xs text-gray-400">출력</div>
              {selectedAttention.ctcOutput.map((char, idx) => (
                <div
                  key={idx}
                  className={`w-8 h-8 flex items-center justify-center rounded text-sm font-medium ${
                    char === 'ε'
                      ? 'bg-gray-700 text-gray-500'
                      : 'bg-primary/30 text-primary border border-primary/50'
                  }`}
                  title={char === 'ε' ? 'blank (무음)' : char}
                >
                  {char}
                </div>
              ))}
            </div>

            {/* 디코딩 과정 */}
            <div className="border-t border-gray-700 pt-3 mt-3">
              <div className="text-xs text-gray-500 mb-2">→ 중복 제거 + blank 제거</div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">결과:</span>
                <span className={`font-bold ${
                  selectedAttention.ctcDecoded === selectedAttention.text
                    ? 'text-green-400'
                    : 'text-red-400'
                }`}>
                  {selectedAttention.ctcDecoded}
                </span>
                {selectedAttention.ctcDecoded !== selectedAttention.text && (
                  <span className="text-xs text-red-400">(오류!)</span>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-500 mt-3 p-2 bg-gray-800 rounded">
              💡 CTC는 각 프레임을 <strong className="text-white">독립적으로</strong> 예측하고,
              나중에 blank(ε)와 중복을 제거합니다. 출력 길이 ≤ 입력 길이
            </div>
          </div>

          {/* Attention 히트맵 */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-1 bg-secondary/20 text-secondary text-xs font-bold rounded">Attention</span>
              <span className="text-sm text-gray-400">문맥 기반 가중치</span>
            </div>

            <div className="overflow-x-auto">
              <table className="border-collapse" data-testid="attention-heatmap">
                <thead>
                  <tr>
                    <td className="w-8 text-xs text-gray-500">출력↓</td>
                    {Array.from({ length: selectedAttention.frames }, (_, i) => (
                      <td key={i} className="text-xs text-gray-500 text-center px-1 w-6">
                        {i + 1}
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedAttention.matrix.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      <td className="text-sm text-secondary pr-2 font-medium">{selectedAttention.chars[rowIdx]}</td>
                      {row.map((value, colIdx) => {
                        const isHovered = hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx;
                        const bgColor = `rgba(6, 182, 212, ${value})`; // cyan for attention
                        return (
                          <td
                            key={colIdx}
                            onMouseEnter={() => setHoveredCell({ row: rowIdx, col: colIdx })}
                            onMouseLeave={() => setHoveredCell(null)}
                            className={`w-6 h-6 border border-gray-700 cursor-pointer transition-all ${
                              isHovered ? 'ring-2 ring-white' : ''
                            }`}
                            style={{ backgroundColor: bgColor }}
                            title={`${selectedAttention.chars[rowIdx]} ← Frame ${colIdx + 1}: ${(value * 100).toFixed(0)}%`}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hoveredCell && (
              <div className="mt-2 text-sm text-gray-400">
                "{selectedAttention.chars[hoveredCell.row]}" 생성 시 프레임 {hoveredCell.col + 1}에
                <span className="text-secondary font-bold ml-1">
                  {(selectedAttention.matrix[hoveredCell.row][hoveredCell.col] * 100).toFixed(0)}% 집중
                </span>
              </div>
            )}

            <div className="border-t border-gray-700 pt-3 mt-3">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">결과:</span>
                <span className="font-bold text-green-400">{selectedAttention.text}</span>
              </div>
            </div>

            <div className="text-xs text-gray-500 mt-3 p-2 bg-gray-800 rounded">
              💡 Attention은 출력 생성 시 <strong className="text-white">모든 입력</strong>을 참조하여
              가중치를 부여합니다. 출력 길이 자유
            </div>
          </div>
        </div>

        {/* 핵심 차이점 요약 */}
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="font-medium mb-3 text-sm">핵심 차이점 비교</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-2">
              <div className="text-gray-400 font-medium">예측 방식</div>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-primary/20 text-primary rounded">CTC</span>
                <span>각 프레임 독립 예측</span>
              </div>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-secondary/20 text-secondary rounded">Att</span>
                <span>전체 문맥 참조하여 예측</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-gray-400 font-medium">출력 길이 제약</div>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-primary/20 text-primary rounded">CTC</span>
                <span>출력 ≤ 입력 (필수)</span>
              </div>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-secondary/20 text-secondary rounded">Att</span>
                <span>출력 길이 자유</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-gray-400 font-medium">적합한 상황</div>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-primary/20 text-primary rounded">CTC</span>
                <span>실시간, 스트리밍 STT</span>
              </div>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-secondary/20 text-secondary rounded">Att</span>
                <span>긴 문장, 번역</span>
              </div>
            </div>
          </div>

          {selectedAttention.id === 'repeat' && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-700/50 rounded text-sm">
              ⚠️ <strong>나쁜 예시 분석:</strong> Attention이 분산되면 CTC도 혼란스러워집니다.
              이 경우 CTC는 "나"를 두 번 예측하여 "{selectedAttention.ctcDecoded}"가 되었습니다.
              정답은 "{selectedAttention.text}"입니다.
            </div>
          )}
        </div>
      </div>

      {/* Beam Search vs Greedy Search 시각화 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="font-medium mb-4">Beam Search vs Greedy Search 시각화</h3>
        <p className="text-sm text-gray-400 mb-4">
          디코딩 전략에 따라 최종 결과가 달라집니다.
          <span className="text-primary"> Greedy</span>는 매 단계 최고 확률만 선택하고,
          <span className="text-secondary"> Beam Search</span>는 여러 후보를 유지합니다.
        </p>

        <div className="flex gap-4 mb-4">
          {/* 모드 선택 */}
          <div className="flex gap-2">
            <button
              onClick={() => { setSearchMode('greedy'); setCurrentStep(0); }}
              data-testid="search-greedy"
              className={`px-4 py-2 rounded-lg transition-all ${
                searchMode === 'greedy' ? 'bg-primary text-white' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              Greedy Search
            </button>
            <button
              onClick={() => { setSearchMode('beam'); setCurrentStep(0); }}
              data-testid="search-beam"
              className={`px-4 py-2 rounded-lg transition-all ${
                searchMode === 'beam' ? 'bg-secondary text-white' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              Beam Search
            </button>
          </div>

          {/* Beam Width 선택 (Beam Search만) */}
          {searchMode === 'beam' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Beam Width:</span>
              {[1, 2, 3, 5].map(w => (
                <button
                  key={w}
                  onClick={() => setBeamWidth(w)}
                  data-testid={`beam-width-${w}`}
                  className={`w-8 h-8 rounded ${
                    beamWidth === w ? 'bg-secondary text-white' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 단계 컨트롤 */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
          >
            ← 이전
          </button>
          <span className="text-gray-400">Step {currentStep + 1} / 3</span>
          <button
            onClick={() => setCurrentStep(Math.min(2, currentStep + 1))}
            disabled={currentStep === 2}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
          >
            다음 →
          </button>
          <button
            onClick={() => setCurrentStep(0)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            처음으로
          </button>
        </div>

        {/* 트리 시각화 */}
        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Step 0: 시작 */}
            <div className="flex justify-center mb-4">
              <div className="bg-gray-700 px-4 py-2 rounded-lg text-center">
                <div className="text-sm text-gray-400">&lt;start&gt;</div>
                <div className="text-xs text-green-400">100%</div>
              </div>
            </div>

            {/* Step 1: 첫 번째 토큰 */}
            {currentStep >= 0 && (
              <div className="flex justify-center gap-4 mb-4">
                {BEAM_SEARCH_DEMO.children?.slice(0, searchMode === 'greedy' ? 1 : beamWidth).map((child, idx) => (
                  <div key={idx} className="text-center">
                    <div className="text-gray-600 text-xs mb-1">↓</div>
                    <div className={`px-4 py-2 rounded-lg ${
                      idx === 0 ? 'bg-primary/30 border-2 border-primary' : 'bg-gray-700'
                    }`}>
                      <div className="font-bold">{child.token}</div>
                      <div className="text-xs text-green-400">{(child.prob * 100).toFixed(0)}%</div>
                      <div className="text-xs text-gray-400">누적: {(child.cumProb * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                ))}
                {searchMode === 'greedy' && (
                  <div className="text-center opacity-30">
                    <div className="text-gray-600 text-xs mb-1">↓</div>
                    <div className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 border-dashed">
                      <div className="text-gray-500">다른 후보들</div>
                      <div className="text-xs text-gray-500">(무시됨)</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: 두 번째 토큰 */}
            {currentStep >= 1 && (
              <div className="flex justify-center gap-8 mb-4">
                {BEAM_SEARCH_DEMO.children?.slice(0, searchMode === 'greedy' ? 1 : beamWidth).map((parent, pIdx) => (
                  <div key={pIdx} className="flex gap-2">
                    {parent.children?.slice(0, searchMode === 'greedy' ? 1 : 2).map((child, cIdx) => (
                      <div key={cIdx} className="text-center">
                        <div className="text-gray-600 text-xs mb-1">↓</div>
                        <div className={`px-3 py-2 rounded-lg text-sm ${
                          pIdx === 0 && cIdx === 0 ? 'bg-primary/30 border-2 border-primary' : 'bg-gray-700'
                        }`}>
                          <div className="font-bold">{parent.token}{child.token}</div>
                          <div className="text-xs text-green-400">{(child.prob * 100).toFixed(0)}%</div>
                          <div className="text-xs text-gray-400">누적: {(child.cumProb * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Step 3: 세 번째 토큰 */}
            {currentStep >= 2 && (
              <div className="flex justify-center gap-8">
                {BEAM_SEARCH_DEMO.children?.slice(0, searchMode === 'greedy' ? 1 : beamWidth).map((parent, pIdx) => (
                  <div key={pIdx} className="flex gap-2">
                    {parent.children?.slice(0, searchMode === 'greedy' ? 1 : 2).map((child, cIdx) => (
                      child.children?.slice(0, 1).map((grandChild, gIdx) => (
                        <div key={gIdx} className="text-center">
                          <div className="text-gray-600 text-xs mb-1">↓</div>
                          <div className={`px-3 py-2 rounded-lg text-sm ${
                            pIdx === 0 && cIdx === 0 ? 'bg-green-600/30 border-2 border-green-500' : 'bg-gray-700'
                          }`}>
                            <div className="font-bold">{parent.token}{child.token}{grandChild.token}</div>
                            <div className="text-xs text-green-400">{(grandChild.prob * 100).toFixed(0)}%</div>
                            <div className="text-xs text-gray-400">누적: {(grandChild.cumProb * 100).toFixed(0)}%</div>
                          </div>
                        </div>
                      ))
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 결과 비교 */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`p-4 rounded-lg ${searchMode === 'greedy' ? 'bg-primary/20 border border-primary' : 'bg-gray-900'}`}>
            <div className="font-medium text-primary mb-2">Greedy Search 결과</div>
            <div className="text-lg">안 → 녕 → 하</div>
            <div className="text-sm text-gray-400 mt-1">
              누적 확률: 60% (0.7 × 0.9 × 0.95)
            </div>
            <div className="text-xs text-gray-500 mt-2">
              ✓ 빠름, 단순 / ✗ 최적 아닐 수 있음
            </div>
          </div>
          <div className={`p-4 rounded-lg ${searchMode === 'beam' ? 'bg-secondary/20 border border-secondary' : 'bg-gray-900'}`}>
            <div className="font-medium text-secondary mb-2">Beam Search 결과 (Width={beamWidth})</div>
            <div className="text-lg">
              {beamWidth >= 3 ? '안녕하 (60%), 오늘은 (8.4%), 반갑습 (7.2%)' :
               beamWidth >= 2 ? '안녕하 (60%), 오늘은 (8.4%)' : '안녕하 (60%)'}
            </div>
            <div className="text-sm text-gray-400 mt-1">
              상위 {beamWidth}개 후보 유지
            </div>
            <div className="text-xs text-gray-500 mt-2">
              ✓ 더 나은 결과 가능 / ✗ 계산량 증가
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-gray-900 rounded text-sm text-gray-400">
          <div className="font-medium mb-2 text-gray-300">💡 실무 팁</div>
          <ul className="space-y-1">
            <li>• <span className="text-primary">Greedy</span>: 실시간 처리, 리소스 제한 환경</li>
            <li>• <span className="text-secondary">Beam Search</span>: 정확도 중시, 오프라인 처리</li>
            <li>• 일반적으로 Beam Width 5~10 사용 (Width 증가 → 정확도↑, 속도↓)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ============================================
// TTS Lab - 음성 합성 & G2P
// ============================================
// Text Normalization 규칙
const TEXT_NORM_EXAMPLES = [
  { input: '2024년 12월 25일', output: '이천이십사년 십이월 이십오일', type: '날짜' },
  { input: '서울에서 부산까지 400km', output: '서울에서 부산까지 사백킬로미터', type: '거리' },
  { input: '오후 3시 30분', output: '오후 세시 삼십분', type: '시간' },
  { input: '₩50,000', output: '오만원', type: '금액' },
  { input: '02-1234-5678', output: '공이 일이삼사 오육칠팔', type: '전화번호' },
  { input: 'iPhone 15 Pro Max', output: '아이폰 십오 프로 맥스', type: '제품명' },
  { input: '3.14159', output: '삼점 일사일오구', type: '소수점' },
  { input: 'A/S 센터', output: '에이에스 센터', type: '약어' },
];

// 숫자 → 한글 변환 함수
const numberToKorean = (num: number): string => {
  const units = ['', '십', '백', '천'];
  const bigUnits = ['', '만', '억', '조'];
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

  if (num === 0) return '영';

  let result = '';
  let numStr = String(num);
  let unitIdx = 0;

  while (numStr.length > 0) {
    const chunk = numStr.slice(-4);
    numStr = numStr.slice(0, -4);

    let chunkResult = '';
    for (let i = 0; i < chunk.length; i++) {
      const digit = parseInt(chunk[chunk.length - 1 - i]);
      if (digit > 0) {
        const digitStr = (digit === 1 && i > 0) ? '' : digits[digit];
        chunkResult = digitStr + units[i] + chunkResult;
      }
    }
    if (chunkResult) {
      result = chunkResult + bigUnits[unitIdx] + result;
    }
    unitIdx++;
  }

  return result;
};

/**
 * 감정 프리셋 - 음성학 연구 기반
 *
 * 참고 연구:
 * - Scherer (2003): Vocal communication of emotion
 * - Juslin & Laukka (2003): Communication of emotions in vocal expression and music performance
 * - Banse & Scherer (1996): Acoustic profiles in vocal emotion expression
 * - Murray & Arnott (1993): Toward the simulation of emotion in synthetic speech
 *
 * 핵심 발견:
 * - 각성(Arousal) 높음: 빠른 속도, 높은 피치, 큰 음량 (기쁨, 분노, 두려움)
 * - 각성(Arousal) 낮음: 느린 속도, 낮은 피치, 작은 음량 (슬픔, 차분, 다정함)
 * - 긍정(Valence) 높음: 피치 상승, 부드러운 음질 (기쁨, 다정함)
 * - 긍정(Valence) 낮음: 피치 하강 또는 불규칙, 거친 음질 (슬픔, 분노)
 *
 * Web Speech API 한계:
 * - rate: 0.1 ~ 10 (실제로는 0.5 ~ 2 정도가 자연스러움)
 * - pitch: 0 ~ 2 (1이 기본)
 * - volume: 0 ~ 1
 * - 억양 변화(intonation contour), 음색(timbre), 휴지(pause), 강세 패턴은 조절 불가
 */
const PROSODY_PRESETS = [
  {
    id: 'neutral', name: '중립', emoji: '😐',
    rate: 1.0, pitch: 1.0, volume: 0.75,
    description: '기본 설정',
    research: '기준점 (baseline)'
  },
  {
    id: 'happy', name: '기쁨', emoji: '😊',
    // 연구: 기쁨은 빠른 속도(+20-30%), 높은 피치(+25-50%), 큰 음량, 넓은 피치 범위
    rate: 1.25, pitch: 1.35, volume: 0.9,
    description: '빠르고 밝게 (+25% 속도, +35% 피치)',
    research: 'Juslin: 기쁨은 빠른 템포, 높은 F0, 큰 강도'
  },
  {
    id: 'sad', name: '슬픔', emoji: '😢',
    // 연구: 슬픔은 매우 느린 속도(-40-60%), 낮은 피치(-15-25%), 매우 작은 음량, 좁은 피치 범위
    rate: 0.6, pitch: 0.75, volume: 0.4,
    description: '매우 느리고 낮게 (-40% 속도, -25% 피치)',
    research: 'Scherer: 슬픔은 느린 발화, 낮은 F0, 약한 강도'
  },
  {
    id: 'angry', name: '분노', emoji: '😠',
    // 연구: 분노는 빠른 속도(+10-20%), 높은 피치(+30-50%), 매우 큰 음량, 피치 변동 크고 급격
    // hot anger(격분)와 cold anger(냉정한 분노)가 다름 - 여기서는 hot anger
    rate: 1.15, pitch: 1.4, volume: 1.0,
    description: '빠르고 강하게 (+15% 속도, +40% 피치, 최대 음량)',
    research: 'Banse: 격분은 빠르고 큰 F0 변동, 높은 강도'
  },
  {
    id: 'fear', name: '두려움', emoji: '😰',
    // 연구: 두려움은 빠른 속도(+30-40%), 높은 피치(+40-60%), 중간 음량, 불규칙한 리듬
    rate: 1.35, pitch: 1.5, volume: 0.65,
    description: '빠르고 높게 (+35% 속도, +50% 피치)',
    research: 'Murray: 두려움은 빠른 속도, 높고 불안정한 피치'
  },
  {
    id: 'calm', name: '차분', emoji: '😌',
    // 연구: 차분/평온은 느린 속도(-15-25%), 약간 낮은 피치, 부드러운 음량
    rate: 0.8, pitch: 0.9, volume: 0.6,
    description: '느리고 부드럽게 (-20% 속도, -10% 피치)',
    research: '낮은 각성, 안정적인 피치 패턴'
  },
  {
    id: 'excited', name: '흥분', emoji: '🤩',
    // 연구: 흥분/열정은 매우 빠른 속도(+40-50%), 매우 높은 피치(+50-70%), 큰 음량
    rate: 1.45, pitch: 1.6, volume: 0.95,
    description: '매우 빠르고 높게 (+45% 속도, +60% 피치)',
    research: '높은 각성 + 긍정 감정, 극대화된 파라미터'
  },
  {
    id: 'tender', name: '다정함', emoji: '🥰',
    // 연구: 다정함/애정은 느린 속도(-20-30%), 낮은 피치(-10-20%), 작은 음량, 부드러운 톤
    rate: 0.7, pitch: 0.85, volume: 0.45,
    description: '느리고 나지막하게 (-30% 속도, -15% 피치)',
    research: 'Juslin: 다정함은 느린 템포, 낮은 F0, 부드러운 톤'
  },
];

function TTSLab() {
  const { isSpeaking, voices, selectedVoice, rate, pitch, volume, error, speak, stop, setVoice, setRate, setPitch, setVolume, koreanVoices } = useSpeechSynthesis();
  const [ttsText, setTtsText] = useState('');
  const [g2pInput, setG2pInput] = useState('');
  const [g2pResult, setG2pResult] = useState<{ result: string; matched: typeof G2P_EXAMPLES } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<G2PCategory | 'all'>('all');
  const [selectedVocoder, setSelectedVocoder] = useState(VOCODER_SAMPLES[2]); // HiFi-GAN default
  const [isPlayingVocoder, setIsPlayingVocoder] = useState(false);

  // Text Normalization 상태
  const [normInput, setNormInput] = useState('');
  const [normResult, setNormResult] = useState('');

  // Prosody 프리셋 상태
  const [selectedProsody, setSelectedProsody] = useState(PROSODY_PRESETS[0]);

  // TTS 파이프라인 데모 상태
  const [pipelineInput, setPipelineInput] = useState('2024년 12월 25일');
  const [pipelineStep, setPipelineStep] = useState(-1); // -1: 대기, 0~5: 각 단계
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineResults, setPipelineResults] = useState<{
    original: string;
    normalized: string;
    g2p: string;
    acoustic: string;
    vocoder: string;
  } | null>(null);

  const handleSpeak = () => {
    if (ttsText.trim()) {
      speak(ttsText);
    }
  };

  // Text Normalization 변환
  const handleNormalize = () => {
    if (!normInput.trim()) return;

    let result = normInput;

    // 연도 변환 (2024년 → 이천이십사년)
    result = result.replace(/(\d{4})년/g, (_, year) => numberToKorean(parseInt(year)) + '년');

    // 월/일 변환 (12월 → 십이월, 25일 → 이십오일)
    result = result.replace(/(\d{1,2})월/g, (_, month) => numberToKorean(parseInt(month)) + '월');
    result = result.replace(/(\d{1,2})일/g, (_, day) => numberToKorean(parseInt(day)) + '일');

    // 시간 변환 (3시 → 세시, 30분 → 삼십분)
    result = result.replace(/(\d{1,2})시/g, (_, hour) => numberToKorean(parseInt(hour)) + '시');
    result = result.replace(/(\d{1,2})분/g, (_, min) => numberToKorean(parseInt(min)) + '분');

    // 금액 변환 (₩50,000 → 오만원)
    result = result.replace(/₩?([\d,]+)원?/g, (_, amount) => {
      const num = parseInt(amount.replace(/,/g, ''));
      return numberToKorean(num) + '원';
    });

    // km 변환
    result = result.replace(/(\d+)km/gi, (_, num) => numberToKorean(parseInt(num)) + '킬로미터');

    // 일반 숫자 변환 (남은 숫자들)
    result = result.replace(/\b(\d+)\b/g, (_, num) => numberToKorean(parseInt(num)));

    setNormResult(result);
  };

  // Prosody 프리셋 적용
  const applyProsodyPreset = (preset: typeof PROSODY_PRESETS[0]) => {
    setSelectedProsody(preset);
    setRate(preset.rate);
    setPitch(preset.pitch);
    setVolume(preset.volume);
  };

  // TTS 파이프라인 실행
  const runPipeline = async () => {
    if (pipelineRunning || !pipelineInput.trim()) return;
    setPipelineRunning(true);
    setPipelineStep(0);
    setPipelineResults(null);

    const original = pipelineInput;

    // Step 0: 원문 표시
    await new Promise(resolve => setTimeout(resolve, 800));

    // Step 1: Text Normalization
    setPipelineStep(1);
    let normalized = original;
    normalized = normalized.replace(/(\d{4})년/g, (_, year) => numberToKorean(parseInt(year)) + '년');
    normalized = normalized.replace(/(\d{1,2})월/g, (_, month) => numberToKorean(parseInt(month)) + '월');
    normalized = normalized.replace(/(\d{1,2})일/g, (_, day) => numberToKorean(parseInt(day)) + '일');
    normalized = normalized.replace(/(\d{1,2})시/g, (_, hour) => numberToKorean(parseInt(hour)) + '시');
    normalized = normalized.replace(/\b(\d+)\b/g, (_, num) => numberToKorean(parseInt(num)));
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: G2P
    setPipelineStep(2);
    const g2pResult = simpleG2P(normalized);
    const g2p = g2pResult.result;
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 3: Acoustic Model
    setPipelineStep(3);
    const acoustic = '📊 Mel-Spectrogram 생성됨 (80 mel bins × ' + Math.floor(g2p.length * 15) + ' frames)';
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 4: Vocoder
    setPipelineStep(4);
    const vocoder = '🔊 HiFi-GAN으로 파형 생성 (' + (g2p.length * 0.1).toFixed(1) + '초)';
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 5: 완료
    setPipelineStep(5);
    setPipelineResults({
      original,
      normalized,
      g2p,
      acoustic,
      vocoder
    });

    // TTS로 실제 읽기 (파이프라인 데모는 중립 설정으로 재생 - 감정 프리셋과 독립)
    speak(normalized, { rate: 1.0, pitch: 1.0, volume: 0.8 });

    setPipelineRunning(false);
  };

  // Vocoder 품질 시뮬레이션 재생
  const playVocoderDemo = async (vocoder: typeof VOCODER_SAMPLES[0]) => {
    if (isPlayingVocoder) return;
    setIsPlayingVocoder(true);

    try {
      const audioContext = new AudioContext();
      const duration = 1.5; // 1.5초
      const sampleRate = audioContext.sampleRate;
      const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
      const data = buffer.getChannelData(0);

      // 기본 주파수 (한국어 "아" 소리 시뮬레이션)
      const fundamentalFreq = 150; // Hz
      const harmonics = [1, 2, 3, 4, 5]; // 배음
      const harmonicAmps = [1, 0.5, 0.25, 0.125, 0.0625]; // 배음 진폭

      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;

        // 기본 파형 생성 (배음 포함)
        let sample = 0;
        for (let h = 0; h < harmonics.length; h++) {
          sample += harmonicAmps[h] * Math.sin(2 * Math.PI * fundamentalFreq * harmonics[h] * t);
        }

        // 진폭 엔벨로프 (부드러운 시작/끝)
        const envelope = Math.min(1, t * 10) * Math.min(1, (duration - t) * 10);
        sample *= envelope * 0.3;

        // Vocoder별 노이즈 추가
        sample += (Math.random() * 2 - 1) * vocoder.noiseLevel;

        // Vocoder별 왜곡 추가 (하드 클리핑 시뮬레이션)
        if (vocoder.distortion > 0) {
          sample = Math.tanh(sample * (1 + vocoder.distortion * 5)) / (1 + vocoder.distortion);
        }

        // Griffin-Lim 특유의 금속성 느낌 (고주파 노이즈)
        if (vocoder.id === 'griffin-lim') {
          sample += Math.sin(2 * Math.PI * 3000 * t) * 0.05 * Math.random();
        }

        data[i] = sample;
      }

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        setIsPlayingVocoder(false);
        audioContext.close();
      };
      source.start();
    } catch (err) {
      console.error('Vocoder 재생 실패:', err);
      setIsPlayingVocoder(false);
    }
  };

  const handleG2PConvert = () => {
    if (g2pInput.trim()) {
      const result = simpleG2P(g2pInput);
      setG2pResult(result);
    }
  };

  const filteredExamples = selectedCategory === 'all'
    ? G2P_EXAMPLES
    : G2P_EXAMPLES.filter(ex => ex.category === selectedCategory);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Volume2 className="w-6 h-6 text-primary" />
        TTS Lab - 텍스트를 음성으로
      </h2>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 음성 합성 카드 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4">음성 합성</h3>
          <textarea
            value={ttsText}
            onChange={(e) => setTtsText(e.target.value)}
            placeholder="읽을 텍스트를 입력하세요..."
            data-testid="tts-input"
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 h-24 resize-none mb-4 text-white"
          />

          {/* 음성 선택 */}
          <div className="mb-4">
            <label className="text-sm text-gray-400 block mb-1">음성</label>
            <select
              value={selectedVoice?.name || ''}
              onChange={(e) => {
                const voice = voices.find(v => v.name === e.target.value);
                if (voice) setVoice(voice);
              }}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
            >
              {koreanVoices.length > 0 && (
                <optgroup label="한국어">
                  {koreanVoices.map(v => (
                    <option key={v.name} value={v.name}>{v.name}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="기타">
                {voices.filter(v => !v.lang.includes('ko')).slice(0, 10).map(v => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Prosody 감정 프리셋 */}
          <div className="mb-4">
            <label className="text-sm text-gray-400 block mb-2">감정 프리셋 (음성학 연구 기반)</label>
            <div className="grid grid-cols-4 gap-2">
              {PROSODY_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyProsodyPreset(preset)}
                  data-testid={`prosody-${preset.id}`}
                  className={`p-2 rounded text-sm transition-all ${
                    selectedProsody.id === preset.id
                      ? 'bg-primary text-white ring-2 ring-primary'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <span className="text-lg">{preset.emoji}</span>
                  <div className="text-xs">{preset.name}</div>
                </button>
              ))}
            </div>

            {/* 현재 선택된 프리셋 상세 정보 */}
            <div className="mt-3 p-3 bg-gray-900 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{selectedProsody.emoji}</span>
                <div>
                  <div className="font-medium">{selectedProsody.name}</div>
                  <div className="text-xs text-gray-400">{selectedProsody.description}</div>
                </div>
              </div>

              {/* 파라미터 시각화 바 */}
              <div className="space-y-2 mt-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-gray-500">속도</span>
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${selectedProsody.rate >= 1 ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.min(100, (selectedProsody.rate / 2) * 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right">{selectedProsody.rate.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-gray-500">피치</span>
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${selectedProsody.pitch >= 1 ? 'bg-yellow-500' : 'bg-purple-500'}`}
                      style={{ width: `${Math.min(100, (selectedProsody.pitch / 2) * 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right">{selectedProsody.pitch.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-gray-500">음량</span>
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all"
                      style={{ width: `${selectedProsody.volume * 100}%` }}
                    />
                  </div>
                  <span className="w-12 text-right">{(selectedProsody.volume * 100).toFixed(0)}%</span>
                </div>
              </div>

              {/* 연구 근거 */}
              <div className="mt-3 pt-2 border-t border-gray-700 text-[10px] text-gray-500">
                📚 {selectedProsody.research}
              </div>
            </div>

            {/* API 한계 설명 */}
            <div className="mt-3 p-2 bg-amber-900/30 border border-amber-700/50 rounded text-xs text-amber-200">
              <strong>Web Speech API 한계:</strong> 속도, 음높이, 음량만 조절 가능합니다.
              실제 감정 표현에는 <span className="text-amber-100">억양 변화(intonation), 휴지(pause), 음색(timbre), 강세 패턴</span> 등이 필요하지만
              브라우저 API에서는 지원하지 않습니다.
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-sm text-gray-400">속도: {rate.toFixed(2)}</label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">음높이: {pitch.toFixed(2)}</label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">음량: {(volume * 100).toFixed(0)}%</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSpeak}
              disabled={isSpeaking}
              data-testid="tts-speak-btn"
              className="flex-1 bg-primary hover:bg-primary/80 text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSpeaking ? '재생 중...' : '읽기'}
            </button>
            {isSpeaking && (
              <button
                onClick={stop}
                className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors"
              >
                정지
              </button>
            )}
          </div>
        </div>

        {/* G2P 변환기 카드 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4">G2P 변환기 (문자 - 발음)</h3>
          <input
            type="text"
            value={g2pInput}
            onChange={(e) => setG2pInput(e.target.value)}
            placeholder="예: 같이, 학교, 국민"
            data-testid="g2p-input"
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 mb-4 text-white"
          />
          <button
            onClick={handleG2PConvert}
            data-testid="g2p-convert-btn"
            className="w-full bg-secondary hover:bg-secondary/80 text-white py-2 px-4 rounded-lg transition-colors"
          >
            변환하기
          </button>

          {g2pResult && (
            <div className="mt-4 p-4 bg-gray-900 rounded" data-testid="g2p-result">
              <div className="text-lg mb-2">
                <span className="text-gray-400">입력:</span> {g2pInput}
              </div>
              <div className="text-lg mb-2">
                <span className="text-gray-400">발음:</span>{' '}
                <span className="text-primary font-bold">{g2pResult.result}</span>
              </div>
              {g2pResult.matched.length > 0 && (
                <div className="text-sm text-gray-400 mt-2">
                  적용된 규칙: {g2pResult.matched.map(m => m.ruleKo).join(', ')}
                </div>
              )}
            </div>
          )}

          {/* G2P 예시 */}
          <div className="mt-4">
            <div className="flex gap-2 flex-wrap mb-2">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`text-xs px-2 py-1 rounded ${selectedCategory === 'all' ? 'bg-primary' : 'bg-gray-700'}`}
              >
                전체
              </button>
              {(Object.keys(CATEGORY_LABELS) as G2PCategory[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-xs px-2 py-1 rounded ${selectedCategory === cat ? 'bg-primary' : 'bg-gray-700'}`}
                >
                  {CATEGORY_LABELS[cat].emoji} {CATEGORY_LABELS[cat].ko}
                </button>
              ))}
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {filteredExamples.slice(0, 8).map(ex => (
                <button
                  key={ex.id}
                  onClick={() => setG2pInput(ex.input)}
                  className="w-full text-left text-sm p-2 bg-gray-900 rounded hover:bg-gray-700 transition-colors"
                >
                  <span className="text-white">{ex.input}</span>
                  <span className="text-gray-500 mx-2">→</span>
                  <span className="text-primary">{ex.output}</span>
                  <span className="text-gray-500 text-xs ml-2">({ex.ruleKo})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Prosody 4요소 체험 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="font-medium mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          Prosody 4요소 체험
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Prosody(운율)는 <span className="text-cyan-400">Pitch(음높이)</span>, <span className="text-green-400">Duration(길이)</span>,
          <span className="text-red-400">Energy(강도)</span>, <span className="text-purple-400">Pause(쉼)</span>의 4가지 요소로 구성됩니다.
          각 요소를 개별적으로 체험해보세요.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pitch 체험 */}
          <div className="bg-gray-900 rounded-lg p-4 border border-cyan-900/50">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🎵</span>
              <div>
                <h4 className="font-medium text-cyan-400">Pitch (음높이)</h4>
                <p className="text-xs text-gray-500">억양, 의문문/평서문 구분</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              같은 문장도 음높이 변화로 의미가 달라집니다. "밥 먹었어"를 질문과 대답으로 비교해보세요.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => speak("밥 먹었어?", { rate: 1.0, pitch: 1.3, volume: 0.8 })}
                data-testid="prosody-pitch-question"
                className="w-full py-2 px-3 bg-cyan-900/40 hover:bg-cyan-800/50 rounded text-sm transition-colors flex items-center gap-2"
              >
                <span className="text-cyan-400">↗</span> "밥 먹었어?" (질문 - 끝이 올라감)
              </button>
              <button
                onClick={() => speak("밥 먹었어.", { rate: 1.0, pitch: 0.8, volume: 0.8 })}
                data-testid="prosody-pitch-statement"
                className="w-full py-2 px-3 bg-cyan-900/40 hover:bg-cyan-800/50 rounded text-sm transition-colors flex items-center gap-2"
              >
                <span className="text-cyan-400">↘</span> "밥 먹었어." (대답 - 끝이 내려감)
              </button>
            </div>
            <div className="mt-3 p-2 bg-gray-800 rounded text-xs text-gray-500">
              💡 Web Speech API에서는 전체 피치만 조절 가능. 실제 억양은 F0 contour로 정밀 제어 필요.
            </div>
          </div>

          {/* Duration 체험 */}
          <div className="bg-gray-900 rounded-lg p-4 border border-green-900/50">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">⏱️</span>
              <div>
                <h4 className="font-medium text-green-400">Duration (길이/속도)</h4>
                <p className="text-xs text-gray-500">말의 빠르기, 리듬감</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              속도에 따라 감정과 분위기가 달라집니다. 같은 문장을 다른 속도로 들어보세요.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => speak("오늘 날씨가 정말 좋네요", { rate: 0.6, pitch: 1.0, volume: 0.8 })}
                data-testid="prosody-duration-slow"
                className="w-full py-2 px-3 bg-green-900/40 hover:bg-green-800/50 rounded text-sm transition-colors flex items-center gap-2"
              >
                <span className="text-green-400">🐢</span> 느리게 (0.6x) - 차분하고 신중한 느낌
              </button>
              <button
                onClick={() => speak("오늘 날씨가 정말 좋네요", { rate: 1.0, pitch: 1.0, volume: 0.8 })}
                data-testid="prosody-duration-normal"
                className="w-full py-2 px-3 bg-green-900/40 hover:bg-green-800/50 rounded text-sm transition-colors flex items-center gap-2"
              >
                <span className="text-green-400">🚶</span> 보통 (1.0x) - 일상 대화
              </button>
              <button
                onClick={() => speak("오늘 날씨가 정말 좋네요", { rate: 1.5, pitch: 1.0, volume: 0.8 })}
                data-testid="prosody-duration-fast"
                className="w-full py-2 px-3 bg-green-900/40 hover:bg-green-800/50 rounded text-sm transition-colors flex items-center gap-2"
              >
                <span className="text-green-400">🐇</span> 빠르게 (1.5x) - 활기차고 급한 느낌
              </button>
            </div>
          </div>

          {/* Energy 체험 */}
          <div className="bg-gray-900 rounded-lg p-4 border border-red-900/50">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">⚡</span>
              <div>
                <h4 className="font-medium text-red-400">Energy (강도/음량)</h4>
                <p className="text-xs text-gray-500">소리의 세기, 강조</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              강도는 감정의 격렬함과 관련됩니다. 속삭임부터 외침까지 비교해보세요.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => speak("비밀인데 말해줄게", { rate: 0.9, pitch: 0.9, volume: 0.3 })}
                data-testid="prosody-energy-whisper"
                className="w-full py-2 px-3 bg-red-900/40 hover:bg-red-800/50 rounded text-sm transition-colors flex items-center gap-2"
              >
                <span className="text-red-400">🤫</span> 속삭임 (30%) - 비밀스럽게
              </button>
              <button
                onClick={() => speak("안녕하세요 반갑습니다", { rate: 1.0, pitch: 1.0, volume: 0.7 })}
                data-testid="prosody-energy-normal"
                className="w-full py-2 px-3 bg-red-900/40 hover:bg-red-800/50 rounded text-sm transition-colors flex items-center gap-2"
              >
                <span className="text-red-400">🗣️</span> 보통 (70%) - 일상 대화
              </button>
              <button
                onClick={() => speak("조심해! 위험해!", { rate: 1.2, pitch: 1.3, volume: 1.0 })}
                data-testid="prosody-energy-loud"
                className="w-full py-2 px-3 bg-red-900/40 hover:bg-red-800/50 rounded text-sm transition-colors flex items-center gap-2"
              >
                <span className="text-red-400">📢</span> 크게 (100%) - 경고/외침
              </button>
            </div>
          </div>

          {/* Pause 체험 */}
          <div className="bg-gray-900 rounded-lg p-4 border border-purple-900/50">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">⏸️</span>
              <div>
                <h4 className="font-medium text-purple-400">Pause (쉼/휴지)</h4>
                <p className="text-xs text-gray-500">문장 사이의 멈춤, 호흡</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              쉼표와 마침표로 휴지를 표현합니다. 쉼의 유무와 위치가 의미를 바꿉니다.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => speak("아버지가 방에 들어가신다", { rate: 1.0, pitch: 1.0, volume: 0.8 })}
                data-testid="prosody-pause-none"
                className="w-full py-2 px-3 bg-purple-900/40 hover:bg-purple-800/50 rounded text-sm transition-colors flex items-center gap-2"
              >
                <span className="text-purple-400">➡️</span> "아버지가 방에 들어가신다" (쉼 없음)
              </button>
              <button
                onClick={() => speak("아버지가, 방에 들어가신다", { rate: 1.0, pitch: 1.0, volume: 0.8 })}
                data-testid="prosody-pause-comma"
                className="w-full py-2 px-3 bg-purple-900/40 hover:bg-purple-800/50 rounded text-sm transition-colors flex items-center gap-2"
              >
                <span className="text-purple-400">⏸️</span> "아버지가, 방에 들어가신다" (쉼표 휴지)
              </button>
              <button
                onClick={() => speak("아버지... 가방에... 들어가신다", { rate: 0.9, pitch: 1.0, volume: 0.8 })}
                data-testid="prosody-pause-dots"
                className="w-full py-2 px-3 bg-purple-900/40 hover:bg-purple-800/50 rounded text-sm transition-colors flex items-center gap-2"
              >
                <span className="text-purple-400">⏸️⏸️</span> "아버지... 가방에..." (긴 휴지 - 의미 변화!)
              </button>
            </div>
            <div className="mt-3 p-2 bg-gray-800 rounded text-xs text-gray-500">
              💡 Web Speech API는 문장부호(, . ...)를 기반으로 휴지를 생성합니다.
            </div>
          </div>
        </div>

        {/* Prosody 4요소 종합 비교표 */}
        <div className="mt-6 p-4 bg-gray-900 rounded-lg">
          <h4 className="font-medium mb-3 text-sm">📊 Prosody 4요소 종합 비교</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-2">요소</th>
                  <th className="text-left py-2 px-2">음성학 용어</th>
                  <th className="text-left py-2 px-2">물리량</th>
                  <th className="text-left py-2 px-2">Web Speech API</th>
                  <th className="text-left py-2 px-2">언어적 기능</th>
                </tr>
              </thead>
              <tbody className="text-gray-400">
                <tr className="border-b border-gray-800">
                  <td className="py-2 px-2 text-cyan-400">🎵 Pitch</td>
                  <td className="py-2 px-2">F0 (기본 주파수)</td>
                  <td className="py-2 px-2">Hz</td>
                  <td className="py-2 px-2">pitch (0.1~2)</td>
                  <td className="py-2 px-2">억양, 의문/평서 구분</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-2 px-2 text-green-400">⏱️ Duration</td>
                  <td className="py-2 px-2">Tempo</td>
                  <td className="py-2 px-2">ms, WPM</td>
                  <td className="py-2 px-2">rate (0.1~10)</td>
                  <td className="py-2 px-2">속도, 리듬감</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="py-2 px-2 text-red-400">⚡ Energy</td>
                  <td className="py-2 px-2">Intensity</td>
                  <td className="py-2 px-2">dB</td>
                  <td className="py-2 px-2">volume (0~1)</td>
                  <td className="py-2 px-2">강조, 감정 강도</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 text-purple-400">⏸️ Pause</td>
                  <td className="py-2 px-2">Silent Interval</td>
                  <td className="py-2 px-2">ms</td>
                  <td className="py-2 px-2">문장부호 (,./...)</td>
                  <td className="py-2 px-2">구문 경계, 의미 전달</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Vocoder 비교 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="font-medium mb-4 flex items-center gap-2">
          <Volume2 className="w-5 h-5" />
          Vocoder 비교 (Neural Vocoder의 혁신)
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Vocoder는 Mel-Spectrogram을 실제 오디오 파형으로 변환합니다.
          같은 입력이라도 <span className="text-primary">Vocoder에 따라 음질이 크게 달라집니다</span>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {VOCODER_SAMPLES.map(vocoder => (
            <div
              key={vocoder.id}
              className={`p-4 rounded-lg transition-all ${
                selectedVocoder.id === vocoder.id
                  ? 'bg-primary/20 border-2 border-primary'
                  : 'bg-gray-900 border border-gray-700 hover:border-gray-500'
              }`}
            >
              <button
                onClick={() => setSelectedVocoder(vocoder)}
                data-testid={`vocoder-${vocoder.id}`}
                className="w-full text-left"
              >
                <div className="font-medium mb-1">{vocoder.name}</div>
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-xs text-gray-500">품질:</span>
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className={i < vocoder.quality ? 'text-yellow-400' : 'text-gray-600'}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <div className="text-xs text-gray-400 mb-2">{vocoder.description}</div>
              </button>
              <button
                onClick={() => playVocoderDemo(vocoder)}
                disabled={isPlayingVocoder}
                data-testid={`vocoder-play-${vocoder.id}`}
                className={`w-full py-1.5 px-3 rounded text-xs transition-all flex items-center justify-center gap-1 ${
                  isPlayingVocoder
                    ? 'bg-gray-700 opacity-50'
                    : vocoder.id === 'griffin-lim'
                      ? 'bg-orange-600 hover:bg-orange-700'
                      : vocoder.id === 'wavenet'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                <PlayCircle className="w-3 h-3" />
                {isPlayingVocoder ? '재생중...' : '소리 듣기'}
              </button>
            </div>
          ))}
        </div>

        <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded text-sm">
          <span className="text-yellow-400 font-medium">체험 안내: </span>
          <span className="text-gray-300">
            각 Vocoder의 "소리 듣기" 버튼을 눌러 품질 차이를 비교해보세요.
            Griffin-Lim은 금속성/노이즈가 느껴지고, WaveNet/HiFi-GAN은 깨끗합니다.
          </span>
        </div>

        <div className="bg-gray-900 rounded-lg p-4">
          <div className="mb-3">
            <span className="text-sm text-gray-400">선택된 Vocoder: </span>
            <span className="text-primary font-bold">{selectedVocoder.name}</span>
          </div>
          <div className="text-sm text-gray-400 mb-3">
            <span className="font-medium">특징:</span> {selectedVocoder.characteristics}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-800 rounded p-3">
              <div className="font-medium text-gray-300 mb-2">TTS 2단계 구조</div>
              <div className="text-gray-400 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-primary rounded-full"></span>
                  <span>1. Acoustic Model: 텍스트 → Mel-Spectrogram</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-secondary rounded-full"></span>
                  <span>2. Vocoder: Mel-Spectrogram → 오디오 파형</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded p-3">
              <div className="font-medium text-gray-300 mb-2">Vocoder 발전사</div>
              <ul className="text-gray-400 text-xs space-y-1">
                <li>• 2016: WaveNet - 혁명적 품질, 매우 느림</li>
                <li>• 2018: WaveGlow - 병렬 처리 가능</li>
                <li>• 2020: HiFi-GAN - 실시간 + 고품질 (현재 표준)</li>
              </ul>
            </div>
          </div>

          {selectedVocoder.id === 'hifi-gan' && (
            <div className="mt-4 p-3 bg-green-900/20 border border-green-700/50 rounded text-sm">
              <span className="text-green-400 font-medium">HiFi-GAN의 혁신: </span>
              <span className="text-gray-300">
                GAN(적대적 생성 신경망)을 사용하여 Generator가 "진짜 같은" 오디오를 만들고,
                Discriminator가 "진짜 vs 가짜"를 판별하면서 품질을 높입니다.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Text Normalization */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="font-medium mb-4">Text Normalization (텍스트 정규화)</h3>
        <p className="text-sm text-gray-400 mb-4">
          TTS가 텍스트를 읽기 전에 <span className="text-primary">숫자, 날짜, 단위</span> 등을 발음 가능한 형태로 변환합니다.
          "2024년" → "이천이십사년" 같은 변환이 필요합니다.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 변환기 */}
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 block mb-2">변환할 텍스트</label>
              <input
                type="text"
                value={normInput}
                onChange={(e) => setNormInput(e.target.value)}
                placeholder="예: 2024년 12월 25일 오후 3시"
                data-testid="norm-input"
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
              />
            </div>
            <button
              onClick={handleNormalize}
              data-testid="norm-convert-btn"
              className="w-full bg-secondary hover:bg-secondary/80 text-white py-2 px-4 rounded-lg transition-colors"
            >
              정규화 변환
            </button>
            {normResult && (
              <div className="p-4 bg-gray-900 rounded" data-testid="norm-result">
                <div className="text-sm text-gray-400 mb-1">변환 결과:</div>
                <div className="text-lg text-primary font-medium">{normResult}</div>
              </div>
            )}
          </div>

          {/* 예시 목록 */}
          <div>
            <div className="text-sm text-gray-400 mb-2">변환 예시 (클릭하여 체험)</div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {TEXT_NORM_EXAMPLES.map((ex, idx) => (
                <button
                  key={idx}
                  onClick={() => { setNormInput(ex.input); setNormResult(ex.output); }}
                  className="w-full p-3 bg-gray-900 rounded hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">{ex.type}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-white">{ex.input}</span>
                    <span className="text-gray-500 mx-2">→</span>
                    <span className="text-primary">{ex.output}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-gray-900 rounded text-sm text-gray-400">
          <div className="font-medium mb-2 text-gray-300">TTS 전처리 파이프라인</div>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="px-2 py-1 bg-gray-700 rounded">원문</span>
            <span>→</span>
            <span className="px-2 py-1 bg-primary/30 rounded text-primary">Text Normalization</span>
            <span>→</span>
            <span className="px-2 py-1 bg-secondary/30 rounded text-secondary">G2P (발음 변환)</span>
            <span>→</span>
            <span className="px-2 py-1 bg-green-700/30 rounded text-green-400">Acoustic Model</span>
            <span>→</span>
            <span className="px-2 py-1 bg-yellow-700/30 rounded text-yellow-400">Vocoder</span>
            <span>→</span>
            <span className="px-2 py-1 bg-gray-700 rounded">음성</span>
          </div>
        </div>
      </div>

      {/* TTS 파이프라인 인터랙티브 데모 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="font-medium mb-4">TTS 파이프라인 단계별 체험</h3>
        <p className="text-sm text-gray-400 mb-4">
          텍스트가 음성으로 변환되는 전체 과정을 <span className="text-primary">단계별로</span> 확인하세요.
          각 단계에서 데이터가 어떻게 변환되는지 볼 수 있습니다.
        </p>

        {/* 입력 */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={pipelineInput}
            onChange={(e) => setPipelineInput(e.target.value)}
            placeholder="예: 2024년 12월 25일, 축하합니다"
            data-testid="pipeline-input"
            className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
          />
          <button
            onClick={runPipeline}
            disabled={pipelineRunning}
            data-testid="pipeline-run-btn"
            className="bg-primary hover:bg-primary/80 text-white py-2 px-6 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {pipelineRunning ? (
              <>
                <span className="animate-spin">⚙️</span>
                처리 중...
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                파이프라인 실행
              </>
            )}
          </button>
        </div>

        {/* 파이프라인 시각화 */}
        <div className="relative">
          {/* 진행 바 */}
          <div className="absolute top-8 left-0 right-0 h-1 bg-gray-700 rounded">
            <div
              className="h-full bg-gradient-to-r from-primary via-secondary to-green-500 rounded transition-all duration-500"
              style={{ width: pipelineStep >= 0 ? `${Math.min(100, (pipelineStep + 1) * 20)}%` : '0%' }}
            />
          </div>

          {/* 단계 노드들 */}
          <div className="flex justify-between mb-8 relative z-10">
            {[
              { id: 0, label: '원문', icon: '📝', color: 'gray' },
              { id: 1, label: 'Text Norm', icon: '🔢', color: 'primary' },
              { id: 2, label: 'G2P', icon: '🗣️', color: 'secondary' },
              { id: 3, label: 'Acoustic', icon: '📊', color: 'green' },
              { id: 4, label: 'Vocoder', icon: '🔊', color: 'yellow' },
              { id: 5, label: '음성', icon: '🎵', color: 'purple' },
            ].map((stage) => (
              <div key={stage.id} className="flex flex-col items-center">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${
                    pipelineStep >= stage.id
                      ? pipelineStep === stage.id
                        ? 'bg-white text-gray-900 scale-125 shadow-lg shadow-white/30'
                        : stage.color === 'primary' ? 'bg-primary text-white' :
                          stage.color === 'secondary' ? 'bg-secondary text-white' :
                          stage.color === 'green' ? 'bg-green-500 text-white' :
                          stage.color === 'yellow' ? 'bg-yellow-500 text-gray-900' :
                          stage.color === 'purple' ? 'bg-purple-500 text-white' :
                          'bg-gray-600 text-white'
                      : 'bg-gray-700 text-gray-500'
                  }`}
                >
                  {pipelineStep === stage.id && pipelineRunning ? (
                    <span className="animate-pulse">{stage.icon}</span>
                  ) : (
                    stage.icon
                  )}
                </div>
                <span className={`text-xs mt-2 ${pipelineStep >= stage.id ? 'text-white' : 'text-gray-500'}`}>
                  {stage.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 결과 표시 */}
        {(pipelineStep >= 0 || pipelineResults) && (
          <div className="space-y-3 mt-4">
            {/* 원문 */}
            <div className={`p-3 rounded-lg transition-all ${pipelineStep >= 0 ? 'bg-gray-700' : 'bg-gray-800 opacity-50'}`}>
              <div className="text-xs text-gray-400 mb-1">📝 원문</div>
              <div className="text-white">{pipelineResults?.original || pipelineInput}</div>
            </div>

            {/* Text Normalization */}
            <div className={`p-3 rounded-lg transition-all ${pipelineStep >= 1 ? 'bg-primary/20 border border-primary/50' : 'bg-gray-800 opacity-30'}`}>
              <div className="text-xs text-primary mb-1">🔢 Text Normalization</div>
              {pipelineStep >= 1 && (
                <div className="text-white">
                  {pipelineResults?.normalized || '처리 중...'}
                  {pipelineStep === 1 && <span className="animate-pulse ml-2">▌</span>}
                </div>
              )}
            </div>

            {/* G2P */}
            <div className={`p-3 rounded-lg transition-all ${pipelineStep >= 2 ? 'bg-secondary/20 border border-secondary/50' : 'bg-gray-800 opacity-30'}`}>
              <div className="text-xs text-secondary mb-1">🗣️ G2P (발음 변환)</div>
              {pipelineStep >= 2 && (
                <div className="text-white">
                  {pipelineResults?.g2p || '처리 중...'}
                  {pipelineStep === 2 && <span className="animate-pulse ml-2">▌</span>}
                </div>
              )}
            </div>

            {/* Acoustic Model */}
            <div className={`p-3 rounded-lg transition-all ${pipelineStep >= 3 ? 'bg-green-500/20 border border-green-500/50' : 'bg-gray-800 opacity-30'}`}>
              <div className="text-xs text-green-400 mb-1">📊 Acoustic Model (Mel-Spectrogram)</div>
              {pipelineStep >= 3 && (
                <div className="text-white">
                  {pipelineResults?.acoustic || '처리 중...'}
                  {pipelineStep === 3 && <span className="animate-pulse ml-2">▌</span>}
                </div>
              )}
            </div>

            {/* Vocoder */}
            <div className={`p-3 rounded-lg transition-all ${pipelineStep >= 4 ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-gray-800 opacity-30'}`}>
              <div className="text-xs text-yellow-400 mb-1">🔊 Vocoder (HiFi-GAN)</div>
              {pipelineStep >= 4 && (
                <div className="text-white">
                  {pipelineResults?.vocoder || '처리 중...'}
                  {pipelineStep === 4 && <span className="animate-pulse ml-2">▌</span>}
                </div>
              )}
            </div>

            {/* 완료 */}
            {pipelineStep >= 5 && (
              <div className="p-4 rounded-lg bg-purple-500/20 border border-purple-500/50 text-center">
                <div className="text-2xl mb-2">🎵</div>
                <div className="text-purple-300 font-medium">음성 출력 완료!</div>
                <div className="text-xs text-gray-400 mt-1">
                  Web Speech API로 "{pipelineResults?.normalized}" 읽기
                </div>
              </div>
            )}
          </div>
        )}

        {/* 예시 버튼 */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-2">예시 텍스트:</div>
          <div className="flex flex-wrap gap-2">
            {[
              '2024년 12월 25일',
              '축하합니다',
              '오후 3시 30분',
              '국민은행',
              '같이 학교에 갑니다',
            ].map((example) => (
              <button
                key={example}
                onClick={() => setPipelineInput(example)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Playground - 종합 실습
// ============================================
function Playground() {
  const stt = useSpeechRecognition();
  const tts = useSpeechSynthesis();
  const [cycleStatus, setCycleStatus] = useState<'idle' | 'listening' | 'speaking'>('idle');
  const [recognizedText, setRecognizedText] = useState('');

  // WER/CER 계산기 상태
  const [reference, setReference] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [metrics, setMetrics] = useState<{ wer: string; cer: string } | null>(null);

  // 노이즈 시뮬레이터 상태
  const [noiseLevel, setNoiseLevel] = useState<Record<string, number>>({
    white: 0,
    cafe: 0,
    traffic: 0,
  });
  const noiseDemo = {
    originalText: '오늘 회의는 세시에 시작합니다',
    noisyResults: [
      { level: 0, text: '오늘 회의는 세시에 시작합니다', wer: '0.00%' },
      { level: 30, text: '오늘 회의는 3시에 시작합니다', wer: '20.00%' },
      { level: 60, text: '오늘 회의 세 시 시작합니다', wer: '40.00%' },
      { level: 90, text: '오늘 회의 시작', wer: '66.67%' },
    ],
  };

  // Data Augmentation 상태
  const [augRecordedAudio, setAugRecordedAudio] = useState<AudioBuffer | null>(null);
  const [augIsRecording, setAugIsRecording] = useState(false);
  const [augIsPlaying, setAugIsPlaying] = useState(false);
  const [pitchShift, setPitchShift] = useState(0); // -12 ~ +12 semitones
  const [timeStretch, setTimeStretch] = useState(1.0); // 0.5 ~ 2.0
  const augMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const augAudioChunksRef = useRef<Blob[]>([]);

  // Data Augmentation 녹음
  const startAugRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      augMediaRecorderRef.current = mediaRecorder;
      augAudioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        augAudioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(augAudioChunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        setAugRecordedAudio(audioBuffer);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setAugIsRecording(true);
    } catch (err) {
      console.error('녹음 시작 실패:', err);
    }
  };

  const stopAugRecording = () => {
    if (augMediaRecorderRef.current && augIsRecording) {
      augMediaRecorderRef.current.stop();
      setAugIsRecording(false);
    }
  };

  // Data Augmentation 적용 재생
  const playAugmented = async () => {
    if (!augRecordedAudio || augIsPlaying) return;
    setAugIsPlaying(true);

    try {
      const audioContext = new AudioContext();
      const originalData = augRecordedAudio.getChannelData(0);
      const sampleRate = augRecordedAudio.sampleRate;

      // Time Stretch 적용
      const stretchedLength = Math.floor(originalData.length / timeStretch);
      const stretchedBuffer = audioContext.createBuffer(1, stretchedLength, sampleRate);
      const stretchedData = stretchedBuffer.getChannelData(0);

      for (let i = 0; i < stretchedLength; i++) {
        const srcIdx = i * timeStretch;
        const idx1 = Math.floor(srcIdx);
        const idx2 = Math.min(idx1 + 1, originalData.length - 1);
        const frac = srcIdx - idx1;
        stretchedData[i] = originalData[idx1] * (1 - frac) + originalData[idx2] * frac;
      }

      // Pitch Shift 적용 (간단한 리샘플링 방식)
      const pitchFactor = Math.pow(2, pitchShift / 12);
      const pitchedLength = Math.floor(stretchedLength / pitchFactor);
      const pitchedBuffer = audioContext.createBuffer(1, pitchedLength, sampleRate);
      const pitchedData = pitchedBuffer.getChannelData(0);

      for (let i = 0; i < pitchedLength; i++) {
        const srcIdx = i * pitchFactor;
        const idx1 = Math.floor(srcIdx);
        const idx2 = Math.min(idx1 + 1, stretchedLength - 1);
        const frac = srcIdx - idx1;
        pitchedData[i] = stretchedData[idx1] * (1 - frac) + stretchedData[idx2] * frac;
      }

      const source = audioContext.createBufferSource();
      source.buffer = pitchedBuffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        setAugIsPlaying(false);
        audioContext.close();
      };
      source.start();
    } catch (err) {
      console.error('재생 실패:', err);
      setAugIsPlaying(false);
    }
  };

  // 원본 재생
  const playOriginal = async () => {
    if (!augRecordedAudio || augIsPlaying) return;
    setAugIsPlaying(true);

    try {
      const audioContext = new AudioContext();
      const source = audioContext.createBufferSource();
      source.buffer = augRecordedAudio;
      source.connect(audioContext.destination);
      source.onended = () => {
        setAugIsPlaying(false);
        audioContext.close();
      };
      source.start();
    } catch (err) {
      console.error('재생 실패:', err);
      setAugIsPlaying(false);
    }
  };

  // STT → TTS 순환 테스트
  const handleStartCycle = () => {
    if (cycleStatus !== 'idle') return;
    setCycleStatus('listening');
    setRecognizedText('');
    stt.clearResults();
    stt.startListening();
  };

  const handleStopCycle = useCallback(() => {
    stt.stopListening();
    const text = stt.results.map(r => r.transcript).join(' ').trim();
    setRecognizedText(text);

    if (text) {
      setCycleStatus('speaking');
      tts.speak(text);
    } else {
      setCycleStatus('idle');
    }
  }, [stt, tts]);

  // TTS 완료 감지
  useEffect(() => {
    if (cycleStatus === 'speaking' && !tts.isSpeaking) {
      setCycleStatus('idle');
    }
  }, [cycleStatus, tts.isSpeaking]);

  // WER/CER 계산
  const handleCalculateMetrics = () => {
    if (!reference.trim() || !hypothesis.trim()) return;
    const wer = calculateWER(reference, hypothesis);
    const cer = calculateCER(reference, hypothesis);
    setMetrics({
      wer: wer.percentage,
      cer: cer.percentage,
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <PlayCircle className="w-6 h-6 text-primary" />
        Playground - 종합 실습
      </h2>

      {!stt.isSupported && (
        <div className="bg-yellow-900/50 border border-yellow-700 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-yellow-400" />
          <span>음성 인식이 지원되지 않아 순환 테스트를 사용할 수 없습니다.</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {/* STT → TTS 순환 테스트 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4">STT → TTS 순환 테스트</h3>
          <p className="text-gray-400 mb-4">
            말하면 → 텍스트로 인식 → 다시 음성으로 읽어줍니다
          </p>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className={`bg-gray-900 rounded p-4 text-center transition-colors ${cycleStatus === 'listening' ? 'ring-2 ring-primary' : ''}`}>
              <p className="text-sm text-gray-500 mb-2">1. 내 음성</p>
              <div className={`text-2xl ${cycleStatus === 'listening' ? 'animate-pulse' : ''}`}>
                {cycleStatus === 'listening' ? '...' : ''}
              </div>
            </div>
            <div className="bg-gray-900 rounded p-4 text-center">
              <p className="text-sm text-gray-500 mb-2">2. 인식된 텍스트</p>
              <div className="text-gray-400 text-sm" data-testid="cycle-text">
                {recognizedText || stt.interimResult || '...'}
              </div>
            </div>
            <div className={`bg-gray-900 rounded p-4 text-center transition-colors ${cycleStatus === 'speaking' ? 'ring-2 ring-secondary' : ''}`}>
              <p className="text-sm text-gray-500 mb-2">3. TTS 출력</p>
              <div className={`text-2xl ${cycleStatus === 'speaking' ? 'animate-pulse' : ''}`}>
                {cycleStatus === 'speaking' ? '...' : ''}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {cycleStatus === 'idle' ? (
              <button
                onClick={handleStartCycle}
                disabled={!stt.isSupported}
                data-testid="cycle-start-btn"
                className="flex-1 bg-primary hover:bg-primary/80 text-white py-3 px-4 rounded-lg transition-colors text-lg disabled:opacity-50"
              >
                순환 테스트 시작
              </button>
            ) : cycleStatus === 'listening' ? (
              <button
                onClick={handleStopCycle}
                data-testid="cycle-stop-btn"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg transition-colors text-lg"
              >
                말하기 완료
              </button>
            ) : (
              <button
                disabled
                className="flex-1 bg-gray-700 text-white py-3 px-4 rounded-lg text-lg opacity-50"
              >
                TTS 재생 중...
              </button>
            )}
          </div>
        </div>

        {/* WER/CER 계산기 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4">WER/CER 계산기</h3>

          {/* 설명 추가 */}
          <div className="mb-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded text-sm">
            <span className="text-blue-400 font-medium">사용법: </span>
            <span className="text-gray-300">
              STT 성능을 측정합니다. <strong>정답</strong>은 실제로 말한 내용, <strong>인식 결과</strong>는 STT가 출력한 내용입니다.
              아래 예시 버튼을 눌러 바로 체험해보세요!
            </span>
          </div>

          {/* 예시 버튼들 */}
          <div className="mb-4">
            <div className="text-sm text-gray-400 mb-2">예시로 체험하기:</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setReference('오늘 날씨가 좋습니다');
                  setHypothesis('오늘 날씨가 좋습니다');
                }}
                className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-xs"
              >
                완벽한 인식 (0%)
              </button>
              <button
                onClick={() => {
                  setReference('오늘 날씨가 좋습니다');
                  setHypothesis('오늘 날씨가 나쁩니다');
                }}
                className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 rounded text-xs"
              >
                일부 오류 (25%)
              </button>
              <button
                onClick={() => {
                  setReference('학교에 갑니다');
                  setHypothesis('학교가 갑니다');
                }}
                className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 rounded text-xs"
              >
                조사 오류 (WER vs CER 차이)
              </button>
              <button
                onClick={() => {
                  setReference('the weather is good');
                  setHypothesis('the weather is great');
                }}
                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded text-xs"
              >
                영어 예시 (25%)
              </button>
              <button
                onClick={() => {
                  setReference('안녕하세요 반갑습니다');
                  setHypothesis('안녕 반갑');
                }}
                className="px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-xs"
              >
                심한 오류
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm text-gray-400 block mb-2">
                정답 텍스트 (Reference)
                <span className="text-xs text-gray-500 ml-1">- 실제로 말한 내용</span>
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="오늘 날씨가 좋습니다"
                data-testid="wer-reference"
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-2">
                인식된 텍스트 (Hypothesis)
                <span className="text-xs text-gray-500 ml-1">- STT가 인식한 내용</span>
              </label>
              <input
                type="text"
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                placeholder="오늘 날씨가 좁습니다"
                data-testid="wer-hypothesis"
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
              />
            </div>
          </div>
          <button
            onClick={handleCalculateMetrics}
            data-testid="wer-calculate-btn"
            className="w-full bg-secondary hover:bg-secondary/80 text-white py-2 px-4 rounded-lg transition-colors mb-4"
          >
            계산하기
          </button>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded p-4 text-center">
              <p className="text-sm text-gray-500">WER (단어 오류율)</p>
              <p className="text-2xl font-bold text-primary" data-testid="wer-result">
                {metrics?.wer || '--%'}
              </p>
              <p className="text-xs text-gray-500 mt-1">낮을수록 좋음</p>
            </div>
            <div className="bg-gray-900 rounded p-4 text-center">
              <p className="text-sm text-gray-500">CER (글자 오류율)</p>
              <p className="text-2xl font-bold text-secondary" data-testid="cer-result">
                {metrics?.cer || '--%'}
              </p>
              <p className="text-xs text-gray-500 mt-1">낮을수록 좋음</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-gray-900 rounded text-sm text-gray-400">
            <div className="font-medium mb-2 text-gray-300">WER vs CER 사용 시점</div>
            <ul className="space-y-1 text-xs">
              <li>• <span className="text-primary">WER (Word Error Rate)</span>: 영어 등 띄어쓰기가 명확한 언어</li>
              <li>• <span className="text-secondary">CER (Character Error Rate)</span>: 한국어, 중국어 등 조사/어미 변화가 많은 언어</li>
              <li>• 한국어는 "학교에" → "학교가" 같은 조사 오류로 WER이 100%가 될 수 있어 CER이 더 공정함</li>
              <li className="text-yellow-400">• 위 "조사 오류" 예시를 눌러 WER/CER 차이를 확인해보세요!</li>
            </ul>
          </div>
        </div>

        {/* 노이즈 영향 시뮬레이터 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <VolumeX className="w-5 h-5" />
            노이즈가 STT에 미치는 영향
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            실제 환경에서는 다양한 배경 소음이 음성 인식 품질에 영향을 미칩니다.
            <span className="text-primary"> 노이즈가 심할수록 인식률이 급격히 하락</span>합니다.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 노이즈 조절 슬라이더 */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">백색 소음 (에어컨, 팬)</span>
                  <span className="text-primary">{noiseLevel.white}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={noiseLevel.white}
                  onChange={(e) => setNoiseLevel(prev => ({ ...prev, white: parseInt(e.target.value) }))}
                  data-testid="noise-white"
                  className="w-full"
                />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">카페 배경음</span>
                  <span className="text-primary">{noiseLevel.cafe}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={noiseLevel.cafe}
                  onChange={(e) => setNoiseLevel(prev => ({ ...prev, cafe: parseInt(e.target.value) }))}
                  data-testid="noise-cafe"
                  className="w-full"
                />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">교통 소음</span>
                  <span className="text-primary">{noiseLevel.traffic}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={noiseLevel.traffic}
                  onChange={(e) => setNoiseLevel(prev => ({ ...prev, traffic: parseInt(e.target.value) }))}
                  data-testid="noise-traffic"
                  className="w-full"
                />
              </div>

              <div className="bg-gray-900 rounded p-3 mt-4">
                <div className="text-sm text-gray-400 mb-2">총 노이즈 레벨</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        (noiseLevel.white + noiseLevel.cafe + noiseLevel.traffic) / 3 > 60
                          ? 'bg-red-500'
                          : (noiseLevel.white + noiseLevel.cafe + noiseLevel.traffic) / 3 > 30
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(100, (noiseLevel.white + noiseLevel.cafe + noiseLevel.traffic) / 3)}%` }}
                    />
                  </div>
                  <span className={`font-bold ${
                    (noiseLevel.white + noiseLevel.cafe + noiseLevel.traffic) / 3 > 60
                      ? 'text-red-400'
                      : (noiseLevel.white + noiseLevel.cafe + noiseLevel.traffic) / 3 > 30
                      ? 'text-yellow-400'
                      : 'text-green-400'
                  }`}>
                    {Math.round((noiseLevel.white + noiseLevel.cafe + noiseLevel.traffic) / 3)}%
                  </span>
                </div>
              </div>
            </div>

            {/* 인식 결과 시뮬레이션 */}
            <div className="space-y-4">
              <div className="bg-gray-900 rounded p-4">
                <div className="text-sm text-gray-500 mb-2">원본 텍스트</div>
                <div className="text-white font-medium">{noiseDemo.originalText}</div>
              </div>

              <div className="text-sm text-gray-400 mb-2">노이즈 레벨별 인식 결과 예시:</div>
              {noiseDemo.noisyResults.map((result, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded border ${
                    (noiseLevel.white + noiseLevel.cafe + noiseLevel.traffic) / 3 >= result.level &&
                    (noiseLevel.white + noiseLevel.cafe + noiseLevel.traffic) / 3 < (noiseDemo.noisyResults[idx + 1]?.level || 101)
                      ? 'bg-primary/20 border-primary'
                      : 'bg-gray-900 border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500">노이즈 {result.level}%</span>
                    <span className={`text-xs font-bold ${
                      parseFloat(result.wer) === 0 ? 'text-green-400' :
                      parseFloat(result.wer) < 30 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      WER: {result.wer}
                    </span>
                  </div>
                  <div className="text-sm">{result.text}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 p-4 bg-gray-900 rounded">
            <div className="font-medium text-gray-300 mb-2">노이즈 대응 전략 (실무)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-400">
              <ul className="space-y-1">
                <li>• <span className="text-primary">Spectral Subtraction</span>: 주파수 영역에서 노이즈 제거</li>
                <li>• <span className="text-primary">Demucs</span>: 음성/음악 분리 모델</li>
              </ul>
              <ul className="space-y-1">
                <li>• <span className="text-primary">Data Augmentation</span>: 노이즈 섞인 데이터로 학습</li>
                <li>• <span className="text-primary">VAD</span>: 음성 구간만 추출</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Data Augmentation 체험 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4">Data Augmentation 체험</h3>
          <p className="text-sm text-gray-400 mb-4">
            음성 데이터 증강 기법을 직접 체험합니다. <span className="text-primary">Pitch Shift</span>와 <span className="text-secondary">Time Stretch</span>를
            조절하여 다양한 화자를 시뮬레이션합니다.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 녹음 및 재생 */}
            <div className="space-y-4">
              <div className="flex gap-2">
                {!augIsRecording ? (
                  <button
                    onClick={startAugRecording}
                    data-testid="aug-record-btn"
                    className="flex-1 bg-primary hover:bg-primary/80 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Mic className="w-4 h-4" />
                    {augRecordedAudio ? '다시 녹음' : '녹음하기'}
                  </button>
                ) : (
                  <button
                    onClick={stopAugRecording}
                    data-testid="aug-stop-btn"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 animate-pulse"
                  >
                    <Square className="w-4 h-4" />
                    녹음 중지
                  </button>
                )}
              </div>

              {augRecordedAudio && (
                <div className="space-y-3">
                  <div className="text-xs text-gray-500">
                    녹음 완료! ({(augRecordedAudio.duration).toFixed(1)}초)
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={playOriginal}
                      disabled={augIsPlaying}
                      data-testid="aug-play-original"
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                    >
                      원본 재생
                    </button>
                    <button
                      onClick={playAugmented}
                      disabled={augIsPlaying}
                      data-testid="aug-play-augmented"
                      className="flex-1 bg-secondary hover:bg-secondary/80 text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {augIsPlaying ? '재생중...' : '변환 재생'}
                    </button>
                  </div>
                </div>
              )}

              <div className="p-4 bg-gray-900 rounded-lg">
                <div className="text-sm text-gray-400 mb-3">현재 설정:</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pitch Shift:</span>
                    <span className={pitchShift === 0 ? 'text-gray-400' : pitchShift > 0 ? 'text-green-400' : 'text-blue-400'}>
                      {pitchShift > 0 ? '+' : ''}{pitchShift} 반음 ({pitchShift > 0 ? '높은 목소리' : pitchShift < 0 ? '낮은 목소리' : '원래 음높이'})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Time Stretch:</span>
                    <span className={timeStretch === 1 ? 'text-gray-400' : timeStretch > 1 ? 'text-yellow-400' : 'text-purple-400'}>
                      {timeStretch.toFixed(1)}x ({timeStretch > 1 ? '빠르게' : timeStretch < 1 ? '느리게' : '원래 속도'})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 파라미터 조절 */}
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Pitch Shift (음높이)</span>
                  <span className="text-primary">{pitchShift > 0 ? '+' : ''}{pitchShift} 반음</span>
                </div>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={pitchShift}
                  onChange={(e) => setPitchShift(parseInt(e.target.value))}
                  data-testid="aug-pitch-slider"
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>-12 (낮은 목소리)</span>
                  <span>0</span>
                  <span>+12 (높은 목소리)</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Time Stretch (속도)</span>
                  <span className="text-secondary">{timeStretch.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={timeStretch}
                  onChange={(e) => setTimeStretch(parseFloat(e.target.value))}
                  data-testid="aug-time-slider"
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0.5x (느리게)</span>
                  <span>1.0x</span>
                  <span>2.0x (빠르게)</span>
                </div>
              </div>

              {/* 프리셋 버튼 */}
              <div>
                <div className="text-sm text-gray-400 mb-2">화자 프리셋 (음성학 기반)</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setPitchShift(10); setTimeStretch(1.15); }}
                    className="py-2 px-3 bg-pink-700 hover:bg-pink-600 rounded text-sm text-left"
                  >
                    <div>👧 어린이 (5-10세)</div>
                    <div className="text-xs opacity-70">+10 반음, 1.15x</div>
                  </button>
                  <button
                    onClick={() => { setPitchShift(0); setTimeStretch(1.0); }}
                    className="py-2 px-3 bg-blue-700 hover:bg-blue-600 rounded text-sm text-left"
                  >
                    <div>👨 성인 남성</div>
                    <div className="text-xs opacity-70">기준 (0, 1.0x)</div>
                  </button>
                  <button
                    onClick={() => { setPitchShift(6); setTimeStretch(1.05); }}
                    className="py-2 px-3 bg-purple-700 hover:bg-purple-600 rounded text-sm text-left"
                  >
                    <div>👩 성인 여성</div>
                    <div className="text-xs opacity-70">+6 반음, 1.05x</div>
                  </button>
                  <button
                    onClick={() => { setPitchShift(-3); setTimeStretch(0.85); }}
                    className="py-2 px-3 bg-gray-600 hover:bg-gray-500 rounded text-sm text-left"
                  >
                    <div>🧓 노인 남성</div>
                    <div className="text-xs opacity-70">-3 반음, 0.85x</div>
                  </button>
                  <button
                    onClick={() => { setPitchShift(3); setTimeStretch(0.9); }}
                    className="py-2 px-3 bg-amber-700 hover:bg-amber-600 rounded text-sm text-left"
                  >
                    <div>👵 노인 여성</div>
                    <div className="text-xs opacity-70">+3 반음, 0.9x</div>
                  </button>
                  <button
                    onClick={() => { setPitchShift(8); setTimeStretch(1.2); }}
                    className="py-2 px-3 bg-cyan-700 hover:bg-cyan-600 rounded text-sm text-left"
                  >
                    <div>👶 유아 (3-5세)</div>
                    <div className="text-xs opacity-70">+8 반음, 1.2x</div>
                  </button>
                </div>
                <div className="mt-3 text-xs text-gray-500 p-2 bg-gray-800 rounded">
                  💡 <span className="text-gray-400">팁:</span> 남녀 음역 차이는 약 +5~7 반음,
                  어린이는 +8~12 반음이 일반적입니다. 노인은 속도가 느려지고
                  남성은 음역이 살짝 높아지는 경향이 있습니다.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-gray-900 rounded">
            <div className="font-medium text-gray-300 mb-2">Data Augmentation의 중요성</div>
            <div className="text-sm text-gray-400 space-y-2">
              <p>
                음성 데이터셋은 수집 비용이 높습니다. Augmentation으로 데이터 다양성을 확보합니다.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <ul className="space-y-1">
                  <li>• <span className="text-primary">Pitch Shift</span>: 다양한 화자 시뮬레이션</li>
                  <li>• <span className="text-secondary">Time Stretch</span>: 다양한 발화 속도</li>
                </ul>
                <ul className="space-y-1">
                  <li>• <span className="text-yellow-400">Noise Injection</span>: 다양한 환경</li>
                  <li>• <span className="text-green-400">Room Simulation</span>: 잔향 효과</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Advanced Lab - 최신 기술 체험
// ============================================
function AdvancedLab() {
  // 음성 감정 인식 (SER) 상태
  const [serRecording, setSerRecording] = useState(false);
  const [serResult, setSerResult] = useState<{
    emotion: string;
    confidence: number;
    features: { energy: number; pitch: number; speed: number };
  } | null>(null);
  const serMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const serAudioChunksRef = useRef<Blob[]>([]);

  // 화자 분리 데모 상태
  const [diarizationPlaying, setDiarizationPlaying] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<number | null>(null);
  const [diarizationMfcc, setDiarizationMfcc] = useState<{
    speaker1: VoiceFeatures | null;
    speaker2: VoiceFeatures | null;
    currentMfcc: number[] | null;
  }>({ speaker1: null, speaker2: null, currentMfcc: null });

  // 음성 인증 상태
  const [authStep, setAuthStep] = useState<'idle' | 'enrolling' | 'enrolled' | 'verifying' | 'result'>('idle');
  const [authResult, setAuthResult] = useState<{ match: boolean; score: number } | null>(null);
  const [enrolledVoice, setEnrolledVoice] = useState<Float32Array | null>(null);
  const authMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const authAudioChunksRef = useRef<Blob[]>([]);

  // Edge vs Cloud 상태
  const [processingMode, setProcessingMode] = useState<'edge' | 'cloud'>('edge');
  const [latencyDemo, setLatencyDemo] = useState<{
    edge: number;
    cloud: number;
    edgeResult?: string;
    cloudResult?: string;
    dataSize?: number;
  } | null>(null);
  const [edgeCloudTesting, setEdgeCloudTesting] = useState(false);

  // SER 녹음 시작
  const startSerRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      serMediaRecorderRef.current = mediaRecorder;
      serAudioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        serAudioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(serAudioChunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // 간단한 특성 분석
        const data = audioBuffer.getChannelData(0);
        let energy = 0;
        let zeroCrossings = 0;

        for (let i = 0; i < data.length; i++) {
          energy += data[i] * data[i];
          if (i > 0 && ((data[i] >= 0 && data[i-1] < 0) || (data[i] < 0 && data[i-1] >= 0))) {
            zeroCrossings++;
          }
        }

        energy = Math.sqrt(energy / data.length);
        const pitch = zeroCrossings / (audioBuffer.duration * 2); // 대략적인 피치 추정
        const speed = zeroCrossings / 1000;

        // 감정 추정 (시뮬레이션)
        let emotion = '중립';
        let confidence = 0.7;

        if (energy > 0.1 && pitch > 200) {
          emotion = '기쁨/흥분';
          confidence = 0.75 + Math.random() * 0.2;
        } else if (energy > 0.1 && pitch < 150) {
          emotion = '분노';
          confidence = 0.7 + Math.random() * 0.2;
        } else if (energy < 0.05) {
          emotion = '슬픔';
          confidence = 0.65 + Math.random() * 0.2;
        } else {
          emotion = '중립';
          confidence = 0.8 + Math.random() * 0.15;
        }

        setSerResult({
          emotion,
          confidence,
          features: {
            energy: Math.min(100, energy * 500),
            pitch: Math.min(100, pitch / 3),
            speed: Math.min(100, speed * 20)
          }
        });

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setSerRecording(true);
      setSerResult(null);
    } catch (err) {
      console.error('녹음 시작 실패:', err);
    }
  };

  const stopSerRecording = () => {
    if (serMediaRecorderRef.current && serRecording) {
      serMediaRecorderRef.current.stop();
      setSerRecording(false);
    }
  };

  // 화자 분리 데모 - TTS 기반 음성 특성 시각화
  const diarizationScript = [
    { speaker: 1, text: '안녕하세요, 오늘 회의를 시작하겠습니다.', pitch: 0.8, rate: 0.95 },
    { speaker: 2, text: '네, 준비됐습니다.', pitch: 1.3, rate: 1.05 },
    { speaker: 1, text: '먼저 지난주 진행 상황을 공유해주세요.', pitch: 0.8, rate: 0.95 },
    { speaker: 2, text: '네, 기능 개발이 80% 완료되었습니다.', pitch: 1.3, rate: 1.05 },
    { speaker: 1, text: '좋습니다. 다음 단계는 무엇인가요?', pitch: 0.8, rate: 0.95 },
    { speaker: 2, text: '테스트와 문서화가 남았습니다.', pitch: 1.3, rate: 1.05 },
  ];

  // 화자별 음성 특성 (시뮬레이션 값 + MFCC 기반)
  const speakerProfiles = {
    1: {
      name: '화자 A (남성)',
      pitch: 0.8,
      pitchHz: '~120Hz',
      color: 'blue',
      energy: 65,
      speed: '느림',
      // 시뮬레이션된 MFCC 특성 (실제 남성 음성의 전형적 패턴)
      mfccPattern: [-5.2, 12.3, -8.1, 4.2, -2.1, 1.8, -0.9, 0.5, -0.3, 0.2, -0.1, 0.1, 0.0]
    },
    2: {
      name: '화자 B (여성)',
      pitch: 1.3,
      pitchHz: '~220Hz',
      color: 'green',
      energy: 75,
      speed: '빠름',
      // 시뮬레이션된 MFCC 특성 (실제 여성 음성의 전형적 패턴)
      mfccPattern: [-3.8, 15.1, -6.2, 5.8, -3.2, 2.4, -1.2, 0.8, -0.5, 0.4, -0.2, 0.2, 0.1]
    },
  };

  const playDiarization = async () => {
    if (diarizationPlaying) return;
    setDiarizationPlaying(true);
    setCurrentSpeaker(null);
    setDiarizationMfcc({ speaker1: null, speaker2: null, currentMfcc: null });

    for (let i = 0; i < diarizationScript.length; i++) {
      const line = diarizationScript[i];
      setCurrentSpeaker(i);

      // 현재 화자의 MFCC 패턴 표시 (약간의 변동 추가)
      const profile = speakerProfiles[line.speaker as keyof typeof speakerProfiles];
      const currentMfcc = profile.mfccPattern.map(v => v + (Math.random() - 0.5) * 2);
      setDiarizationMfcc(prev => ({
        ...prev,
        currentMfcc,
        [`speaker${line.speaker}`]: {
          avgPitch: line.speaker === 1 ? 120 : 220,
          avgEnergy: profile.energy,
          avgZCR: line.speaker === 1 ? 0.05 : 0.08,
          mfccMean: new Float32Array(currentMfcc),
          mfccStd: new Float32Array(13).fill(1),
        }
      }));

      // TTS로 해당 화자 음성 재생
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(line.text);
        utterance.lang = 'ko-KR';
        utterance.pitch = line.pitch;
        utterance.rate = line.rate;
        utterance.volume = 0.8;

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();

        speechSynthesis.speak(utterance);
      });

      // 다음 발화 전 짧은 간격
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setDiarizationPlaying(false);
    setCurrentSpeaker(null);
  };

  const stopDiarization = () => {
    speechSynthesis.cancel();
    setDiarizationPlaying(false);
    setCurrentSpeaker(null);
    setDiarizationMfcc({ speaker1: null, speaker2: null, currentMfcc: null });
  };

  // 음성 인증 등록
  const startEnrollment = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      authMediaRecorderRef.current = mediaRecorder;
      authAudioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        authAudioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(authAudioChunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // 음성 특성 저장 (시뮬레이션)
        setEnrolledVoice(audioBuffer.getChannelData(0).slice(0, 10000));
        setAuthStep('enrolled');
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setAuthStep('enrolling');
    } catch (err) {
      console.error('등록 시작 실패:', err);
      setAuthStep('idle');
    }
  };

  const stopEnrollment = () => {
    if (authMediaRecorderRef.current && authStep === 'enrolling') {
      authMediaRecorderRef.current.stop();
    }
  };

  // 음성 인증 검증
  const startVerification = async () => {
    if (!enrolledVoice) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      authMediaRecorderRef.current = mediaRecorder;
      authAudioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        authAudioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(authAudioChunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // 간단한 유사도 계산 (시뮬레이션)
        const verifyData = audioBuffer.getChannelData(0).slice(0, 10000);
        let similarity = 0;
        const length = Math.min(enrolledVoice.length, verifyData.length);

        for (let i = 0; i < length; i++) {
          similarity += 1 - Math.abs(enrolledVoice[i] - verifyData[i]);
        }
        similarity = (similarity / length) * 0.5 + Math.random() * 0.5; // 시뮬레이션을 위한 랜덤 요소

        const score = Math.min(100, Math.max(0, similarity * 100));
        setAuthResult({ match: score > 60, score });
        setAuthStep('result');
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setAuthStep('verifying');
    } catch (err) {
      console.error('인증 시작 실패:', err);
      setAuthStep('enrolled');
    }
  };

  const stopVerification = () => {
    if (authMediaRecorderRef.current && authStep === 'verifying') {
      authMediaRecorderRef.current.stop();
    }
  };

  // Edge vs Cloud 데모 - 실제 Web Speech API로 측정
  const runLatencyDemo = async () => {
    if (edgeCloudTesting) return;
    setEdgeCloudTesting(true);
    setLatencyDemo(null);

    try {
      // Edge 처리 시간 측정 (Web Speech API = 브라우저 내장 = Edge)
      const edgeStartTime = performance.now();

      // Web Speech API로 음성 인식 시작 (짧은 테스트)
      const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.lang = 'ko-KR';
      recognition.continuous = false;
      recognition.interimResults = true;

      let edgeResult = '';
      let edgeFirstResultTime = 0;

      const edgePromise = new Promise<{ latency: number; result: string }>((resolve) => {
        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          if (edgeFirstResultTime === 0) {
            edgeFirstResultTime = performance.now();
          }
          edgeResult = transcript;
        };

        recognition.onend = () => {
          const edgeLatency = edgeFirstResultTime > 0 ? edgeFirstResultTime - edgeStartTime : 50;
          resolve({ latency: edgeLatency, result: edgeResult || '(인식된 음성 없음)' });
        };

        recognition.onerror = () => {
          resolve({ latency: 50, result: '(오류 발생)' });
        };

        // 3초 후 자동 종료
        setTimeout(() => {
          recognition.stop();
        }, 3000);
      });

      recognition.start();

      const edgeData = await edgePromise;

      // Cloud 시뮬레이션 (네트워크 왕복 시간 추가)
      // 실제 Cloud STT는 네트워크 전송 + 서버 처리 + 응답 시간이 추가됨
      const networkLatency = 80 + Math.random() * 120; // 네트워크 왕복: 80-200ms
      const serverProcessing = 50 + Math.random() * 100; // 서버 처리: 50-150ms
      const cloudLatency = edgeData.latency + networkLatency + serverProcessing;

      // 데이터 크기 계산 (3초 오디오, 16kHz, 16bit mono)
      const audioDataSize = 3 * 16000 * 2; // ~96KB

      setLatencyDemo({
        edge: edgeData.latency,
        cloud: cloudLatency,
        edgeResult: edgeData.result,
        cloudResult: edgeData.result, // 같은 결과로 가정
        dataSize: audioDataSize,
      });
    } catch {
      // Web Speech API 미지원 시 시뮬레이션
      const edgeLatency = 30 + Math.random() * 40;
      const cloudLatency = 150 + Math.random() * 200;
      setLatencyDemo({
        edge: edgeLatency,
        cloud: cloudLatency,
        edgeResult: '(브라우저 미지원)',
        cloudResult: '(브라우저 미지원)',
        dataSize: 96000,
      });
    } finally {
      setEdgeCloudTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Gauge className="w-6 h-6 text-primary" />
        Advanced Lab - 최신 기술 체험
      </h2>

      <p className="text-gray-400 text-sm">
        음성 AI의 최신 응용 분야를 체험합니다: 감정 인식, 화자 분리, 음성 인증, Edge AI
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 음성 감정 인식 (SER) */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            😊 음성 감정 인식 (SER)
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            음성의 톤, 에너지, 속도를 분석하여 감정을 추정합니다.
          </p>

          <div className="space-y-4">
            <div className="flex gap-2">
              {!serRecording ? (
                <button
                  onClick={startSerRecording}
                  data-testid="ser-record-btn"
                  className="flex-1 bg-primary hover:bg-primary/80 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Mic className="w-4 h-4" />
                  감정 분석 녹음
                </button>
              ) : (
                <button
                  onClick={stopSerRecording}
                  data-testid="ser-stop-btn"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 animate-pulse"
                >
                  <Square className="w-4 h-4" />
                  분석 완료
                </button>
              )}
            </div>

            {serResult && (
              <div className="p-4 bg-gray-900 rounded-lg space-y-3" data-testid="ser-result">
                <div className="text-center">
                  <div className="text-3xl mb-1">
                    {serResult.emotion === '기쁨/흥분' ? '😊' :
                     serResult.emotion === '분노' ? '😠' :
                     serResult.emotion === '슬픔' ? '😢' : '😐'}
                  </div>
                  <div className="text-lg font-bold text-primary">{serResult.emotion}</div>
                  <div className="text-sm text-gray-400">신뢰도: {(serResult.confidence * 100).toFixed(0)}%</div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">에너지</span>
                    <span>{serResult.features.energy.toFixed(0)}%</span>
                  </div>
                  <div className="bg-gray-700 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full" style={{ width: `${serResult.features.energy}%` }} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">피치</span>
                    <span>{serResult.features.pitch.toFixed(0)}%</span>
                  </div>
                  <div className="bg-gray-700 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${serResult.features.pitch}%` }} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">속도</span>
                    <span>{serResult.features.speed.toFixed(0)}%</span>
                  </div>
                  <div className="bg-gray-700 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: `${serResult.features.speed}%` }} />
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-gray-500">
              💡 기쁨/흥분: 높은 에너지 + 높은 피치 / 슬픔: 낮은 에너지
            </div>
          </div>
        </div>

        {/* 화자 분리 (Diarization) */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            👥 화자 분리 (Diarization)
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            음성의 <strong className="text-white">음높이(F0)</strong>와 <strong className="text-white">말하기 속도</strong> 등의 특성으로 화자를 구분합니다.
            TTS로 두 화자를 시뮬레이션하며, 실시간으로 어떤 특성이 다른지 확인하세요.
          </p>

          {/* 화자 프로필 비교 */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {Object.entries(speakerProfiles).map(([id, profile]) => {
              const speakerId = parseInt(id);
              const isActive = currentSpeaker !== null && diarizationScript[currentSpeaker]?.speaker === speakerId;
              return (
                <div
                  key={id}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    isActive
                      ? profile.color === 'blue'
                        ? 'border-blue-500 bg-blue-500/20 shadow-lg shadow-blue-500/30'
                        : 'border-green-500 bg-green-500/20 shadow-lg shadow-green-500/30'
                      : 'border-gray-600 bg-gray-900'
                  }`}
                >
                  <div className={`font-medium text-sm mb-2 ${profile.color === 'blue' ? 'text-blue-400' : 'text-green-400'}`}>
                    {isActive && <span className="animate-pulse mr-1">🎤</span>}
                    {profile.name}
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">음높이 (F0)</span>
                      <span className={isActive ? 'text-white font-bold' : 'text-gray-400'}>{profile.pitchHz}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">말하기 속도</span>
                      <span className={isActive ? 'text-white font-bold' : 'text-gray-400'}>{profile.speed}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">에너지</span>
                      <div className="flex items-center gap-1">
                        <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${profile.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'} ${isActive ? 'animate-pulse' : ''}`}
                            style={{ width: `${profile.energy}%` }}
                          />
                        </div>
                        <span className={isActive ? 'text-white' : 'text-gray-400'}>{profile.energy}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 버튼 */}
          <div className="flex gap-2 mb-4">
            {!diarizationPlaying ? (
              <button
                onClick={playDiarization}
                data-testid="diarization-play-btn"
                className="flex-1 bg-secondary hover:bg-secondary/80 text-white py-2 px-4 rounded-lg transition-colors"
              >
                🎧 화자 분리 데모 시작
              </button>
            ) : (
              <button
                onClick={stopDiarization}
                data-testid="diarization-stop-btn"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors"
              >
                ⏹️ 정지
              </button>
            )}
          </div>

          {/* 대화 스크립트 */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {diarizationScript.map((line, idx) => {
              const profile = speakerProfiles[line.speaker as keyof typeof speakerProfiles];
              const isActive = currentSpeaker === idx;
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg transition-all ${
                    isActive
                      ? profile.color === 'blue'
                        ? 'bg-blue-500/20 ring-2 ring-blue-500'
                        : 'bg-green-500/20 ring-2 ring-green-500'
                      : 'bg-gray-900'
                  }`}
                >
                  <div className={`text-xs font-medium mb-1 ${profile.color === 'blue' ? 'text-blue-400' : 'text-green-400'}`}>
                    {profile.name} {isActive && <span className="text-white">(현재 발화 중)</span>}
                  </div>
                  <div className="text-sm">{line.text}</div>
                  {isActive && (
                    <div className="mt-2 text-xs text-gray-500">
                      → pitch: {line.pitch}, rate: {line.rate} 로 구분됨
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* MFCC 시각화 */}
          {diarizationMfcc.currentMfcc && (
            <div className="mt-4 p-3 bg-gray-900 rounded-lg" data-testid="mfcc-visualization">
              <div className="text-xs text-gray-300 mb-2 flex items-center gap-2">
                <span className="font-medium">MFCC 특징 벡터</span>
                <span className="text-gray-500">(13차원)</span>
              </div>
              <div className="flex items-end gap-1 h-16">
                {diarizationMfcc.currentMfcc.map((value, idx) => {
                  // MFCC 값을 0-100% 높이로 정규화 (-20 ~ 20 범위 가정)
                  const normalizedHeight = Math.min(100, Math.max(5, ((value + 20) / 40) * 100));
                  const currentProfile = currentSpeaker !== null
                    ? speakerProfiles[diarizationScript[currentSpeaker]?.speaker as keyof typeof speakerProfiles]
                    : null;
                  const barColor = currentProfile?.color === 'blue' ? 'bg-blue-500' : 'bg-green-500';
                  return (
                    <div
                      key={idx}
                      className="flex-1 flex flex-col items-center"
                    >
                      <div
                        className={`w-full ${barColor} rounded-t transition-all duration-150`}
                        style={{ height: `${normalizedHeight}%` }}
                        title={`C${idx}: ${value.toFixed(2)}`}
                      />
                      <span className="text-[8px] text-gray-600 mt-1">{idx}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-[10px] text-gray-500">
                💡 MFCC: 음성의 주파수 특성을 압축한 벡터. 화자마다 패턴이 다릅니다.
              </div>
            </div>
          )}

          {/* 화자 MFCC 비교 */}
          {(diarizationMfcc.speaker1 || diarizationMfcc.speaker2) && !diarizationMfcc.currentMfcc && (
            <div className="mt-4 p-3 bg-gray-900 rounded-lg">
              <div className="text-xs text-gray-300 mb-2">📊 화자별 MFCC 평균 비교</div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                {diarizationMfcc.speaker1 && (
                  <div className="text-blue-400">
                    화자 A: 평균 F0 ~{diarizationMfcc.speaker1.avgPitch.toFixed(0)}Hz
                  </div>
                )}
                {diarizationMfcc.speaker2 && (
                  <div className="text-green-400">
                    화자 B: 평균 F0 ~{diarizationMfcc.speaker2.avgPitch.toFixed(0)}Hz
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 설명 */}
          <div className="mt-4 p-3 bg-gray-900 rounded-lg text-xs text-gray-400">
            <strong className="text-gray-300">화자 분리 원리:</strong> 실제 시스템은 MFCC(Mel-Frequency Cepstral Coefficients)를
            추출하여 화자별 음성 특징을 벡터로 표현합니다. 같은 화자는 유사한 MFCC 패턴을, 다른 화자는
            다른 패턴을 보입니다. 이 데모에서는 음높이와 속도 차이에 따른 MFCC 변화를 시각화합니다.
          </div>
        </div>

        {/* 음성 인증 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            🔐 음성 인증 (Voice Authentication)
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            목소리로 본인 확인을 합니다. 등록 → 인증 플로우를 체험하세요.
          </p>

          <div className="space-y-4">
            {/* 단계 표시 */}
            <div className="flex justify-between text-sm">
              <div className={`flex items-center gap-1 ${authStep !== 'idle' ? 'text-primary' : 'text-gray-500'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  authStep !== 'idle' ? 'bg-primary' : 'bg-gray-700'
                }`}>1</span>
                등록
              </div>
              <div className="flex-1 border-t border-gray-600 mx-2 self-center" />
              <div className={`flex items-center gap-1 ${['verifying', 'result'].includes(authStep) ? 'text-secondary' : 'text-gray-500'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  ['verifying', 'result'].includes(authStep) ? 'bg-secondary' : 'bg-gray-700'
                }`}>2</span>
                인증
              </div>
              <div className="flex-1 border-t border-gray-600 mx-2 self-center" />
              <div className={`flex items-center gap-1 ${authStep === 'result' ? 'text-green-400' : 'text-gray-500'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  authStep === 'result' ? 'bg-green-500' : 'bg-gray-700'
                }`}>3</span>
                결과
              </div>
            </div>

            {/* 등록 단계 */}
            {(authStep === 'idle' || authStep === 'enrolling') && (
              <div className="space-y-2">
                {authStep === 'idle' ? (
                  <button
                    onClick={startEnrollment}
                    data-testid="auth-enroll-btn"
                    className="w-full bg-primary hover:bg-primary/80 text-white py-2 px-4 rounded-lg transition-colors"
                  >
                    목소리 등록 시작
                  </button>
                ) : (
                  <button
                    onClick={stopEnrollment}
                    data-testid="auth-enroll-stop-btn"
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors animate-pulse"
                  >
                    등록 완료
                  </button>
                )}
                <p className="text-xs text-gray-500 text-center">
                  "안녕하세요, 제 목소리로 인증합니다" 라고 말하세요
                </p>
              </div>
            )}

            {/* 인증 단계 */}
            {(authStep === 'enrolled' || authStep === 'verifying') && (
              <div className="space-y-2">
                <div className="p-3 bg-green-900/20 border border-green-700/50 rounded text-sm text-center">
                  ✅ 목소리가 등록되었습니다
                </div>
                {authStep === 'enrolled' ? (
                  <button
                    onClick={startVerification}
                    data-testid="auth-verify-btn"
                    className="w-full bg-secondary hover:bg-secondary/80 text-white py-2 px-4 rounded-lg transition-colors"
                  >
                    본인 인증 시작
                  </button>
                ) : (
                  <button
                    onClick={stopVerification}
                    data-testid="auth-verify-stop-btn"
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors animate-pulse"
                  >
                    인증 완료
                  </button>
                )}
              </div>
            )}

            {/* 결과 */}
            {authStep === 'result' && authResult && (
              <div className={`p-4 rounded-lg text-center ${
                authResult.match ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'
              }`} data-testid="auth-result">
                <div className="text-2xl mb-2">{authResult.match ? '✅' : '❌'}</div>
                <div className={`font-bold ${authResult.match ? 'text-green-400' : 'text-red-400'}`}>
                  {authResult.match ? '인증 성공!' : '인증 실패'}
                </div>
                <div className="text-sm text-gray-400">유사도: {authResult.score.toFixed(0)}%</div>
                <button
                  onClick={() => { setAuthStep('idle'); setEnrolledVoice(null); setAuthResult(null); }}
                  className="mt-3 text-sm text-gray-400 hover:text-white"
                >
                  다시 시작
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Edge vs Cloud */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            ⚡ Edge vs Cloud 비교
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            음성 처리를 어디서 할지에 따라 지연 시간과 개인정보 보호가 달라집니다.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              onClick={() => setProcessingMode('edge')}
              data-testid="mode-edge"
              className={`p-4 rounded-lg text-left transition-all ${
                processingMode === 'edge' ? 'bg-primary/20 border-2 border-primary' : 'bg-gray-900 border border-gray-700'
              }`}
            >
              <div className="font-medium mb-1">📱 Edge (온디바이스)</div>
              <div className="text-xs text-gray-400">기기에서 직접 처리</div>
            </button>
            <button
              onClick={() => setProcessingMode('cloud')}
              data-testid="mode-cloud"
              className={`p-4 rounded-lg text-left transition-all ${
                processingMode === 'cloud' ? 'bg-secondary/20 border-2 border-secondary' : 'bg-gray-900 border border-gray-700'
              }`}
            >
              <div className="font-medium mb-1">☁️ Cloud (서버)</div>
              <div className="text-xs text-gray-400">서버에서 처리</div>
            </button>
          </div>

          <button
            onClick={runLatencyDemo}
            disabled={edgeCloudTesting}
            data-testid="latency-test-btn"
            className={`w-full py-2 px-4 rounded-lg transition-colors mb-4 flex items-center justify-center gap-2 ${
              edgeCloudTesting
                ? 'bg-red-600 text-white animate-pulse cursor-not-allowed'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            {edgeCloudTesting ? (
              <>
                <Mic className="w-4 h-4" />
                🎤 음성 인식 중... (3초)
              </>
            ) : (
              '🎯 실시간 지연 시간 테스트'
            )}
          </button>

          {edgeCloudTesting && (
            <div className="p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg text-sm text-center mb-4">
              💡 마이크에 아무 말이나 해보세요! 실제 STT 응답 시간을 측정합니다.
            </div>
          )}

          {latencyDemo && (
            <div className="space-y-3 p-4 bg-gray-900 rounded-lg" data-testid="latency-result">
              {/* 인식 결과 */}
              {latencyDemo.edgeResult && (
                <div className="pb-3 border-b border-gray-700">
                  <div className="text-xs text-gray-500 mb-1">인식된 텍스트:</div>
                  <div className="text-sm text-white">{latencyDemo.edgeResult}</div>
                </div>
              )}

              {/* 지연 시간 비교 */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    Edge (Web Speech API)
                  </span>
                  <span className="text-green-400 font-bold">{latencyDemo.edge.toFixed(0)}ms</span>
                </div>
                <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (latencyDemo.edge / latencyDemo.cloud) * 100)}%` }}
                  />
                </div>

                <div className="flex justify-between items-center mt-2">
                  <span className="text-gray-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                    Cloud (네트워크 포함)
                  </span>
                  <span className="text-yellow-400 font-bold">{latencyDemo.cloud.toFixed(0)}ms</span>
                </div>
                <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>

              {/* 데이터 크기 */}
              {latencyDemo.dataSize && (
                <div className="pt-3 border-t border-gray-700 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>전송 데이터:</span>
                    <span>{(latencyDemo.dataSize / 1024).toFixed(0)} KB</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Edge 이점:</span>
                    <span className="text-green-400 font-medium">
                      {(latencyDemo.cloud / latencyDemo.edge).toFixed(1)}배 빠름
                    </span>
                  </div>
                </div>
              )}

              {/* 분석 설명 */}
              <div className="pt-3 border-t border-gray-700 text-[10px] text-gray-500">
                📊 Edge: 브라우저 내장 STT 사용 | Cloud: 네트워크 왕복(~150ms) + 서버 처리 시뮬레이션
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-gray-900 rounded">
              <div className="font-medium text-primary mb-2">Edge 장점</div>
              <ul className="text-gray-400 space-y-1">
                <li>• 빠른 응답 (20-50ms)</li>
                <li>• 오프라인 작동</li>
                <li>• 개인정보 보호</li>
              </ul>
            </div>
            <div className="p-3 bg-gray-900 rounded">
              <div className="font-medium text-secondary mb-2">Cloud 장점</div>
              <ul className="text-gray-400 space-y-1">
                <li>• 높은 정확도</li>
                <li>• 대용량 모델</li>
                <li>• 쉬운 업데이트</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 최신 기술 트렌드 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="font-medium mb-4">2024 음성 AI 트렌드</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-900 rounded-lg">
            <div className="text-lg mb-2">🎯 VALL-E</div>
            <div className="text-sm text-gray-400">
              3초 샘플로 목소리 복제
            </div>
            <div className="text-xs text-primary mt-2">Zero-shot TTS</div>
          </div>
          <div className="p-4 bg-gray-900 rounded-lg">
            <div className="text-lg mb-2">🌊 Diffusion TTS</div>
            <div className="text-sm text-gray-400">
              이미지 생성 기술의 음성 적용
            </div>
            <div className="text-xs text-secondary mt-2">고품질 합성</div>
          </div>
          <div className="p-4 bg-gray-900 rounded-lg">
            <div className="text-lg mb-2">⚡ GPT Realtime API</div>
            <div className="text-sm text-gray-400">
              실시간 음성 대화 AI
            </div>
            <div className="text-xs text-yellow-400 mt-2">End-to-End</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
