import { pipeline, env } from '@huggingface/transformers';

// Configuration for in-browser execution
env.allowLocalModels = false;

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

export async function initEmotionClassifier(
  progressCallback?: (progress: number, statusText: string) => void
): Promise<any> {
  if (classifier) return classifier;

  const onProgress = (data: any) => {
    if (progressCallback && data.status === 'progress') {
      const pct = Math.round(data.progress || 0);
      progressCallback(pct, `Loading AI model: ${pct}%`);
    } else if (progressCallback && data.status === 'ready') {
      progressCallback(100, 'AI Model ready!');
    }
  };

  try {
    // Try WebGPU first for maximum speed
    classifier = await pipeline(
      'image-classification',
      'Xenova/facial_emotions_image_detection',
      {
        device: 'webgpu',
        progress_callback: onProgress
      }
    );
    return classifier;
  } catch (webgpuErr) {
    console.warn('WebGPU not supported or failed to initialize, falling back to WASM:', webgpuErr);
    try {
      // Fallback to WASM backend (CPU with SIMD)
      classifier = await pipeline(
        'image-classification',
        'Xenova/facial_emotions_image_detection',
        {
          device: 'wasm',
          progress_callback: onProgress
        }
      );
      return classifier;
    } catch (wasmErr) {
      console.error('Failed to initialize AI model in both WebGPU and WASM:', wasmErr);
      throw wasmErr;
    }
  }
}

export async function detectEmotions(
  source: HTMLCanvasElement | HTMLVideoElement
): Promise<EmotionStateResults | null> {
  if (!classifier) return null;

  try {
    const results: EmotionPrediction[] = await classifier(source);
    if (!results || !Array.isArray(results)) return null;

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

    return {
      emotions: emotionMap,
      topEmotion,
      topScore
    };
  } catch (err) {
    console.warn('Inference error:', err);
    return null;
  }
}
