import {
  initEmotionClassifier,
  onPredictionResult,
  dispatchFrame,
  isWorkerProcessing,
  EmotionStateResults
} from './emotions';
import { AudioEngine } from './audio';
import './style.css';

// DOM Elements
const video = document.getElementById('webcam-video') as HTMLVideoElement;
const canvas = document.getElementById('output-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

const startOverlay = document.getElementById('start-overlay') as HTMLDivElement;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const demoBtn = document.getElementById('demo-btn') as HTMLButtonElement;
const loadingContainer = document.getElementById('loading-container') as HTMLDivElement;
const progressBar = document.getElementById('progress-bar') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;

const debugPanel = document.getElementById('debug-panel') as HTMLDivElement;
const fpsCounter = document.getElementById('fps-counter') as HTMLSpanElement;
const latencyCounter = document.getElementById('latency-counter') as HTMLSpanElement;
const backendBadge = document.getElementById('backend-badge') as HTMLSpanElement;

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

// Fallback offscreen canvas for browsers that don't support resize options in createImageBitmap
const fallbackCanvas = document.createElement('canvas');
fallbackCanvas.width = 224;
fallbackCanvas.height = 224;
const fallbackCtx = fallbackCanvas.getContext('2d')!;

// Engine State
let isRunning = false;
let isCapturing = false;
let lastInferenceDispatch = 0;
const INFERENCE_INTERVAL_MS = 60; // Dispatch new frame every ~60ms when worker is ready
const audioEngine = new AudioEngine(1200); // 1.2s debounce cooldown

// Performance Telemetry
let frameCount = 0;
let lastFpsTime = performance.now();

// Register Web Worker prediction listener
onPredictionResult((results: EmotionStateResults, latencyMs: number, backend: string) => {
  updateEmotionUI(results);

  if (latencyCounter) {
    latencyCounter.textContent = `${latencyMs} ms`;
  }
  if (backendBadge) {
    backendBadge.textContent = backend.toUpperCase();
  }
});

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

let emotionLockEndTime = 0;

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

  const now = performance.now();

  // If we are currently locked into an emotion, skip updating the top badge and playing new sounds
  if (now < emotionLockEndTime) {
    return;
  }

  // 1. Find the strongest emotion overall (the one dominating the frame)
  const activeEmotion = results.topEmotion;
  const activeScore = results.topScore;
  const activeScorePct = Math.round(activeScore * 100);

  // We consider an emotion dominating if it's the absolute top emotion, not neutral, and has decent confidence
  const isDominating = activeEmotion !== 'neutral' && activeScore >= 0.25;

  // Update top badge with the true top emotion
  badgeEmoji.textContent = EMOJI_MAP[activeEmotion] || '😐';
  badgeText.textContent = activeEmotion;
  badgeScore.textContent = `${activeScorePct}%`;

  // Catch the dominating emotion and trigger sound accordingly
  const played = audioEngine.handleDominantEmotion(isDominating ? activeEmotion : 'neutral', activeScore);

  if (played) {
    // Lock the emotion identification for 3.5 seconds so we don't rush to the next emotion
    emotionLockEndTime = now + 3500;

    // Visual feedback: pulse active badge with neon glow
    activeBadge.classList.add('ring-4', 'ring-purple-400', 'scale-110', 'bg-purple-900/80');
    setTimeout(() => {
      activeBadge.classList.remove('ring-4', 'ring-purple-400', 'scale-110', 'bg-purple-900/80');
    }, 450);

    // Highlight the dominating row in the HUD
    const winningRow = document.querySelector(`.emotion-row[data-emotion="${activeEmotion}"]`);
    if (winningRow) {
      winningRow.classList.add('bg-purple-500/40', 'scale-105');
      setTimeout(() => {
        winningRow.classList.remove('bg-purple-500/40', 'scale-105');
      }, 500);
    }
  }
}


/**
 * Captures an undistorted, square center-crop of the current frame
 * and transfers it to the Web Worker for zero-copy background inference.
 */
async function captureAndSendFrame(): Promise<void> {
  if (isCapturing || isWorkerProcessing()) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  isCapturing = true;

  try {
    // Calculate square center-crop to prevent face stretching / distortion
    const minDim = Math.min(vw, vh);
    const sx = Math.floor((vw - minDim) / 2);
    const sy = Math.floor((vh - minDim) / 2);

    let bitmap: ImageBitmap;

    try {
      // Fast hardware-accelerated GPU crop and resize to 224x224
      bitmap = await createImageBitmap(video, sx, sy, minDim, minDim, {
        resizeWidth: 224,
        resizeHeight: 224,
        resizeQuality: 'low'
      });
    } catch {
      // Fallback for browsers with partial createImageBitmap options support
      fallbackCtx.drawImage(video, sx, sy, minDim, minDim, 0, 0, 224, 224);
      bitmap = await createImageBitmap(fallbackCanvas);
    }

    // Zero-copy transfer to dedicated worker
    dispatchFrame(bitmap);
  } catch (err) {
    console.warn('Frame capture error:', err);
  } finally {
    isCapturing = false;
  }
}

/**
 * 60 FPS Render Loop.
 * Operates purely on video rendering to guarantee zero stutter or lag.
 * Never blocked by AI inference.
 */
function renderLoop() {
  if (!isRunning) return;

  // Guard against invalid video state
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    // 1. Draw smooth real-time video frame on main canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. Track Preview FPS
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      if (fpsCounter) {
        fpsCounter.textContent = `${fps} FPS`;
      }
      frameCount = 0;
      lastFpsTime = now;
    }

    // 3. Dispatch new frame if worker is idle and throttle interval has passed
    if (!isWorkerProcessing() && now - lastInferenceDispatch >= INFERENCE_INTERVAL_MS) {
      lastInferenceDispatch = now;
      captureAndSendFrame();
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

    // 2. Load AI model in Web Worker
    statusText.textContent = 'Spawning AI worker & loading model...';
    progressBar.style.width = '40%';

    await initEmotionClassifier((pct, text) => {
      progressBar.style.width = `${Math.max(40, pct)}%`;
      statusText.textContent = text;
    });

    progressBar.style.width = '100%';
    statusText.textContent = 'Ready!';

    // 3. Reveal UI and launch 60fps render loop
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

// Allow clicking emotion rows in HUD to manually test and preview sound clips
document.querySelectorAll('.emotion-row').forEach((row) => {
  row.addEventListener('click', () => {
    const emotion = (row as HTMLElement).dataset.emotion;
    if (emotion && emotion !== 'neutral') {
      // Ensure audio engine is initialized on this click gesture
      audioEngine.init();
      audioEngine.playAudio(emotion);

      // Brief flash feedback
      row.classList.add('bg-purple-500/30');
      setTimeout(() => {
        row.classList.remove('bg-purple-500/30');
      }, 300);
    }
  });
});

