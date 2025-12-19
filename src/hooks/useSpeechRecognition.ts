import { useState, useCallback, useRef, useEffect } from 'react';

export interface SpeechResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
}

interface SpeechRecognitionState {
  isListening: boolean;
  isSupported: boolean;
  error: string | null;
  results: SpeechResult[];
  interimResult: string;
}

export function useSpeechRecognition(lang: string = 'ko-KR') {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  
  const [state, setState] = useState<SpeechRecognitionState>({
    isListening: false,
    isSupported: false,
    error: null,
    results: [],
    interimResult: '',
  });

  // 브라우저 지원 확인 및 초기화
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognitionAPI) {
      setState(prev => ({
        ...prev,
        isSupported: false,
        error: '이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.',
      }));
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setState(prev => ({ ...prev, isListening: true, error: null }));
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence;
        
        if (result.isFinal) {
          setState(prev => ({
            ...prev,
            results: [...prev.results, {
              transcript,
              confidence,
              isFinal: true,
              timestamp: Date.now(),
            }],
            interimResult: '',
          }));
        } else {
          interimTranscript += transcript;
        }
      }
      
      if (interimTranscript) {
        setState(prev => ({ ...prev, interimResult: interimTranscript }));
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      let errorMessage = '음성 인식 중 오류가 발생했습니다.';
      
      switch (event.error) {
        case 'not-allowed':
          errorMessage = '마이크 권한이 거부되었습니다.';
          break;
        case 'no-speech':
          errorMessage = '음성이 감지되지 않았습니다.';
          break;
        case 'network':
          errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
          break;
        case 'audio-capture':
          errorMessage = '마이크를 찾을 수 없습니다.';
          break;
      }
      
      setState(prev => ({ 
        ...prev, 
        error: errorMessage,
        isListening: false,
      }));
    };

    recognition.onend = () => {
      setState(prev => ({ ...prev, isListening: false }));
    };

    recognitionRef.current = recognition;
    setState(prev => ({ ...prev, isSupported: true }));

    return () => {
      recognition.stop();
    };
  }, [lang]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    
    setState(prev => ({
      ...prev,
      results: [],
      interimResult: '',
      error: null,
    }));
    
    try {
      recognitionRef.current.start();
    } catch (error) {
      // 이미 시작된 경우 무시
      console.warn('Recognition already started');
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
  }, []);

  const clearResults = useCallback(() => {
    setState(prev => ({
      ...prev,
      results: [],
      interimResult: '',
    }));
  }, []);

  // 전체 텍스트 (확정 + 임시)
  const fullTranscript = state.results
    .map(r => r.transcript)
    .join(' ') + (state.interimResult ? ' ' + state.interimResult : '');

  // 평균 신뢰도
  const averageConfidence = state.results.length > 0
    ? state.results.reduce((sum, r) => sum + r.confidence, 0) / state.results.length
    : 0;

  return {
    ...state,
    startListening,
    stopListening,
    clearResults,
    fullTranscript: fullTranscript.trim(),
    averageConfidence,
  };
}
