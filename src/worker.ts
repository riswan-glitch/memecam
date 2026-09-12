import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js for client-side worker execution
env.allowLocalModels = false;

// Optimize WASM threading if supported
if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = Math.min(navigator.hardwareConcurrency, 4);
  }
}

export interface EmotionPrediction {
  label: string;
  score: number;
}

export interface EmotionStateResults {
  emotions: Record<string, number>;
  topEmotion: string;
  topScore: number;
}

let classifier: any = null;
let activeBackend: 'webgpu' | 'wasm' = 'webgpu';

// Pre-allocated offscreen canvas inside the worker
const canvas = new OffscreenCanvas(224, 224);
const ctx = canvas.getContext('2d')!;


async function initializeModel(): Promise<void> {
  const onProgress = (data: any) => {
    if (data.status === 'progress') {
      const pct = Math.round(data.progress || 0);
      let text = `Loading AI model: ${pct}%`;
      if (data.loaded && data.total) {
        const loadedMB = (data.loaded / 1024 / 1024).toFixed(1);
        const totalMB = (data.total / 1024 / 1024).toFixed(1);
        text = `Downloading model: ${loadedMB}MB / ${totalMB}MB (${pct}%)`;
      }
      self.postMessage({ type: 'progress', progress: pct, statusText: text });
    } else if (data.status === 'ready') {
      self.postMessage({ type: 'progress', progress: 100, statusText: 'Compiling neural shaders...' });
    }
  };

  try {
    // Attempt 1: WebGPU acceleration with lightweight quantized model
    classifier = await pipeline(
      'image-classification',
      'Xenova/facial_emotions_image_detection',
      {
        dtype: 'q4',
        device: 'webgpu',
        progress_callback: onProgress
      }
    );
    activeBackend = 'webgpu';
  } catch (webgpuErr) {
    console.warn('WebGPU not available in worker, falling back to multi-threaded WASM SIMD:', webgpuErr);
    try {
      // Attempt 2: WASM SIMD fallback
      classifier = await pipeline(
        'image-classification',
        'Xenova/facial_emotions_image_detection',
        {
          dtype: 'q4',
          device: 'wasm',
          progress_callback: onProgress
        }
      );
      activeBackend = 'wasm';
    } catch (wasmErr: any) {
      console.error('Failed to initialize AI model in worker:', wasmErr);
      self.postMessage({ type: 'error', message: wasmErr.message || 'Failed to initialize AI model.' });
      throw wasmErr;
    }
  }

  self.postMessage({ type: 'ready', backend: activeBackend });
}

async function runInference(bitmap: ImageBitmap): Promise<void> {
  if (!classifier) {
    bitmap.close();
    return;
  }

  const startTime = performance.now();

  try {
    // 1. Draw transferred ImageBitmap onto offscreen canvas
    ctx.drawImage(bitmap, 0, 0, 224, 224);
    // Free GPU image bitmap memory immediately
    bitmap.close();

    // 2. Run vision transformer classification off the main UI thread
    const results: EmotionPrediction[] = await classifier(canvas);
    const inferenceTimeMs = Math.round(performance.now() - startTime);

    if (!results || !Array.isArray(results)) {
      self.postMessage({ type: 'prediction_empty', inferenceTimeMs });
      return;
    }

    const emotionMap: Record<string, number> = {
      happy: 0,
      surprise: 0,
      sad: 0,
      angry: 0,
      fear: 0,
      disgust: 0,
      neutral: 0
    };

    let topEmotion = 'neutral';
    let topScore = 0;

    for (const item of results) {
      const key = item.label.toLowerCase();
      if (key in emotionMap) {
        emotionMap[key] = item.score;
      }
      if (item.score > topScore) {
        topScore = item.score;
        topEmotion = key;
      }
    }

    const payload: EmotionStateResults = {
      emotions: emotionMap,
      topEmotion,
      topScore
    };

    self.postMessage({
      type: 'prediction',
      results: payload,
      inferenceTimeMs,
      backend: activeBackend
    });
  } catch (err: any) {
    console.warn('Worker inference error:', err);
    try {
      bitmap.close();
    } catch (_) {}
    self.postMessage({ type: 'prediction_error', message: err.message });
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;

  if (type === 'init') {
    try {
      await initializeModel();
    } catch (err) {
      console.error('Model initialization failed:', err);
    }
  } else if (type === 'predict') {
    const bitmap = e.data.bitmap as ImageBitmap;
    if (bitmap) {
      await runInference(bitmap);
    }
  }
};
