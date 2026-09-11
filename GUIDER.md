# 📖 GUIDER: Complete Step-by-Step Guide to MemeCam AI

Welcome to **MemeCam AI**! This guide covers everything you need to know from running the application locally, understanding how the in-browser AI works, adding custom sounds, tuning sensitivities, and troubleshooting.

---

## 📑 Table of Contents
1. [Overview & Tech Stack](#1-overview--tech-stack)
2. [Prerequisites & Quick Start](#2-prerequisites--quick-start)
3. [Using the App (Webcam vs Demo Mode)](#3-using-the-app)
4. [How Emotion AI Works](#4-how-emotion-ai-works)
5. [Connecting Custom Audio (Supabase Guide)](#5-connecting-custom-audio-supabase-guide)
6. [Tuning Sensitivity & Cooldown](#6-tuning-sensitivity--cooldown)
7. [Troubleshooting & Common Errors](#7-troubleshooting--common-errors)
8. [Production Build & Free Deployment](#8-production-build--free-deployment)

---

## 1. Overview & Tech Stack

MemeCam AI is a real-time, browser-based AR soundboard. It analyzes your facial expressions in real-time and triggers comedy sound effects whenever you smile, make a shocked face, frown, or get angry.

* **Frontend**: Vanilla TypeScript + Vite
* **Styling**: TailwindCSS (Dark Glassmorphic UI)
* **AI Model**: [`Xenova/facial_emotions_image_detection`](https://huggingface.co/Xenova/facial_emotions_image_detection) via `@huggingface/transformers`
* **Execution**: ONNX Runtime Web (runs 100% inside your browser using WebGPU / WASM)
* **Backend**: **Zero Python, zero backend servers required**. Everything runs on the client device.

---

## 2. Prerequisites & Quick Start

### Step 1: Open Terminal in Project Directory
Navigate to your project folder:
```bash
cd C:\Users\CEMP\meme\meme
```

### Step 2: Install Node Dependencies
Install required packages (Vite, TypeScript, TailwindCSS, Hugging Face Transformers):
```bash
npm install
```

### Step 3: Run the Development Server
Start the local development server:
```bash
npm run dev
```

### Step 4: Open in Your Browser
Open Chrome, Edge, or Firefox and go to:
👉 **`http://localhost:3000`**

---

## 3. Using the App

When the landing page opens, you have two options:

### Option A: Real Webcam Tracking
1. Click **"Start MemeCam"**.
2. Your browser will prompt: *"localhost:3000 wants to use your camera"*. Click **Allow**.
3. The app will download the AI model weights once (cached locally in browser storage) and display a download progress bar.
4. Once ready, your mirrored webcam stream appears with:
   - **Top Pill Badge**: Displays your active emotion emoji and confidence score.
   - **Left HUD Panel**: Shows real-time percentage bars for all 7 emotions.

### Option B: Demo Video Mode (No Camera Needed)
If you are on a desktop PC without a webcam or your camera is in use:
1. Click **"No camera? Test with Demo Video"**.
2. The app streams a pre-recorded test video into the emotion engine so you can see the meters animate and audio trigger without a camera!

---

## 4. How Emotion AI Works

The app captures video frames, downscales them to 224×224 pixels on an offscreen canvas, and feeds them into the Hugging Face neural network every **~120 milliseconds**.

### Supported Emotions & Default Sounds

| Emotion | Emoji | Default Sound Effect | Description |
| :--- | :---: | :--- | :--- |
| **Happy** | 😄 | Laughter / Monkey chatter | Triggers on broad smiles |
| **Surprise** | 😲 | Cartoon boing / Shock sound | Triggers on open-mouth gasps / wide eyes |
| **Sad** | 😢 | Wobble / Sad trombone sound | Triggers on down-turned lips / pouting |
| **Angry** | 😡 | Slide whistle / Siren | Triggers on furrowed brows / frowns |
| **Fear** | 😨 | Alarm / Dog bark | Triggers on wide fearful expressions |
| **Disgust** | 🤢 | Gag / Cat meow | Triggers on wrinkled nose / sneers |
| **Neutral** | 😐 | *Silent* (Idle state) | Resets cooldown timer |

### Debounce & Anti-Screeching Rules
To prevent sounds from playing repeatedly in an infinite screeching loop:
1. An emotion must reach at least **55% confidence** (`>= 0.55`) to activate.
2. Once played, a **1200ms cooldown** begins.
3. You must return to a **Neutral** or relaxed face before that same sound can fire again.

---

## 5. Connecting Custom Audio (Supabase Guide)

You can replace the default placeholder sounds with your own custom audio clips (e.g., Malayalam comedy dialogues like Salim Kumar, Jagathy Sreekumar, Suraj Venjaramoodu, or movie roasts).

### Step 1: Create a Free Supabase Bucket
1. Sign up or log in to [Supabase](https://supabase.com/).
2. Create a new project (e.g., `memecam-sounds`).
3. In the left navigation bar, click **Storage**.
4. Click **New Bucket**, name it `sounds`.
5. ⚠️ **IMPORTANT**: Turn the **Public bucket** toggle **ON**. This allows the browser to stream your files directly without needing API keys.

### Step 2: Upload Your Sounds
1. Open the `sounds` bucket.
2. Upload your `.mp3`, `.wav`, or `.ogg` sound files (keep filenames simple, e.g. `happy_laugh.mp3`, `shock_jagathy.mp3`).

### Step 3: Copy File URLs
1. Click on the uploaded file in Supabase.
2. Click **Get URL** to copy its public link. It looks like:
   `https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/happy_laugh.mp3`

### Step 4: Paste into MemeCam
Open [`src/audio.ts`](file:///c:/Users/CEMP/meme/meme/src/audio.ts) and update the `SOUND_URLS` object:

```typescript
export const SOUND_URLS: Record<string, string> = {
  happy: 'https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/happy_laugh.mp3',
  surprise: 'https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/shock_jagathy.mp3',
  sad: 'https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/sad_dialogue.mp3',
  angry: 'https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/angry_suraj.mp3',
  fear: 'https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/fear_scream.mp3',
  disgust: 'https://[PROJECT_ID].supabase.co/storage/v1/object/public/sounds/disgust_sound.mp3'
};
```
Save the file. Vite will automatically reload with your new custom sounds!

---

## 6. Tuning Sensitivity & Cooldown

### Making Emotions Harder or Easier to Trigger
In [`src/main.ts`](file:///c:/Users/CEMP/meme/meme/src/main.ts), find line 160:

```typescript
// Current trigger rule:
if (results.topScore >= 0.55 && top !== 'neutral') {
  audioEngine.updateState(top, true);
}
```
* **To make it harder (fewer false triggers)**: Increase `0.55` to `0.70` or `0.80`.
* **To make it easier (triggers on slight smiles)**: Decrease `0.55` to `0.45`.

### Changing the Cooldown Length
In [`src/audio.ts`](file:///c:/Users/CEMP/meme/meme/src/audio.ts), find line 24:

```typescript
constructor(cooldownMs = 1200) {
  this.cooldownMs = cooldownMs;
}
```
* If your dialogue sound clips are 3 seconds long, change `1200` to `3000` so the audio doesn't overlap.

---

## 7. Troubleshooting & Common Errors

### "Requested device not found"
* **Cause**: Your computer has no camera plugged in, or another app (Zoom, Teams, Discord, OBS) is holding exclusive access to it.
* **Fix**:
  1. Unplug and re-plug your USB webcam.
  2. Close any apps that might be using the camera (Zoom, Teams).
  3. In Windows, go to **Settings → Privacy & Security → Camera** and ensure *"Let desktop apps access your camera"* is switched **ON**.
  4. Or simply click **"No camera? Test with Demo Video"** to test without hardware.

### "Audio didn't play"
* **Cause**: Modern browsers block audio autoplay until the user interacts with the page.
* **Fix**: MemeCam requires clicking the **Start** button first, which automatically unlocks the browser audio context.

### "Model download is slow on first launch"
* The model weights (~20MB) are downloaded on the first run only. After that, your browser caches them in IndexedDB and subsequent launches are instant.

---

## 8. Production Build & Free Deployment

You can build and deploy MemeCam as a 100% static website to free hosting providers (Vercel, Netlify, or GitHub Pages):

### Build Production Bundle
```bash
npm run build
```
This outputs an optimized, minified bundle in the `dist/` directory.

### Deploy to Vercel
```bash
npx vercel
```

### Deploy to Netlify
Drag and drop your `dist/` folder directly into [Netlify Drop](https://app.netlify.com/drop).
