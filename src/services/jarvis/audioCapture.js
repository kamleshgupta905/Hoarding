/**
 * 🎙️ audioCapture.js — Mic input via AudioWorklet (Blob URL) + ScriptProcessor fallback
 *
 * Captures 16-bit PCM at 16 kHz for Gemini Live API.
 * Emits real RMS values for the waveform visualizer.
 * Bulletproof in both Web (HTTP) and Packaged Electron (file://) environments.
 */

const SAMPLE_RATE = 16_000; // Gemini Live API requirement

// Inline AudioWorklet processor code — loaded via Blob URL to avoid file:// resolution bugs in Electron
const WORKLET_PROCESSOR_CODE = `
class JarvisPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._chunkSize = 4096;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0];
    for (let i = 0; i < samples.length; i++) {
      this._buffer.push(samples[i]);
    }

    while (this._buffer.length >= this._chunkSize) {
      const chunk = this._buffer.splice(0, this._chunkSize);
      const int16 = new Int16Array(chunk.length);
      let sumSq = 0;

      for (let i = 0; i < chunk.length; i++) {
        const clamped = Math.max(-1, Math.min(1, chunk[i]));
        int16[i] = clamped * 32767;
        sumSq += clamped * clamped;
      }

      const rms = Math.sqrt(sumSq / chunk.length);
      this.port.postMessage({ pcmInt16: int16, rms }, [int16.buffer]);
    }

    return true;
  }
}

registerProcessor('jarvis-pcm-processor', JarvisPcmProcessor);
`;

/**
 * @typedef {object} CaptureHandlers
 * @property {function(string): void}  onChunk — called with base64-encoded Int16 PCM
 * @property {function(number): void}  onRms   — called with 0..1 RMS for waveform
 * @property {function(Error): void}   onError — called on fatal mic errors
 */

export class AudioCapture {
  constructor() {
    /** @type {MediaStream|null} */
    this._stream          = null;
    /** @type {AudioContext|null} */
    this._ctx             = null;
    /** @type {AudioWorkletNode|null} */
    this._worklet         = null;
    /** @type {ScriptProcessorNode|null} */
    this._scriptProcessor = null;
    /** @type {GainNode|null} */
    this._silentGain      = null;
    /** @type {MediaStreamAudioSourceNode|null} */
    this._source          = null;
    this._active          = false;
  }

  /**
   * Start capturing microphone audio.
   * @param {CaptureHandlers} handlers
   * @returns {Promise<void>}
   */
  async start({ onChunk, onRms, onError }) {
    if (this._active) return;

    // Request mic stream
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
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

    // Create AudioContext at 16 kHz
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this._ctx = new AudioCtx({ sampleRate: SAMPLE_RATE });

    if (this._ctx.state === 'suspended') {
      try {
        await this._ctx.resume();
      } catch (e) {
        console.warn('[AudioCapture] ctx resume warning:', e);
      }
    }

    this._source = this._ctx.createMediaStreamSource(this._stream);
    this._active = true;

    // Try modern AudioWorklet via inline Blob URL
    let workletLoaded = false;
    if (this._ctx.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        await this._ctx.audioWorklet.addModule(blobUrl);
        URL.revokeObjectURL(blobUrl);

        this._worklet = new AudioWorkletNode(this._ctx, 'jarvis-pcm-processor');
        this._source.connect(this._worklet);

        this._worklet.port.onmessage = (ev) => {
          if (!this._active) return;
          const { pcmInt16, rms } = ev.data;
          if (typeof onRms === 'function') onRms(rms);
          if (typeof onChunk === 'function' && pcmInt16) {
            onChunk(int16ToBase64(pcmInt16));
          }
        };

        workletLoaded = true;
      } catch (workletErr) {
        console.warn('[AudioCapture] AudioWorklet init failed, falling back to ScriptProcessor:', workletErr);
      }
    }

    // Fallback: ScriptProcessorNode (works in 100% of Chromium/Electron environments)
    if (!workletLoaded) {
      try {
        const bufferSize = 4096;
        const scriptNode = this._ctx.createScriptProcessor(bufferSize, 1, 1);
        this._scriptProcessor = scriptNode;

        scriptNode.onaudioprocess = (ev) => {
          if (!this._active) return;
          const input = ev.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(input.length);
          let sumSq = 0;

          for (let i = 0; i < input.length; i++) {
            const clamped = Math.max(-1, Math.min(1, input[i]));
            int16[i] = clamped * 32767;
            sumSq += clamped * clamped;
          }

          const rms = Math.sqrt(sumSq / input.length);
          if (typeof onRms === 'function') onRms(rms);
          if (typeof onChunk === 'function') onChunk(int16ToBase64(int16));
        };

        this._source.connect(scriptNode);

        // Connect through a muted gain to destination so audio ticks continuously
        this._silentGain = this._ctx.createGain();
        this._silentGain.gain.value = 0;
        scriptNode.connect(this._silentGain);
        this._silentGain.connect(this._ctx.destination);
      } catch (spErr) {
        onError(new Error(`Audio pipeline failed: ${spErr.message}`));
        this.stop();
      }
    }
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
    if (this._scriptProcessor) {
      try { this._scriptProcessor.disconnect(); } catch { /* noop */ }
      this._scriptProcessor = null;
    }
    if (this._silentGain) {
      try { this._silentGain.disconnect(); } catch { /* noop */ }
      this._silentGain = null;
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
