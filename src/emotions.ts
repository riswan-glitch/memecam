export interface EmotionPrediction {
  label: string;
  score: number;
}

export interface EmotionStateResults {
  emotions: Record<string, number>;
  topEmotion: string;
  topScore: number;
}

export type PredictionListener = (
  results: EmotionStateResults,
  inferenceTimeMs: number,
  backend: string
) => void;

let worker: Worker | null = null;
let isReady = false;
let isBusy = false;
let predictionListener: PredictionListener | null = null;

/**
 * Initializes the AI emotion classifier inside a dedicated Web Worker.
 * All neural network inference, downloads, and WASM/WebGPU compilation
 * occur off the main UI thread.
 */
export async function initEmotionClassifier(
  progressCallback?: (progress: number, statusText: string) => void
): Promise<void> {
  if (isReady && worker) return;

  return new Promise<void>((resolve, reject) => {
    try {
      // Spawn ES-module Web Worker via Vite's native URL resolution
      worker = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module'
      });

      worker.onmessage = (e: MessageEvent) => {
        const data = e.data;

        if (data.type === 'progress') {
          if (progressCallback) {
            progressCallback(data.progress, data.statusText);
          }
        } else if (data.type === 'ready') {
          isReady = true;
          isBusy = false;
          if (progressCallback) {
            progressCallback(100, `AI Model ready (${data.backend.toUpperCase()})!`);
          }
          resolve();
        } else if (data.type === 'prediction') {
          isBusy = false;
          if (predictionListener && data.results) {
            predictionListener(data.results, data.inferenceTimeMs, data.backend || 'wasm');
          }
        } else if (data.type === 'prediction_empty' || data.type === 'prediction_error') {
          isBusy = false;
        } else if (data.type === 'error') {
          isReady = false;
          isBusy = false;
          reject(new Error(data.message || 'Worker initialization failed'));
        }
      };

      worker.onerror = (err) => {
        console.error('Worker error:', err);
        isBusy = false;
        reject(new Error('AI Web Worker failed to load.'));
      };

      // Instruct worker to begin model downloading and initialization
      worker.postMessage({ type: 'init' });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Registers the listener for incoming emotion classifications.
 */
export function onPredictionResult(listener: PredictionListener): void {
  predictionListener = listener;
}

/**
 * Checks whether the worker is currently computing an inference frame.
 */
export function isWorkerProcessing(): boolean {
  return isBusy;
}

/**
 * Dispatches an ImageBitmap to the worker for zero-copy, non-blocking inference.
 * Drops the frame if the worker is still busy to guarantee zero queue accumulation.
 */
export function dispatchFrame(bitmap: ImageBitmap): boolean {
  if (!worker || !isReady || isBusy) {
    // If worker is busy or not ready, close bitmap immediately to free memory
    bitmap.close();
    return false;
  }

  isBusy = true;
  // Transfer ownership of the ImageBitmap to worker without cloning
  worker.postMessage({ type: 'predict', bitmap }, [bitmap]);
  return true;
}
