/**
 * 🎙️ audioCapture.js — Mic input via AudioWorklet → 16-bit PCM base64
 *
 * Replaces MediaRecorder + Web Speech API entirely.
 * Uses the AudioWorklet processor in /public/jarvis-pcm-worklet.js.
 * Emits real RMS values for the waveform visualizer.
 */

const SAMPLE_RATE = 16_000;  // Gemini Live API requirement

/**
 * @typedef {object} CaptureHandlers
 * @property {function(string): void}   onChunk  — called with base64-encoded Int16 PCM per worklet block
 * @property {function(number): void}  onRms    — called with 0..1 RMS for waveform
 * @property {function(Error): void}   onError  — called on fatal mic errors
 */

export class AudioCapture {
  constructor() {
    /** @type {MediaStream|null} */
    this._stream  = null;
    /** @type {AudioContext|null} */
    this._ctx     = null;
    /** @type {AudioWorkletNode|null} */
    this._worklet = null;
    /** @type {MediaStreamAudioSourceNode|null} */
    this._source  = null;
    this._active  = false;
  }

  /**
   * Start capturing microphone audio.
   * @param {CaptureHandlers} handlers
   * @returns {Promise<void>}
   */
  async start({ onChunk, onRms, onError }) {
    if (this._active) return;

    // Request mic permission
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      const msg =
        err.name === 'NotAllowedError'  ? 'Mic permission denied. Please allow microphone access and retry.' :
        err.name === 'NotFoundError'    ? 'No microphone device found. Please connect a mic and retry.' :
        err.name === 'NotReadableError' ? 'Microphone is busy (used by another app). Please close other apps and retry.' :
        `Microphone error: ${err.message}`;
      onError(Object.assign(new Error(msg), { originalError: err }));
      return;
    }

    // Create AudioContext at target sample rate
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this._ctx = new AudioCtx({ sampleRate: SAMPLE_RATE });

    // Load the AudioWorklet processor
    try {
      await this._ctx.audioWorklet.addModule('/jarvis-pcm-worklet.js');
    } catch (err) {
      onError(new Error(`AudioWorklet load failed: ${err.message}`));
      this._cleanupStream();
      return;
    }

    this._source  = this._ctx.createMediaStreamSource(this._stream);
    this._worklet = new AudioWorkletNode(this._ctx, 'jarvis-pcm-processor');
    this._source.connect(this._worklet);

    // Receive processed PCM chunks from worklet
    this._worklet.port.onmessage = (ev) => {
      if (!this._active) return;
      const { pcmInt16, rms } = ev.data;
      if (typeof onRms === 'function') onRms(rms);
      if (typeof onChunk === 'function' && pcmInt16) {
        onChunk(int16ToBase64(pcmInt16));
      }
    };

    this._active = true;
  }

  /**
   * Stop capture and release all resources.
   */
  stop() {
    this._active = false;
    if (this._worklet) {
      try { this._worklet.port.close(); } catch { /* noop */ }
      try { this._worklet.disconnect(); } catch { /* noop */ }
      this._worklet = null;
    }
    if (this._source) {
      try { this._source.disconnect(); } catch { /* noop */ }
      this._source = null;
    }
    if (this._ctx && this._ctx.state !== 'closed') {
      this._ctx.close().catch(() => {});
      this._ctx = null;
    }
    this._cleanupStream();
  }

  _cleanupStream() {
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
  }

  get isActive() { return this._active; }
}

/**
 * Convert an Int16Array to a base64 string.
 * @param {Int16Array} int16
 * @returns {string}
 */
function int16ToBase64(int16) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
