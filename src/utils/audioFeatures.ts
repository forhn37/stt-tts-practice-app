/**
 * Audio Feature Extraction - MFCC 계산
 *
 * MFCC (Mel-Frequency Cepstral Coefficients)는 음성 인식에서
 * 가장 널리 사용되는 특징 벡터입니다.
 *
 * 처리 과정:
 * 1. Pre-emphasis (고주파 강조)
 * 2. Framing (프레임 분할)
 * 3. Windowing (해밍 윈도우)
 * 4. FFT (푸리에 변환)
 * 5. Mel Filter Bank (멜 필터 뱅크)
 * 6. Log (로그 변환)
 * 7. DCT (이산 코사인 변환) → MFCC
 */

// Mel 스케일 변환
export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

export function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

// 해밍 윈도우 생성
function hammingWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}

// 간단한 FFT 구현 (교육용)
function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n <= 1) return;

  // Bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // Cooley-Tukey FFT
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (2 * Math.PI) / len;
    const wReal = Math.cos(angle);
    const wImag = -Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curReal = 1;
      let curImag = 0;

      for (let j = 0; j < halfLen; j++) {
        const uReal = real[i + j];
        const uImag = imag[i + j];
        const tReal = curReal * real[i + j + halfLen] - curImag * imag[i + j + halfLen];
        const tImag = curReal * imag[i + j + halfLen] + curImag * real[i + j + halfLen];

        real[i + j] = uReal + tReal;
        imag[i + j] = uImag + tImag;
        real[i + j + halfLen] = uReal - tReal;
        imag[i + j + halfLen] = uImag - tImag;

        const newReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newReal;
      }
    }
  }
}

// Mel 필터 뱅크 생성
function createMelFilterBank(
  numFilters: number,
  fftSize: number,
  sampleRate: number,
  lowFreq: number = 0,
  highFreq?: number
): Float32Array[] {
  highFreq = highFreq || sampleRate / 2;

  const lowMel = hzToMel(lowFreq);
  const highMel = hzToMel(highFreq);

  // Mel 스케일에서 균등하게 분포된 포인트
  const melPoints = new Float32Array(numFilters + 2);
  for (let i = 0; i < numFilters + 2; i++) {
    melPoints[i] = lowMel + (i * (highMel - lowMel)) / (numFilters + 1);
  }

  // Hz로 변환
  const hzPoints = melPoints.map(mel => melToHz(mel));

  // FFT bin으로 변환
  const binPoints = hzPoints.map(hz => Math.floor((fftSize + 1) * hz / sampleRate));

  // 필터 뱅크 생성
  const filterBank: Float32Array[] = [];
  for (let i = 0; i < numFilters; i++) {
    const filter = new Float32Array(fftSize / 2 + 1);

    for (let j = binPoints[i]; j < binPoints[i + 1]; j++) {
      filter[j] = (j - binPoints[i]) / (binPoints[i + 1] - binPoints[i]);
    }
    for (let j = binPoints[i + 1]; j < binPoints[i + 2]; j++) {
      filter[j] = (binPoints[i + 2] - j) / (binPoints[i + 2] - binPoints[i + 1]);
    }

    filterBank.push(filter);
  }

  return filterBank;
}

// DCT (Type-II)
function dct(input: Float32Array, numCoeffs: number): Float32Array {
  const n = input.length;
  const output = new Float32Array(numCoeffs);

  for (let k = 0; k < numCoeffs; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += input[i] * Math.cos((Math.PI * k * (2 * i + 1)) / (2 * n));
    }
    output[k] = sum;
  }

  return output;
}

export interface MFCCResult {
  mfcc: Float32Array[];      // MFCC coefficients per frame
  melSpectrogram: Float32Array[]; // Mel spectrogram (for visualization)
  energy: number[];          // Energy per frame
  zeroCrossingRate: number[]; // Zero crossing rate per frame
}

/**
 * MFCC 추출
 */
export function extractMFCC(
  audioData: Float32Array,
  sampleRate: number,
  options: {
    frameSize?: number;      // 프레임 크기 (samples)
    hopSize?: number;        // 홉 크기 (samples)
    numMelFilters?: number;  // Mel 필터 개수
    numMfccCoeffs?: number;  // MFCC 계수 개수
    preEmphasis?: number;    // Pre-emphasis 계수
  } = {}
): MFCCResult {
  const {
    frameSize = 512,
    hopSize = 256,
    numMelFilters = 26,
    numMfccCoeffs = 13,
    preEmphasis = 0.97,
  } = options;

  // Pre-emphasis
  const emphasized = new Float32Array(audioData.length);
  emphasized[0] = audioData[0];
  for (let i = 1; i < audioData.length; i++) {
    emphasized[i] = audioData[i] - preEmphasis * audioData[i - 1];
  }

  // 윈도우 생성
  const window = hammingWindow(frameSize);

  // FFT 크기 (2의 거듭제곱)
  const fftSize = Math.pow(2, Math.ceil(Math.log2(frameSize)));

  // Mel 필터 뱅크
  const filterBank = createMelFilterBank(numMelFilters, fftSize, sampleRate);

  // 프레임 개수
  const numFrames = Math.floor((audioData.length - frameSize) / hopSize) + 1;

  const mfcc: Float32Array[] = [];
  const melSpectrogram: Float32Array[] = [];
  const energy: number[] = [];
  const zeroCrossingRate: number[] = [];

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopSize;

    // 프레임 추출 및 윈도우 적용
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    let frameEnergy = 0;
    let zcr = 0;

    for (let i = 0; i < frameSize; i++) {
      real[i] = emphasized[start + i] * window[i];
      frameEnergy += real[i] * real[i];

      // Zero crossing rate
      if (i > 0 && ((emphasized[start + i] >= 0) !== (emphasized[start + i - 1] >= 0))) {
        zcr++;
      }
    }

    energy.push(frameEnergy);
    zeroCrossingRate.push(zcr / frameSize);

    // FFT
    fft(real, imag);

    // Power spectrum
    const powerSpectrum = new Float32Array(fftSize / 2 + 1);
    for (let i = 0; i <= fftSize / 2; i++) {
      powerSpectrum[i] = real[i] * real[i] + imag[i] * imag[i];
    }

    // Mel filter bank 적용
    const melEnergies = new Float32Array(numMelFilters);
    for (let i = 0; i < numMelFilters; i++) {
      let sum = 0;
      for (let j = 0; j < powerSpectrum.length; j++) {
        sum += powerSpectrum[j] * filterBank[i][j];
      }
      melEnergies[i] = Math.max(sum, 1e-10); // 로그를 위해 최소값 설정
    }

    melSpectrogram.push(melEnergies);

    // Log
    const logMelEnergies = new Float32Array(numMelFilters);
    for (let i = 0; i < numMelFilters; i++) {
      logMelEnergies[i] = Math.log(melEnergies[i]);
    }

    // DCT → MFCC
    const frameMfcc = dct(logMelEnergies, numMfccCoeffs);
    mfcc.push(frameMfcc);
  }

  return { mfcc, melSpectrogram, energy, zeroCrossingRate };
}

/**
 * 음성 특징 요약 (화자 구분용)
 */
export interface VoiceFeatures {
  avgPitch: number;        // 평균 음높이 추정 (MFCC[1] 기반)
  avgEnergy: number;       // 평균 에너지
  avgZCR: number;          // 평균 Zero Crossing Rate
  mfccMean: Float32Array;  // MFCC 평균
  mfccStd: Float32Array;   // MFCC 표준편차
}

export function summarizeVoiceFeatures(result: MFCCResult): VoiceFeatures {
  const numFrames = result.mfcc.length;
  const numCoeffs = result.mfcc[0]?.length || 13;

  // MFCC 평균
  const mfccMean = new Float32Array(numCoeffs);
  for (let c = 0; c < numCoeffs; c++) {
    let sum = 0;
    for (let f = 0; f < numFrames; f++) {
      sum += result.mfcc[f][c];
    }
    mfccMean[c] = sum / numFrames;
  }

  // MFCC 표준편차
  const mfccStd = new Float32Array(numCoeffs);
  for (let c = 0; c < numCoeffs; c++) {
    let sumSq = 0;
    for (let f = 0; f < numFrames; f++) {
      const diff = result.mfcc[f][c] - mfccMean[c];
      sumSq += diff * diff;
    }
    mfccStd[c] = Math.sqrt(sumSq / numFrames);
  }

  // 에너지 평균
  const avgEnergy = result.energy.reduce((a, b) => a + b, 0) / numFrames;

  // ZCR 평균
  const avgZCR = result.zeroCrossingRate.reduce((a, b) => a + b, 0) / numFrames;

  // 음높이 추정 (MFCC[1]과 에너지 기반 간단한 추정)
  // 실제로는 autocorrelation이나 YIN 알고리즘 필요
  const avgPitch = Math.abs(mfccMean[1]) * 50 + 100; // 시뮬레이션

  return { avgPitch, avgEnergy, avgZCR, mfccMean, mfccStd };
}

/**
 * 두 화자의 유사도 계산 (코사인 유사도)
 */
export function computeSpeakerSimilarity(
  features1: VoiceFeatures,
  features2: VoiceFeatures
): number {
  // MFCC 평균 벡터의 코사인 유사도
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < features1.mfccMean.length; i++) {
    dotProduct += features1.mfccMean[i] * features2.mfccMean[i];
    norm1 += features1.mfccMean[i] * features1.mfccMean[i];
    norm2 += features2.mfccMean[i] * features2.mfccMean[i];
  }

  if (norm1 === 0 || norm2 === 0) return 0;

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}
