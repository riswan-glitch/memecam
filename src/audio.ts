export const SOUND_URLS: Record<string, string> = {
  // Emotion to sound mappings (Malayalam comedy clips hosted on Supabase)
  happy: 'https://lwcutqhkquyyghxygoyy.supabase.co/storage/v1/object/public/sound/happy/Albuthadweep%20laugh.mp3',       // Laughing / celebration
  surprise: 'https://lwcutqhkquyyghxygoyy.supabase.co/storage/v1/object/public/sound/Surprised/Entho%20varan%20ponu.mp3',   // Shock boing
  sad: 'https://lwcutqhkquyyghxygoyy.supabase.co/storage/v1/object/public/sound/Sad/Apamanam.mp3',       // Sad trombone / wobble
  angry: 'https://lwcutqhkquyyghxygoyy.supabase.co/storage/v1/object/public/sound/Angry/Chavitti%20kootti.mp3',       // Angry siren / whistle
  fear: 'https://lwcutqhkquyyghxygoyy.supabase.co/storage/v1/object/public/sound/all%20in%20one/Jangooo.mp3',             // Alarm / bark
  disgust: 'https://lwcutqhkquyyghxygoyy.supabase.co/storage/v1/object/public/sound/all%20in%20one/Nee%20evidunna%20vanne%20marabhoothame.mp3'           // Ew / meow
};

type EmotionState = 'inactive' | 'active';

interface AudioTriggerInfo {
  audioElement: HTMLAudioElement;
  state: EmotionState;
  lastTriggerTime: number;
}

export class AudioEngine {
  private triggers: Record<string, AudioTriggerInfo> = {};
  private audioBuffers: Record<string, AudioBuffer> = {};
  private audioCtx: AudioContext | null = null;
  private cooldownMs: number;

  constructor(cooldownMs = 1200) {
    this.cooldownMs = cooldownMs;
  }


  /**
   * Initializes audio engine and preloads audio on first user gesture.
   * Uses Web Audio API for zero-latency in-memory playback, with HTML5 Audio fallback.
   */
  public init() {
    // 1. Initialize and unlock Web Audio Context on user gesture
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass && !this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    } catch (e) {
      console.warn('[AudioEngine] Web Audio API init error:', e);
    }

    // 2. Preload and decode audio buffers
    for (const [emotion, url] of Object.entries(SOUND_URLS)) {
      // Pre-configure HTML5 Audio element as fallback
      const audio = new Audio();
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      audio.src = url;

      this.triggers[emotion] = {
        audioElement: audio,
        state: 'inactive',
        lastTriggerTime: 0
      };

      audio.load();

      // Fetch & decode into Web Audio RAM buffer for instant 0ms trigger
      if (this.audioCtx) {
        fetch(url)
          .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.arrayBuffer();
          })
          .then(buf => this.audioCtx!.decodeAudioData(buf))
          .then(decoded => {
            this.audioBuffers[emotion] = decoded;
            console.log(`[AudioEngine] Decoded audio buffer ready: ${emotion}`);
          })
          .catch(err => {
            console.warn(`[AudioEngine] Web Audio prefetch fallback for ${emotion}:`, err);
          });
      }
    }
  }

  public updateState(emotionId: string, isActive: boolean) {
    if (!this.triggers[emotionId]) return;

    const trigger = this.triggers[emotionId];
    const now = performance.now();

    if (isActive) {
      // Trigger sound when transitioning from inactive to active and cooldown has elapsed
      if (trigger.state === 'inactive' && (now - trigger.lastTriggerTime > this.cooldownMs)) {
        this.playAudio(emotionId);
        trigger.state = 'active';
        trigger.lastTriggerTime = now;
      }
    } else {
      // Reset state when emotion is no longer dominant
      trigger.state = 'inactive';
    }
  }

  /**
   * Plays the audio effect immediately.
   */
  public playAudio(emotionId: string) {
    const trigger = this.triggers[emotionId];
    if (!trigger) return;

    // Ensure audio context is active
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    // Approach 1: Web Audio API (instant zero-latency RAM playback, handles overlaps cleanly)
    if (this.audioCtx && this.audioBuffers[emotionId]) {
      try {
        const source = this.audioCtx.createBufferSource();
        source.buffer = this.audioBuffers[emotionId];
        const gainNode = this.audioCtx.createGain();
        gainNode.gain.value = 0.95;
        source.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        source.start(0);
        console.log(`[AudioEngine] Played Web Audio for: ${emotionId}`);
        return;
      } catch (err) {
        console.warn(`[AudioEngine] Web Audio failed for ${emotionId}:`, err);
      }
    }

    // Approach 2: Direct HTML5 Audio Playback Fallback
    try {
      const audio = trigger.audioElement;
      audio.currentTime = 0;
      audio.volume = 0.95;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log(`[AudioEngine] Played HTML5 Audio for: ${emotionId}`);
          })
          .catch(err => {
            console.warn(`[AudioEngine] Audio play rejected for ${emotionId}:`, err);
          });
      }
    } catch (err) {
      console.warn(`[AudioEngine] Unexpected error playing audio for ${emotionId}:`, err);
    }
  }
}
