/**
 * jarvis-pcm-worklet.js — AudioWorklet processor for 16 kHz PCM capture
 *
 * Deployed to /public/ so the renderer can load it with:
 *   await audioContext.audioWorklet.addModule('/jarvis-pcm-worklet.js')
 *
 * Receives 128-sample Float32 blocks from the AudioContext,
 * converts to Int16 LE, computes RMS, and posts both to the main thread.
 *
 * ScriptProcessorNode is deprecated — this is the correct modern approach.
 */

class JarvisPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    // Accumulate 4096 samples (~256ms at 16kHz) before sending a chunk
    this._chunkSize = 4096;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0]; // Float32Array, 128 samples

    // Accumulate
    for (let i = 0; i < samples.length; i++) {
      this._buffer.push(samples[i]);
    }

    // When we have a full chunk, convert and post
    while (this._buffer.length >= this._chunkSize) {
      const chunk   = this._buffer.splice(0, this._chunkSize);
      const int16   = new Int16Array(chunk.length);
      let   sumSq   = 0;

      for (let i = 0; i < chunk.length; i++) {
        const clamped = Math.max(-1, Math.min(1, chunk[i]));
        int16[i]      = clamped * 32767;
        sumSq        += clamped * clamped;
      }

      const rms = Math.sqrt(sumSq / chunk.length);

      // Transfer the underlying buffer (zero-copy)
      this.port.postMessage({ pcmInt16: int16, rms }, [int16.buffer]);
    }

    return true; // keep processor alive
  }
}

registerProcessor('jarvis-pcm-processor', JarvisPcmProcessor);
