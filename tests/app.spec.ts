import { test, expect } from '@playwright/test';

test.describe('SoundLab App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('Navigation', () => {
    test('should display the header with app title', async ({ page }) => {
      await expect(page.getByText('SoundLab')).toBeVisible();
      await expect(page.getByText('STT/TTS 원리를 눈으로 보고 체험하기')).toBeVisible();
    });

    test('should have all five tabs', async ({ page }) => {
      await expect(page.getByTestId('tab-wave')).toBeVisible();
      await expect(page.getByTestId('tab-stt')).toBeVisible();
      await expect(page.getByTestId('tab-tts')).toBeVisible();
      await expect(page.getByTestId('tab-playground')).toBeVisible();
      await expect(page.getByTestId('tab-advanced')).toBeVisible();
    });

    test('should navigate between tabs', async ({ page }) => {
      // Start on Wave Lab (default)
      await expect(page.getByText('Wave Lab - 소리의 기초')).toBeVisible();

      // Go to STT Lab
      await page.getByTestId('tab-stt').click();
      await expect(page.getByText('STT Lab - 음성을 텍스트로')).toBeVisible();

      // Go to TTS Lab
      await page.getByTestId('tab-tts').click();
      await expect(page.getByText('TTS Lab - 텍스트를 음성으로')).toBeVisible();

      // Go to Playground
      await page.getByTestId('tab-playground').click();
      await expect(page.getByText('Playground - 종합 실습')).toBeVisible();

      // Go back to Wave Lab
      await page.getByTestId('tab-wave').click();
      await expect(page.getByText('Wave Lab - 소리의 기초')).toBeVisible();

      // Go to Advanced Lab
      await page.getByTestId('tab-advanced').click();
      await expect(page.getByText('Advanced Lab - 최신 기술 체험')).toBeVisible();
    });
  });

  test.describe('Wave Lab', () => {
    test('should display wave lab components', async ({ page }) => {
      await expect(page.getByText('실시간 파형')).toBeVisible();
      await expect(page.getByText('주파수 분석 (FFT)')).toBeVisible();
      await expect(page.getByTestId('wave-record-btn')).toBeVisible();
    });

    test('should have a record button with correct text', async ({ page }) => {
      const recordBtn = page.getByTestId('wave-record-btn');
      await expect(recordBtn).toBeVisible();
      await expect(recordBtn).toContainText('녹음 시작');
    });

    test('should display sampling rate comparison section', async ({ page }) => {
      await expect(page.getByText('샘플링 레이트 비교 (나이퀴스트 정리)')).toBeVisible();
      await expect(page.getByTestId('sample-rate-8000')).toBeVisible();
      await expect(page.getByTestId('sample-rate-16000')).toBeVisible();
      await expect(page.getByTestId('sample-rate-44100')).toBeVisible();
    });

    test('should select different sample rates and show info', async ({ page }) => {
      // Click 16kHz (STT standard)
      await page.getByTestId('sample-rate-16000').click();
      await expect(page.getByText('STT에서 16kHz를 사용하는 이유')).toBeVisible();

      // Click 8kHz
      await page.getByTestId('sample-rate-8000').click();
      await expect(page.getByText('4,000 Hz')).toBeVisible(); // Max frequency for 8kHz
    });

    test('should display Mel-Spectrogram section', async ({ page }) => {
      await expect(page.getByText('Mel-Spectrogram (AI 입력 형식)')).toBeVisible();
      await expect(page.getByTestId('mel-toggle-btn')).toBeVisible();
    });

    test('should toggle Mel-Spectrogram visualization', async ({ page }) => {
      const melToggle = page.getByTestId('mel-toggle-btn');
      await expect(melToggle).toContainText('비활성화');

      await melToggle.click();
      await expect(melToggle).toContainText('활성화됨');
    });
  });

  test.describe('STT Lab', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByTestId('tab-stt').click();
    });

    test('should display STT lab components', async ({ page }) => {
      await expect(page.getByText('실시간 음성 인식 (신뢰도 표시)')).toBeVisible();
      await expect(page.getByText('CTC 디코딩 시뮬레이터')).toBeVisible();
    });

    test('should display CTC vs Attention comparison section', async ({ page }) => {
      await expect(page.getByText('CTC vs Attention 비교 시뮬레이터')).toBeVisible();
      await expect(page.getByTestId('attention-hello')).toBeVisible();
      await expect(page.getByTestId('attention-weather')).toBeVisible();
      await expect(page.getByTestId('attention-repeat')).toBeVisible();
    });

    test('should switch between attention examples', async ({ page }) => {
      // Default is hello - check button is selected
      await expect(page.getByTestId('attention-hello')).toHaveClass(/bg-primary/);

      // Click weather example
      await page.getByTestId('attention-weather').click();
      await expect(page.getByTestId('attention-weather')).toHaveClass(/bg-primary/);
      // Check CTC output is visible
      await expect(page.getByText('날씨가좋아요').first()).toBeVisible();

      // Click repeat (bad example)
      await page.getByTestId('attention-repeat').click();
      await expect(page.getByTestId('attention-repeat')).toHaveClass(/bg-primary/);
      // Check error analysis is shown for bad example
      await expect(page.getByText('나쁜 예시 분석')).toBeVisible();
    });

    test('should display attention heatmap', async ({ page }) => {
      await expect(page.getByTestId('attention-heatmap')).toBeVisible();
    });

    test('should have CTC decoder input and button', async ({ page }) => {
      await expect(page.getByTestId('ctc-input')).toBeVisible();
      await expect(page.getByTestId('ctc-decode-btn')).toBeVisible();
    });

    test('should decode CTC input correctly', async ({ page }) => {
      // Enter CTC sequence (with proper blanks between same letters)
      await page.getByTestId('ctc-input').fill('ε-H-H-ε-E-ε-L-L-ε-L-O');

      // Click decode button
      await page.getByTestId('ctc-decode-btn').click();

      // Check results appear
      const result = page.getByTestId('ctc-result');
      await expect(result).toContainText('Step 0');
      await expect(result).toContainText('Step 1');
      await expect(result).toContainText('Step 2');

      // Final result should contain the decoded letters
      await expect(result).toContainText('H E L L O');
    });

    test('should generate random CTC sequence', async ({ page }) => {
      // Click random button
      await page.getByText('랜덤').click();

      // Input should be filled
      const input = page.getByTestId('ctc-input');
      await expect(input).not.toHaveValue('');
    });

    test('should display Beam Search vs Greedy Search section', async ({ page }) => {
      await expect(page.getByText('Beam Search vs Greedy Search 시각화')).toBeVisible();
      await expect(page.getByTestId('search-greedy')).toBeVisible();
      await expect(page.getByTestId('search-beam')).toBeVisible();
    });

    test('should switch between Greedy and Beam Search modes', async ({ page }) => {
      // Default is Beam Search
      await expect(page.getByTestId('search-beam')).toHaveClass(/bg-secondary/);

      // Click Greedy Search
      await page.getByTestId('search-greedy').click();
      await expect(page.getByTestId('search-greedy')).toHaveClass(/bg-primary/);
      await expect(page.getByText('다른 후보들')).toBeVisible();

      // Switch back to Beam Search
      await page.getByTestId('search-beam').click();
      await expect(page.getByTestId('search-beam')).toHaveClass(/bg-secondary/);
    });

    test('should change Beam Width', async ({ page }) => {
      // Click Beam Width 5
      await page.getByTestId('beam-width-5').click();
      await expect(page.getByText('Width=5')).toBeVisible();
    });
  });

  test.describe('TTS Lab', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByTestId('tab-tts').click();
    });

    test('should display TTS lab components', async ({ page }) => {
      await expect(page.getByText('음성 합성')).toBeVisible();
      await expect(page.getByText('G2P 변환기')).toBeVisible();
    });

    test('should have TTS input and speak button', async ({ page }) => {
      await expect(page.getByTestId('tts-input')).toBeVisible();
      await expect(page.getByTestId('tts-speak-btn')).toBeVisible();
    });

    test('should have G2P converter', async ({ page }) => {
      await expect(page.getByTestId('g2p-input')).toBeVisible();
      await expect(page.getByTestId('g2p-convert-btn')).toBeVisible();
    });

    test('should convert G2P correctly - palatalization', async ({ page }) => {
      // Enter Korean text
      await page.getByTestId('g2p-input').fill('같이');

      // Click convert button
      await page.getByTestId('g2p-convert-btn').click();

      // Check result
      const result = page.getByTestId('g2p-result');
      await expect(result).toBeVisible();
      await expect(result).toContainText('가치');
      await expect(result).toContainText('구개음화');
    });

    test('should convert G2P correctly - fortition', async ({ page }) => {
      await page.getByTestId('g2p-input').fill('학교');
      await page.getByTestId('g2p-convert-btn').click();

      const result = page.getByTestId('g2p-result');
      await expect(result).toBeVisible();
      await expect(result).toContainText('학꾜');
      await expect(result).toContainText('경음화');
    });

    test('should convert G2P correctly - nasalization', async ({ page }) => {
      await page.getByTestId('g2p-input').fill('국민');
      await page.getByTestId('g2p-convert-btn').click();

      const result = page.getByTestId('g2p-result');
      await expect(result).toBeVisible();
      await expect(result).toContainText('궁민');
      await expect(result).toContainText('비음화');
    });

    test('should fill G2P input when clicking example', async ({ page }) => {
      // Click on an example with '같이'
      await page.getByRole('button', { name: /같이.*가치/ }).click();

      // Input should be filled
      await expect(page.getByTestId('g2p-input')).toHaveValue('같이');
    });

    test('should display Vocoder comparison section', async ({ page }) => {
      await expect(page.getByText('Vocoder 비교 (Neural Vocoder의 혁신)')).toBeVisible();
      await expect(page.getByTestId('vocoder-griffin-lim')).toBeVisible();
      await expect(page.getByTestId('vocoder-wavenet')).toBeVisible();
      await expect(page.getByTestId('vocoder-hifi-gan')).toBeVisible();
    });

    test('should select different vocoders and show info', async ({ page }) => {
      // Click Griffin-Lim
      await page.getByTestId('vocoder-griffin-lim').click();
      await expect(page.getByText('기계적, 금속성 느낌')).toBeVisible();

      // Click HiFi-GAN
      await page.getByTestId('vocoder-hifi-gan').click();
      await expect(page.getByText('HiFi-GAN의 혁신')).toBeVisible();
    });

    test('should display Text Normalization section', async ({ page }) => {
      await expect(page.getByText('Text Normalization (텍스트 정규화)')).toBeVisible();
      await expect(page.getByTestId('norm-input')).toBeVisible();
      await expect(page.getByTestId('norm-convert-btn')).toBeVisible();
    });

    test('should convert text normalization correctly', async ({ page }) => {
      await page.getByTestId('norm-input').fill('2024년 12월');
      await page.getByTestId('norm-convert-btn').click();

      const result = page.getByTestId('norm-result');
      await expect(result).toBeVisible();
      await expect(result).toContainText('이천이십사년');
    });

    test('should display Prosody emotion presets', async ({ page }) => {
      await expect(page.getByTestId('prosody-neutral')).toBeVisible();
      await expect(page.getByTestId('prosody-happy')).toBeVisible();
      await expect(page.getByTestId('prosody-sad')).toBeVisible();
    });

    test('should apply Prosody preset', async ({ page }) => {
      // Click happy preset
      await page.getByTestId('prosody-happy').click();
      await expect(page.getByTestId('prosody-happy')).toHaveClass(/bg-primary/);
      // Check the preset detail panel shows selected emotion with research info
      await expect(page.getByText('기쁨').first()).toBeVisible();
      await expect(page.getByText('빠르고 밝게')).toBeVisible();
    });

    test('should display TTS Pipeline demo', async ({ page }) => {
      await expect(page.getByText('TTS 파이프라인 단계별 체험')).toBeVisible();
      await expect(page.getByTestId('pipeline-input')).toBeVisible();
      await expect(page.getByTestId('pipeline-run-btn')).toBeVisible();
    });
  });

  test.describe('Playground', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByTestId('tab-playground').click();
    });

    test('should display playground components', async ({ page }) => {
      await expect(page.getByText('STT → TTS 순환 테스트')).toBeVisible();
      await expect(page.getByText('WER/CER 계산기')).toBeVisible();
    });

    test('should have WER/CER calculator inputs', async ({ page }) => {
      await expect(page.getByTestId('wer-reference')).toBeVisible();
      await expect(page.getByTestId('wer-hypothesis')).toBeVisible();
      await expect(page.getByTestId('wer-calculate-btn')).toBeVisible();
    });

    test('should calculate WER/CER correctly - perfect match', async ({ page }) => {
      await page.getByTestId('wer-reference').fill('오늘 날씨가 좋습니다');
      await page.getByTestId('wer-hypothesis').fill('오늘 날씨가 좋습니다');
      await page.getByTestId('wer-calculate-btn').click();

      await expect(page.getByTestId('wer-result')).toContainText('0.00%');
      await expect(page.getByTestId('cer-result')).toContainText('0.00%');
    });

    test('should calculate WER/CER correctly - with errors', async ({ page }) => {
      await page.getByTestId('wer-reference').fill('오늘 날씨가 좋습니다');
      await page.getByTestId('wer-hypothesis').fill('오늘 날씨가 나쁩니다');
      await page.getByTestId('wer-calculate-btn').click();

      // Should show non-zero error rate
      const werResult = await page.getByTestId('wer-result').textContent();
      const cerResult = await page.getByTestId('cer-result').textContent();

      expect(werResult).not.toBe('0.00%');
      expect(cerResult).not.toBe('0.00%');
    });

    test('should calculate WER correctly - English 25% example', async ({ page }) => {
      await page.getByTestId('wer-reference').fill('the weather is good');
      await page.getByTestId('wer-hypothesis').fill('the weather is great');
      await page.getByTestId('wer-calculate-btn').click();

      // WER should be 25% (1 word out of 4)
      await expect(page.getByTestId('wer-result')).toContainText('25.00%');
    });

    test('should display noise impact simulator', async ({ page }) => {
      await expect(page.getByText('노이즈가 STT에 미치는 영향')).toBeVisible();
      await expect(page.getByTestId('noise-white')).toBeVisible();
      await expect(page.getByTestId('noise-cafe')).toBeVisible();
      await expect(page.getByTestId('noise-traffic')).toBeVisible();
    });

    test('should adjust noise sliders', async ({ page }) => {
      const whiteNoise = page.getByTestId('noise-white');
      await whiteNoise.fill('50');

      const cafeNoise = page.getByTestId('noise-cafe');
      await cafeNoise.fill('30');

      // Should show updated noise level
      await expect(page.getByText('50%').first()).toBeVisible();
    });

    test('should display WER vs CER usage info', async ({ page }) => {
      await expect(page.getByText('WER vs CER 사용 시점')).toBeVisible();
    });

    test('should display Data Augmentation section', async ({ page }) => {
      await expect(page.getByText('Data Augmentation 체험')).toBeVisible();
      await expect(page.getByTestId('aug-record-btn')).toBeVisible();
      await expect(page.getByTestId('aug-pitch-slider')).toBeVisible();
      await expect(page.getByTestId('aug-time-slider')).toBeVisible();
    });

    test('should adjust pitch shift slider', async ({ page }) => {
      const pitchSlider = page.getByTestId('aug-pitch-slider');
      await pitchSlider.fill('6');
      await expect(page.getByText('+6 반음', { exact: true })).toBeVisible();
    });

    test('should adjust time stretch slider', async ({ page }) => {
      const timeSlider = page.getByTestId('aug-time-slider');
      await timeSlider.fill('1.5');
      await expect(page.getByText('1.5x', { exact: true })).toBeVisible();
    });
  });

  test.describe('Advanced Lab', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByTestId('tab-advanced').click();
    });

    test('should display Advanced Lab components', async ({ page }) => {
      await expect(page.getByText('Advanced Lab - 최신 기술 체험')).toBeVisible();
      await expect(page.getByText('음성 감정 인식 (SER)')).toBeVisible();
      await expect(page.getByText('화자 분리 (Diarization)')).toBeVisible();
      await expect(page.getByText('음성 인증 (Voice Authentication)')).toBeVisible();
    });

    test('should have SER record button', async ({ page }) => {
      await expect(page.getByTestId('ser-record-btn')).toBeVisible();
      await expect(page.getByTestId('ser-record-btn')).toContainText('감정 분석 녹음');
    });

    test('should have diarization demo button', async ({ page }) => {
      await expect(page.getByTestId('diarization-play-btn')).toBeVisible();
      await expect(page.getByTestId('diarization-play-btn')).toContainText('화자 분리 데모 시작');
    });

    test('should have voice authentication enroll button', async ({ page }) => {
      await expect(page.getByTestId('auth-enroll-btn')).toBeVisible();
      await expect(page.getByTestId('auth-enroll-btn')).toContainText('목소리 등록 시작');
    });

    test('should display 2024 AI trends', async ({ page }) => {
      await expect(page.getByText('2024 음성 AI 트렌드')).toBeVisible();
      await expect(page.getByText('VALL-E')).toBeVisible();
      await expect(page.getByText('Diffusion TTS')).toBeVisible();
      await expect(page.getByText('GPT Realtime API')).toBeVisible();
    });
  });

  test.describe('Footer', () => {
    test('should display footer with browser recommendation', async ({ page }) => {
      await expect(page.getByText('Chrome/Edge 브라우저 권장')).toBeVisible();
    });
  });
});
