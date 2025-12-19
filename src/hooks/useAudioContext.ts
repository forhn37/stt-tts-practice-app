import { useRef, useState, useCallback } from 'react';

interface AudioContextState {
  isRecording: boolean;
  isSupported: boolean;
  error: string | null;
}

export function useAudioContext() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [state, setState] = useState<AudioContextState>({
    isRecording: false,
    isSupported: typeof AudioContext !== 'undefined',
    error: null,
  });

  const startRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));
      
      // 마이크 권한 요청
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      streamRef.current = stream;
      
      // AudioContext 생성
      audioContextRef.current = new AudioContext();
      
      // AnalyserNode 생성 및 설정
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      // 마이크 입력 연결
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
      
      setState(prev => ({ ...prev, isRecording: true }));
      
      return { 
        analyser: analyserRef.current, 
        audioContext: audioContextRef.current 
      };
    } catch (error) {
      let errorMessage = '마이크 접근에 실패했습니다.';
      
      if (error instanceof DOMException) {
        switch (error.name) {
          case 'NotAllowedError':
            errorMessage = '마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.';
            break;
          case 'NotFoundError':
            errorMessage = '마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.';
            break;
          case 'NotReadableError':
            errorMessage = '마이크를 사용할 수 없습니다. 다른 앱에서 사용 중인지 확인해주세요.';
            break;
        }
      }
      
      setState(prev => ({ ...prev, error: errorMessage }));
      throw new Error(errorMessage);
    }
  }, []);

  const stopRecording = useCallback(() => {
    // 스트림 트랙 정지
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // 소스 연결 해제
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    
    // AudioContext 닫기
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    
    setState(prev => ({ ...prev, isRecording: false }));
  }, []);

  // 파형 데이터 가져오기 (시간 도메인)
  const getWaveformData = useCallback((): Uint8Array | null => {
    if (!analyserRef.current) return null;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);
    
    return dataArray;
  }, []);

  // 주파수 데이터 가져오기 (FFT)
  const getFrequencyData = useCallback((): Uint8Array | null => {
    if (!analyserRef.current) return null;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    return dataArray;
  }, []);

  // 현재 볼륨 레벨 가져오기 (0-100)
  const getVolumeLevel = useCallback((): number => {
    const data = getWaveformData();
    if (!data) return 0;
    
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const value = (data[i] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / data.length);
    
    return Math.min(100, Math.round(rms * 200));
  }, [getWaveformData]);

  return {
    ...state,
    startRecording,
    stopRecording,
    getWaveformData,
    getFrequencyData,
    getVolumeLevel,
    analyser: analyserRef.current,
    audioContext: audioContextRef.current,
  };
}
