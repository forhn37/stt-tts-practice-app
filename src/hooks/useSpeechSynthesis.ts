import { useState, useCallback, useEffect } from 'react';

interface SpeechSynthesisState {
  isSpeaking: boolean;
  isPaused: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  volume: number;
  error: string | null;
}

export function useSpeechSynthesis() {
  const [state, setState] = useState<SpeechSynthesisState>({
    isSpeaking: false,
    isPaused: false,
    voices: [],
    selectedVoice: null,
    rate: 1,
    pitch: 1,
    volume: 1,
    error: null,
  });

  // 음성 목록 로드
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      
      // 한국어 음성 우선 정렬
      const sortedVoices = [...availableVoices].sort((a, b) => {
        const aIsKorean = a.lang.includes('ko');
        const bIsKorean = b.lang.includes('ko');
        if (aIsKorean && !bIsKorean) return -1;
        if (!aIsKorean && bIsKorean) return 1;
        return a.name.localeCompare(b.name);
      });
      
      setState(prev => ({ ...prev, voices: sortedVoices }));
      
      // 한국어 음성 기본 선택
      const koreanVoice = sortedVoices.find(v => v.lang.includes('ko'));
      if (koreanVoice) {
        setState(prev => {
          if (!prev.selectedVoice) {
            return { ...prev, selectedVoice: koreanVoice };
          }
          return prev;
        });
      }
    };

    loadVoices();

    // Chrome에서는 voiceschanged 이벤트로 음성 목록 로드
    speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // options로 일회성 설정을 전달 가능 (파이프라인 데모 등에서 사용)
  const speak = useCallback((text: string, options?: { rate?: number; pitch?: number; volume?: number }) => {
    if (!text.trim()) {
      setState(prev => ({ ...prev, error: '읽을 텍스트를 입력해주세요.' }));
      return;
    }

    // 이전 발화 취소
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = state.selectedVoice?.lang || 'ko-KR';
    // options가 있으면 해당 값 사용, 없으면 상태값 사용
    utterance.rate = options?.rate ?? state.rate;
    utterance.pitch = options?.pitch ?? state.pitch;
    utterance.volume = options?.volume ?? state.volume;

    if (state.selectedVoice) {
      utterance.voice = state.selectedVoice;
    }

    utterance.onstart = () => {
      setState(prev => ({ ...prev, isSpeaking: true, isPaused: false, error: null }));
    };

    utterance.onend = () => {
      setState(prev => ({ ...prev, isSpeaking: false, isPaused: false }));
    };

    utterance.onerror = (event) => {
      let errorMessage = '음성 합성 중 오류가 발생했습니다.';
      if (event.error === 'canceled') {
        // 취소는 오류로 처리하지 않음
        setState(prev => ({ ...prev, isSpeaking: false, isPaused: false }));
        return;
      }
      setState(prev => ({ 
        ...prev, 
        isSpeaking: false, 
        isPaused: false,
        error: errorMessage,
      }));
    };

    utterance.onpause = () => {
      setState(prev => ({ ...prev, isPaused: true }));
    };

    utterance.onresume = () => {
      setState(prev => ({ ...prev, isPaused: false }));
    };

    speechSynthesis.speak(utterance);
  }, [state.selectedVoice, state.rate, state.pitch, state.volume]);

  const stop = useCallback(() => {
    speechSynthesis.cancel();
    setState(prev => ({ ...prev, isSpeaking: false, isPaused: false }));
  }, []);

  const pause = useCallback(() => {
    speechSynthesis.pause();
  }, []);

  const resume = useCallback(() => {
    speechSynthesis.resume();
  }, []);

  const setVoice = useCallback((voice: SpeechSynthesisVoice) => {
    setState(prev => ({ ...prev, selectedVoice: voice }));
  }, []);

  const setRate = useCallback((rate: number) => {
    setState(prev => ({ ...prev, rate: Math.max(0.1, Math.min(10, rate)) }));
  }, []);

  const setPitch = useCallback((pitch: number) => {
    setState(prev => ({ ...prev, pitch: Math.max(0, Math.min(2, pitch)) }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    setState(prev => ({ ...prev, volume: Math.max(0, Math.min(1, volume)) }));
  }, []);

  // 한국어 음성만 필터링
  const koreanVoices = state.voices.filter(v => v.lang.includes('ko'));
  
  // 영어 음성만 필터링
  const englishVoices = state.voices.filter(v => v.lang.includes('en'));

  return {
    ...state,
    speak,
    stop,
    pause,
    resume,
    setVoice,
    setRate,
    setPitch,
    setVolume,
    koreanVoices,
    englishVoices,
  };
}
