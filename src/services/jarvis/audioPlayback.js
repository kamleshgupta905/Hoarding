/**
 * 🔊 audioPlayback.js — 24 kHz PCM playback with scheduled playhead
 *
 * Queues Int16 chunks from the model onto a single AudioContext.
 * Uses a scheduled playhead to eliminate gaps between chunks.
 * flush() hard-stops immediately on server-side barge-in.
 */

const PLAYBACK_SAMPLE_RATE = 24_000; // Gemini Live API output

export class AudioPlayback {
  constructor({ onRms } = {}) {
    /** @type {AudioContext|null} */
    this._ctx         = null;
    /** @type {number} */
    this._nextTime    = 0;
    /** @type {AudioBufferSourceNode[]} */
    this._scheduled   = [];
    /** @type {GainNode|null} */
    this._gain        = null;
    this._onRms       = onRms || null;
    /** @type {AnalyserNode|null} */
    this._analyser    = null;
    this._rmsFrame    = null;
    this._active      = false;
  }

  _ensureContext() {
    if (this._ctx && this._ctx.state !== 'closed') return;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this._ctx   = new AudioCtx({ sampleRate: PLAYBACK_SAMPLE_RATE });
    this._gain  = this._ctx.createGain();
    this._gain.gain.value = 1.0;

    if (this._onRms) {
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._gain.connect(this._analyser);
      this._analyser.connect(this._ctx.destination);
      this._startRmsLoop();
    } else {
      this._gain.connect(this._ctx.destination);
    }

    this._nextTime = this._ctx.currentTime + 0.05; // small initial buffer
    this._active   = true;
  }

  /**
   * Explicitly unlock/resume the AudioContext via a user click gesture.
   */
  async resume() {
    this._ensureContext();
    if (this._ctx && this._ctx.state === 'suspended') {
      try {
        await this._ctx.resume();
      } catch (e) {
        console.warn('[AudioPlayback] resume failed:', e);
      }
    }
  }

  _startRmsLoop() {
    const data = new Uint8Array(this._analyser.frequencyBinCount);
    const tick = () => {
      if (!this._analyser || !this._active) return;
      this._analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      this._onRms(Math.min(1, rms * 3));
      this._rmsFrame = requestAnimationFrame(tick);
    };
    this._rmsFrame = requestAnimationFrame(tick);
  }

  /**
   * Queue a base64-encoded Int16 PCM chunk from the model.
   * @param {string} base64
   */
  enqueue(base64) {
    if (!base64) return;
    this._ensureContext();

    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }

    const int16 = base64ToInt16(base64);
    if (!int16 || int16.length === 0) return;

    // Convert Int16 → Float32
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = this._ctx.createBuffer(1, float32.length, PLAYBACK_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = this._ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this._gain);

    const currentTime = this._ctx.currentTime;
    const startAt = Math.max(currentTime + 0.01, this._nextTime);
    source.start(startAt);
    this._nextTime = startAt + buffer.duration;

    this._scheduled.push(source);
    source.onended = () => {
      const idx = this._scheduled.indexOf(source);
      if (idx !== -1) this._scheduled.splice(idx, 1);
    };
  }

  /**
   * Hard-stop all queued audio immediately (barge-in / interruption).
   */
  flush() {
    const now = this._ctx?.currentTime ?? 0;
    this._scheduled.forEach(src => {
      try { src.stop(now); } catch { /* noop */ }
    });
    this._scheduled = [];
    this._nextTime  = now + 0.01;
    if (this._onRms) this._onRms(0);
  }

  /**
   * Fully close and release AudioContext.
   */
  close() {
    this._active = false;
    if (this._rmsFrame) cancelAnimationFrame(this._rmsFrame);
    this._rmsFrame = null;
    this.flush();
    if (this._gain) {
      try { this._gain.disconnect(); } catch { /* noop */ }
      this._gain = null;
    }
    if (this._analyser) {
      try { this._analyser.disconnect(); } catch { /* noop */ }
      this._analyser = null;
    }
    if (this._ctx && this._ctx.state !== 'closed') {
      this._ctx.close().catch(() => {});
      this._ctx = null;
    }
    if (this._onRms) this._onRms(0);
  }
}

/** Convert base64 string to Int16Array */
function base64ToInt16(b64) {
  try {
    const binary  = atob(b64);
    const bytes   = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  } catch {
    return null;
  }
}
