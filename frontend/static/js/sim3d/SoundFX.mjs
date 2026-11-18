/**
 * SoundFX.mjs
 * Lightweight synthesized Web Audio API tactile cues for mechanical snaps,
 * retention latches, cable plugs, and motherboard POST speaker beeps.
 * Zero external audio assets; safe and silent when muted or unsupported.
 */

const MUTE_STORAGE_KEY = 'assemblypc_sim_muted';

export class SoundFX {
  constructor() {
    this.ctx = null;
    try {
      this.muted = localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  isMuted() {
    return this.muted;
  }

  setMuted(mute) {
    this.muted = Boolean(mute);
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, this.muted ? '1' : '0');
    } catch {}
    return this.muted;
  }

  _ensureCtx() {
    if (this.muted) return null;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  _tone(freqStart, freqEnd, durationSec, type = 'triangle', peakGain = 0.08, delaySec = 0) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime + delaySec;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationSec + 0.015);
    } catch {}
  }

  playSnap(aligned = true) {
    if (aligned) {
      this._tone(420, 680, 0.075, 'triangle', 0.08);
    } else {
      this._tone(220, 150, 0.11, 'sawtooth', 0.055);
    }
  }

  playLatch() {
    this._tone(620, 920, 0.055, 'square', 0.045);
    this._tone(880, 1180, 0.055, 'triangle', 0.06, 0.045);
  }

  playCable(connected = true) {
    if (connected) {
      this._tone(260, 440, 0.07, 'sine', 0.09);
    } else {
      this._tone(360, 210, 0.065, 'sine', 0.06);
    }
  }

  playPostBeep(passed = true) {
    if (passed) {
      // Classic single short POST beep
      this._tone(1050, 1050, 0.14, 'square', 0.045);
    } else {
      // 3 short diagnostic fault beeps
      this._tone(880, 880, 0.09, 'square', 0.05, 0);
      this._tone(880, 880, 0.09, 'square', 0.05, 0.14);
      this._tone(640, 640, 0.16, 'square', 0.05, 0.28);
    }
  }
}
