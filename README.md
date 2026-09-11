# MemeCam AI - Hugging Face AR Soundboard

MemeCam AI is a zero-backend, browser-based AR soundboard powered by **Hugging Face Pretrained Models**. It analyzes your facial expressions in real-time using Transformers.js and triggers comedic audio effects when you smile, act shocked, frown, or get angry!

Everything runs **100% locally in your browser** using Node.js/TypeScript tooling. **Zero Python required.**

---

## 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Development Server**
   ```bash
   npm run dev
   ```

3. **Launch the App**
   Open `http://localhost:3000` in your web browser. Click **Start MemeCam** and grant webcam permissions.

---

## 🎭 Supported Emotions & Audio Triggers

The app uses the pretrained [`Xenova/facial_emotions_image_detection`](https://huggingface.co/Xenova/facial_emotions_image_detection) model to classify:

| Emotion | Emoji | Default Sound Effect |
| :--- | :--- | :--- |
| **Happy** | 😄 | Laughter / Monkey chatter |
| **Surprise** | 😲 | Cartoon boing / Shock sound |
| **Sad** | 😢 | Wobble / Sad trombone sound |
| **Angry** | 😡 | Slide whistle / Dramatic sound |
| **Fear** | 😨 | Alarm / Dog bark |
| **Disgust** | 🤢 | Gag / Cat meow |
| **Neutral** | 😐 | Idle state (resets cooldown) |

---

## 🗄️ Detailed Guide: Connecting to Supabase for Custom Audio Hosting

To use real custom comedy audio clips (e.g., Malayalam movie dialogues, movie roasts, or soundboard clips), host them on a free cloud storage bucket like Supabase.

### Step 1: Create a Supabase Storage Bucket
1. Log in to [Supabase](https://supabase.com/) and open your project.
2. Click **Storage** in the left sidebar.
3. Click **New Bucket**, name it `sounds`.
4. **IMPORTANT**: Toggle **Public bucket** to **ON** so the app can stream audio files directly without API keys.

### Step 2: Upload Your Sounds
1. Open your `sounds` bucket.
2. Upload your `.mp3`, `.wav`, or `.ogg` sound files (e.g., `salim_laugh.mp3`, `jagathy_shock.mp3`, `suraj_angry.mp3`).

### Step 3: Copy URLs into MemeCam
1. Click on any uploaded file in Supabase and click **Get URL**.
2. Open [`src/audio.ts`](file:///c:/Users/CEMP/meme/meme/src/audio.ts).
3. Paste your public links into the `SOUND_URLS` object:

```typescript
export const SOUND_URLS: Record<string, string> = {
  happy: 'https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/salim_laugh.mp3',
  surprise: 'https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/jagathy_shock.mp3',
  sad: 'https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/sad_violins.mp3',
  angry: 'https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/harisree_rage.mp3',
  fear: 'https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/innocent_fear.mp3',
  disgust: 'https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/suraj_disgust.mp3'
};
```

---

## 🧠 Detailed Guide: Tuning Emotion AI Sensitivity & Cooldown

The Hugging Face model runs continuously on a downscaled 224×224 canvas stream to guarantee high FPS. You can easily customize detection sensitivity and audio rules:

### 1. Adjusting Emotion Sensitivity
In [`src/main.ts`](file:///c:/Users/CEMP/meme/meme/src/main.ts), locate the confidence threshold:

```typescript
// Triggers only when confidence is >= 55%
if (results.topScore >= 0.55 && top !== 'neutral') {
  audioEngine.updateState(top, true);
}
```
* **Make it harder to trigger** (reduce false positives): Increase `0.55` to `0.70` or `0.80`.
* **Make it easier to trigger**: Decrease `0.55` to `0.45`.

### 2. Tuning the Audio Cooldown
In [`src/audio.ts`](file:///c:/Users/CEMP/meme/meme/src/audio.ts):
```typescript
constructor(cooldownMs = 1200) {
  this.cooldownMs = cooldownMs;
}
```
* Increase `cooldownMs` (e.g. `2000` for 2 seconds) if your dialogue sound clips are long and you don't want them retriggering quickly.

---

## 🛠️ Architecture & Tech Stack

- **Framework**: Vite + Vanilla TypeScript
- **Styling**: TailwindCSS (Dark theme, glassmorphic HUD)
- **AI Model**: [`Xenova/facial_emotions_image_detection`](https://huggingface.co/Xenova/facial_emotions_image_detection) via `@huggingface/transformers`
- **Execution Backend**: ONNX Runtime Web (WebGPU / WASM with SIMD acceleration)
- **Audio Engine**: Custom HTML5 Audio manager with debouncing and cooldown
