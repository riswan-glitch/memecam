export const SOUND_URLS: Record<string, string> = {
  // Emotion to sound mappings (Can be replaced with your custom audio / Supabase links)
  happy: 'https://actions.google.com/sounds/v1/animals/monkey_chatter.ogg',       // Laughing / celebration
  surprise: 'https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg',   // Shock boing
  sad: 'https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg',       // Sad trombone / wobble
  angry: 'https://actions.google.com/sounds/v1/cartoon/slide_whistle.ogg',       // Angry siren / whistle
  fear: 'https://actions.google.com/sounds/v1/animals/dog_bark.ogg',             // Alarm / bark
  disgust: 'https://actions.google.com/sounds/v1/animals/cat_meow.ogg'           // Ew / meow
};

type EmotionState = 'inactive' | 'active';

interface AudioTriggerInfo {
  audioElement: HTMLAudioElement;
  state: EmotionState;
  lastTriggerTime: number;
}

export class AudioEngine {
  private triggers: Record<string, AudioTriggerInfo> = {};
  private cooldownMs: number;

  constructor(cooldownMs = 1200) {
    this.cooldownMs = cooldownMs;
  }

  public init() {
    for (const [emotion, url] of Object.entries(SOUND_URLS)) {
      const audio = new Audio(url);
      audio.preload = 'auto';
      this.triggers[emotion] = {
        audioElement: audio,
        state: 'inactive',
        lastTriggerTime: 0
      };
      audio.load();
    }
  }

  public updateState(emotionId: string, isActive: boolean) {
    if (!this.triggers[emotionId]) return;

    const trigger = this.triggers[emotionId];
    const now = performance.now();

    if (isActive) {
      // Trigger sound when transitioning from inactive to active and cooldown passed
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

  private playAudio(emotionId: string) {
    const trigger = this.triggers[emotionId];
    if (!trigger) return;

    const audio = trigger.audioElement;
    audio.currentTime = 0;
    audio.play().catch(err => {
      console.warn(`Could not play audio for ${emotionId}:`, err);
    });
  }
}
