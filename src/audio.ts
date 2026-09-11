export const SOUND_URLS: Record<string, string> = {
  // Emotion to sound mappings (Can be replaced with your custom audio / Supabase links)
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

    try {
      // Clone audio node to allow overlapping triggers without waiting for reset
      const audio = trigger.audioElement.cloneNode(true) as HTMLAudioElement;
      audio.volume = 0.85;
      audio.play().catch(() => {
        // Fallback to original element if clone fails
        trigger.audioElement.currentTime = 0;
        trigger.audioElement.play().catch(() => {});
      });

    } catch (_) {
      trigger.audioElement.currentTime = 0;
      trigger.audioElement.play().catch(() => {});
    }
  }
}

