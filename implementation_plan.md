# MemeCam AI: Hugging Face AR Soundboard Implementation Plan

This document outlines the architecture for "MemeCam AI", a zero-latency, in-browser AR soundboard powered by Hugging Face pretrained models.

## Architecture Overview

The app runs 100% locally on the client-side using Vite, TypeScript, and `@huggingface/transformers` (ONNX Runtime Web). No Python or backend servers are required.

### 1. Dependencies & Setup
- **Vite + TypeScript** for rapid development and clean builds.
- **TailwindCSS** for a responsive, dark glassmorphic interface.
- **Hugging Face Transformers.js (`@huggingface/transformers`)**:
  - Model: `Xenova/facial_emotions_image_detection` (MobileNet-based emotion classifier).
  - Backend: ONNX Runtime Web using WebGPU with automatic WASM fallback.
  - Preload progress tracking displayed directly on the UI.

### 2. Video Capture & Real-Time Loop
- Webcam video captured via `navigator.mediaDevices.getUserMedia`.
- Full-screen mirrored `<canvas>` rendering video frames at 60 FPS using `requestAnimationFrame`.
- Off-screen 224×224 canvas for throttled (~120ms) Hugging Face model inference, preventing main UI thread blocking.

### 3. Emotion Detection & Classification
Tracks 7 distinct emotion states:
1. **Happy** 😄: Triggers laughter / celebration sound.
2. **Surprise** 😲: Triggers shock cartoon boing.
3. **Sad** 😢: Triggers sad wobble / trombone.
4. **Angry** 😡: Triggers slide whistle / siren.
5. **Fear** 😨: Triggers alarm / dog bark.
6. **Disgust** 🤢: Triggers cat meow / gag sound.
7. **Neutral** 😐: Idle state that resets triggers and allows cooldown expiration.

### 4. Audio Engine & Cooldown Logic
- Preloads HTML5 Audio objects for each emotion.
- Minimum cooldown threshold (1200ms) between plays.
- Enforces state reset (must return to Neutral or below confidence threshold before re-triggering the same emotion).

### 5. UI & Visual Feedback
- **Start Overlay**: Solves browser audio autoplay restrictions and displays real-time model download progress bar.
- **Active Badge**: Displays current top emotion emoji, name, and confidence score at top of screen.
- **Live HUD Debug Panel**: Displays animated percentage bars for all 7 emotions.
- **Error Toast**: Non-blocking notifications for camera/inference permissions.

## Verification
- Run `npm run build` to verify clean compilation with zero TypeScript errors.
- Run `npm run dev` to serve on `http://localhost:3000`.
