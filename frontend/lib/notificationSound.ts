'use client';

/**
 * Notification chime for toasts. Synthesized with the Web Audio API so there's
 * no audio file to ship and nothing to load. Each severity gets its own short
 * tone. Respects a per-user mute preference (localStorage, default ON) and the
 * browser autoplay policy — the AudioContext only produces sound after the
 * user has interacted with the page (the first toast on a cold load may be
 * silent; every toast after any click plays).
 */

const SOUND_KEY = 'kartriq-sound'; // 'on' | 'off' — default on

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* storage disabled — no-op */
  }
}

// [frequencyHz, startOffsetSeconds] pairs per severity.
const TONES: Record<string, [number, number][]> = {
  success: [[660, 0], [880, 0.12]], // pleasant rising two-note
  info:    [[600, 0]],              // single soft note
  warning: [[520, 0], [520, 0.14]], // double tap
  error:   [[300, 0], [235, 0.13]], // low, urgent, descending
};

let ac: AudioContext | null = null;

export function playNotificationSound(type: string): void {
  if (typeof window === 'undefined' || !isSoundEnabled()) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    ac = ac || new Ctx();
    if (ac.state === 'suspended') void ac.resume();
    const seq = TONES[type] || [[600, 0]];
    for (const [freq, off] of seq) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const t0 = ac.currentTime + off;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + 0.22);
    }
  } catch {
    /* audio blocked / unsupported — silent */
  }
}
