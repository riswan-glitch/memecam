# Complete Prompt to Build MemeCam AI (Hugging Face Edition)

**Copy and paste the following prompt into an AI assistant to build this entire application from scratch:**

***

Build "MemeCam AI", a zero-latency, in-browser AR soundboard. The app runs 100% on the client side using Vite and Vanilla TypeScript, powered by a pretrained Hugging Face emotion recognition model. It captures webcam video, classifies facial emotions in real-time using Transformers.js (ONNX Runtime Web), and triggers HTML5 audio effects based on emotion confidence thresholds. No Python is used.

Here is the exact architecture and requirement list:

### 1. TECH STACK & SETUP
- Vite + Vanilla TypeScript.
- TailwindCSS for a minimal, dark-themed, glassmorphic UI.
- Hugging Face Transformers.js (`@huggingface/transformers`) running in-browser via WebGPU/WASM.
- Model: `Xenova/facial_emotions_image_detection`.
- Exclude `@huggingface/transformers` in `vite.config.ts` under `optimizeDeps` to allow proper ONNX WebAssembly loading.

### 2. VIDEO CAPTURE (WebRTC)
- Create a UI with a primary `<canvas>` element filling the screen (mirrored horizontally with `scale-x-[-1]`).
- Use `navigator.mediaDevices.getUserMedia` to capture webcam video.
- Feed the video into a hidden `<video>` element.
- Draw real-time frames onto the visible canvas at 60 FPS using `requestAnimationFrame`.

### 3. HUGGING FACE EMOTION AI
- Create a helper module (`src/emotions.ts`) that initializes `pipeline('image-classification', 'Xenova/facial_emotions_image_detection')`.
- Support progress callbacks so the UI can display model download progress (`status: 'progress'`).
- For high performance, downscale the current video frame onto an offscreen 224x224 `<canvas>` and run inference on an interval (~120ms) so the main rendering thread never stutters.
- Detect 7 emotion classes: `happy`, `surprise`, `sad`, `angry`, `fear`, `disgust`, and `neutral`.

### 4. AUDIO ENGINE & DEBOUNCING (CRITICAL)
- Preload 6 distinct HTML5 Audio objects mapped to emotions (`happy`, `surprise`, `sad`, `angry`, `fear`, `disgust`).
- Enforce strict debouncing:
  - Sound only triggers when an emotion transitions from inactive to active with confidence >= 55%.
  - Require a minimum cooldown period of 1200ms before any new trigger.
  - Require the user to return to a neutral/below-threshold state before the same sound can play again.

### 5. UI/UX DESIGN
- **Start Overlay**: Centered modal with a "Start MemeCam" button to request camera permissions and satisfy the browser's audio autoplay requirement. Include a loading progress bar that tracks Hugging Face model weight downloads.
- **Top Badge HUD**: Displays the currently dominant emotion emoji, label, and confidence score (e.g. `😄 Happy 92%`).
- **Live Debug Panel**: Floating glassmorphic panel on the top-left showing real-time animated percentage bars for all 7 emotions.
- **Error Toast**: Non-intrusive alert for camera or inference failures.

Generate the complete file structure: `package.json`, `vite.config.ts`, `index.html`, `src/style.css`, `src/main.ts`, `src/emotions.ts`, and `src/audio.ts`. Ensure strict typing and zero Python code.
