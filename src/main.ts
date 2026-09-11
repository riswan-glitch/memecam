import { initEmotionClassifier, detectEmotions, EmotionStateResults } from './emotions';
import { AudioEngine } from './audio';
import './style.css';

// DOM Elements
const video = document.getElementById('webcam-video') as HTMLVideoElement;
const canvas = document.getElementById('output-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const startOverlay = document.getElementById('start-overlay') as HTMLDivElement;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const demoBtn = document.getElementById('demo-btn') as HTMLButtonElement;
const loadingContainer = document.getElementById('loading-container') as HTMLDivElement;
const progressBar = document.getElementById('progress-bar') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;

const debugPanel = document.getElementById('debug-panel') as HTMLDivElement;
const errorToast = document.getElementById('error-toast') as HTMLDivElement;
const errorToastMsg = document.getElementById('error-toast-msg') as HTMLDivElement;

const activeBadge = document.getElementById('active-emotion-badge') as HTMLDivElement;
const badgeEmoji = document.getElementById('badge-emoji') as HTMLSpanElement;
const badgeText = document.getElementById('badge-text') as HTMLSpanElement;
const badgeScore = document.getElementById('badge-score') as HTMLSpanElement;

// Emotion emoji dictionary
const EMOJI_MAP: Record<string, string> = {
  happy: '😄',
  surprise: '😲',
  sad: '😢',
  angry: '😡',
  fear: '😨',
  disgust: '🤢',
  neutral: '😐'
};

const EMOTION_KEYS = ['happy', 'surprise', 'sad', 'angry', 'fear', 'disgust', 'neutral'];

// Off-screen canvas for high-performance 224x224 downscaled model inference
const modelCanvas = document.createElement('canvas');
modelCanvas.width = 224;
modelCanvas.height = 224;
const modelCtx = modelCanvas.getContext('2d', { willReadFrequently: true })!;

// Engine State
let isRunning = false;
let isPredicting = false;
let lastInferenceTime = 0;
const INFERENCE_INTERVAL_MS = 120; // Run inference every ~120ms for smooth 60fps UI
const audioEngine = new AudioEngine(1200); // 1.2s debounce cooldown

/**
 * Multi-tiered resilient camera initialization.
 * Automatically tries relaxed constraints to prevent "Requested device not found" errors
 * caused by strict facingMode constraints or external desktop webcams.
 */
async function startCamera(): Promise<void> {
  let stream: MediaStream | null = null;
  let errorDetails = '';

  // Tier 1: Try relaxed resolution without forcing facingMode
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
  } catch (err1: any) {
    console.warn('Tier 1 camera access failed:', err1);
    errorDetails = err1.message || err1.name || '';
  }

  // Tier 2: Simplest possible query (any available video input)
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    } catch (err2: any) {
      console.warn('Tier 2 camera access failed:', err2);
      errorDetails = err2.message || err2.name || errorDetails;
    }
  }

  // Tier 3: Explicitly enumerate all devices and pick the first videoinput
  if (!stream && navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      if (videoDevices.length > 0) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: videoDevices[0].deviceId } },
          audio: false
        });
      }
    } catch (err3: any) {
      console.warn('Tier 3 camera access failed:', err3);
      errorDetails = err3.message || err3.name || errorDetails;
    }
  }

  // If all camera tiers failed
  if (!stream) {
    const errorMsg = errorDetails
      ? `Webcam not found (${errorDetails}). Please check if your camera is connected/unmuted, or click "Test with Demo Video" below.`
      : 'Webcam not found or is currently in use by another app (Zoom, Teams, OBS). Please plug in a webcam or test with "Demo Video" below.';
    showError(errorMsg);
    throw new Error(errorMsg);
  }

  video.srcObject = stream;

  return new Promise<void>((resolve) => {
    const onReady = () => {
      video.play().catch((e) => console.warn('Video play deferred:', e));
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      resolve();
    };

    if (video.readyState >= 1 && video.videoWidth > 0) {
      onReady();
    } else {
      video.onloadedmetadata = () => onReady();
    }
  });
}

/**
 * Fallback Demo Mode: Plays a sample video so the AI and soundboard can be tested
 * without requiring physical webcam hardware.
 */
async function startDemoVideo(): Promise<void> {
  video.srcObject = null;
  video.crossOrigin = 'anonymous';
  video.loop = true;
  video.muted = true;
  
  // Publicly accessible royalty-free MP4 face video sample
  video.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

  return new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => {
      video.play().catch(reject);
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      resolve();
    };
    video.onerror = () => {
      reject(new Error('Failed to load demo video stream.'));
    };
  });
}

function updateEmotionUI(results: EmotionStateResults) {
  // Update each emotion meter
  for (const emotion of EMOTION_KEYS) {
    const score = results.emotions[emotion] || 0;
    const pct = Math.round(score * 100);

    const scoreEl = document.getElementById(`score-${emotion}`);
    const barEl = document.getElementById(`bar-${emotion}`);

    if (scoreEl) scoreEl.textContent = `${pct}%`;
    if (barEl) barEl.style.width = `${pct}%`;
  }

  // Update top badge
  const top = results.topEmotion;
  const topScorePct = Math.round(results.topScore * 100);

  badgeEmoji.textContent = EMOJI_MAP[top] || '😐';
  badgeText.textContent = top;
  badgeScore.textContent = `${topScorePct}%`;

  // Trigger audio if confidence is high (>= 0.55)
  if (results.topScore >= 0.55 && top !== 'neutral') {
    audioEngine.updateState(top, true);

    // Deactivate all others
    for (const key of EMOTION_KEYS) {
      if (key !== top) audioEngine.updateState(key, false);
    }
  } else {
    // When neutral or below threshold, deactivate all to allow cooldown reset
    for (const key of EMOTION_KEYS) {
      audioEngine.updateState(key, false);
    }
  }
}

function renderLoop() {
  if (!isRunning) return;

  // Guard against invalid video state
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    // 1. Draw smooth real-time video frame on main canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const now = performance.now();

    // 2. Throttled AI inference
    if (!isPredicting && now - lastInferenceTime >= INFERENCE_INTERVAL_MS) {
      isPredicting = true;
      lastInferenceTime = now;

      // Draw downscaled frame to model canvas for fast processing
      modelCtx.drawImage(video, 0, 0, 224, 224);

      detectEmotions(modelCanvas)
        .then((results) => {
          if (results) {
            updateEmotionUI(results);
          }
        })
        .catch((err) => {
          console.warn('Prediction error:', err);
        })
        .finally(() => {
          isPredicting = false;
        });
    }
  }

  requestAnimationFrame(renderLoop);
}

function showError(msg: string) {
  if (errorToastMsg) errorToastMsg.textContent = msg;
  errorToast.classList.remove('opacity-0', 'pointer-events-none');
  setTimeout(() => {
    errorToast.classList.add('opacity-0', 'pointer-events-none');
  }, 8000);
}

async function launchApp(useDemo: boolean = false) {
  startBtn.disabled = true;
  if (demoBtn) demoBtn.disabled = true;
  startBtn.classList.add('opacity-50', 'cursor-not-allowed');
  loadingContainer.classList.remove('hidden');

  // Pre-initialize audio elements on first user gesture (satisfies autoplay policy)
  audioEngine.init();

  try {
    // 1. Start video source (Webcam or Demo)
    if (useDemo) {
      statusText.textContent = 'Loading demo video...';
      progressBar.style.width = '20%';
      await startDemoVideo();
    } else {
      statusText.textContent = 'Connecting to camera...';
      progressBar.style.width = '20%';
      await startCamera();
    }

    // 2. Load AI model
    statusText.textContent = 'Loading AI model...';
    progressBar.style.width = '40%';

    await initEmotionClassifier((pct, text) => {
      progressBar.style.width = `${Math.max(40, pct)}%`;
      statusText.textContent = text;
    });

    progressBar.style.width = '100%';
    statusText.textContent = 'Ready!';

    // 3. Reveal UI and launch loop
    setTimeout(() => {
      startOverlay.style.display = 'none';
      debugPanel.classList.remove('hidden');
      activeBadge.classList.remove('hidden');
      isRunning = true;
      requestAnimationFrame(renderLoop);
    }, 400);

  } catch (err: any) {
    console.error('Initialization error:', err);
    startBtn.disabled = false;
    if (demoBtn) demoBtn.disabled = false;
    startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    loadingContainer.classList.add('hidden');
    showError(err.message || 'Failed to start MemeCam.');
  }
}

// Event Listeners
startBtn.addEventListener('click', () => launchApp(false));
if (demoBtn) {
  demoBtn.addEventListener('click', () => launchApp(true));
}
