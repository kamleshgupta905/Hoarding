/**
 * 🔌 liveSession.js — Gemini Live API WebSocket lifecycle manager
 *
 * Handles: setup message, PCM streaming, serverContent, toolCall → toolResponse,
 * barge-in (interrupted), goAway → reconnect with exponential backoff,
 * sessionResumptionUpdate.
 *
 * Reference: https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket
 */

import { TOOL_DECLARATIONS, JARVIS_VOICE_NAME, executeTool } from './tools.js';

const LIVE_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MODEL        = 'models/gemini-2.0-flash-exp';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_MS      = 1000;

/**
 * @typedef {object} SessionHandlers
 * @property {function(string): void}         onInputTranscript  — user speech text
 * @property {function(string): void}         onOutputTranscript — model speech text
 * @property {function(string): void}         onAudioChunk       — base64 Int16 PCM from model
 * @property {function(): void}               onInterrupted      — barge-in: flush audio
 * @property {function(string): void}         onStateChange      — 'connecting'|'live'|'reconnecting'|'error'|'idle'
 * @property {function(string): void}         onError            — human-readable error message
 * @property {function(): string}             getSystemInstruction — dynamic system prompt
 * @property {object}                         toolCtx            — context for executeTool()
 */

export class LiveSession {
  /**
   * @param {SessionHandlers} handlers
   */
  constructor(handlers) {
    this._h                = handlers;
    /** @type {WebSocket|null} */
    this._ws               = null;
    this._reconnectAttempt = 0;
    this._reconnectTimer   = null;
    this._sessionHandle    = null;  // for session resumption
    this._closed           = false;
    this._reconnectingSilently = false;
  }

  // ─────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────

  /** Establish a new Live API WebSocket session */
  async connect() {
    this._closed = false;
    await this._openSocket();
  }

  /** Send a base64-encoded PCM chunk to the model */
  sendAudio(base64Chunk) {
    if (!this._isOpen()) return;
    const msg = {
      realtimeInput: {
        audio: {
          data:     base64Chunk,
          mimeType: 'audio/pcm;rate=16000',
        },
      },
    };
    this._send(msg);
  }

  /** Send typed user prompt over the live session */
  sendText(text) {
    if (!this._isOpen() || !text?.trim()) return;
    const msg = {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text: text.trim() }],
        }],
        turnComplete: true,
      },
    };
    this._send(msg);
  }

  /** Gracefully close the session */
  close() {
    this._closed = true;
    clearTimeout(this._reconnectTimer);
    if (this._ws) {
      try { this._ws.close(1000, 'User ended call'); } catch { /* noop */ }
      this._ws = null;
    }
    this._h.onStateChange('idle');
  }

  // ─────────────────────────────────────────────────────────────────
  // PRIVATE: socket lifecycle
  // ─────────────────────────────────────────────────────────────────

  async _openSocket() {
    // Resolve API key / ephemeral token
    let key = '';
    const fallbackKey = (typeof window !== 'undefined' && (
      window.localStorage?.getItem('adh_gemini_api_key') ||
      window.localStorage?.getItem('gemini_api_key')
    )) ||
    import.meta.env?.VITE_GEMINI_LIVE_KEY ||
    import.meta.env?.VITE_GEMINI_API_KEY ||
    import.meta.env?.VITE_GEMINI_API_KEY_1 ||
    import.meta.env?.VITE_GEMINI_API_KEY_2 ||
    import.meta.env?.VITE_GEMINI_API_KEY_3 ||
    import.meta.env?.VITE_GEMINI_API_KEY_4 ||
    '';

    try {
      if (window.electronAPI?.getJarvisLiveToken) {
        key = await window.electronAPI.getJarvisLiveToken(fallbackKey);
      } else {
        key = fallbackKey;
        if (!key) {
          this._h.onError(
            'Gemini Live API key nahi mili. Settings me VITE_GEMINI_LIVE_KEY set karein ya admin settings me key paste karein.'
          );
          this._h.onStateChange('error');
          return;
        }
        // Show web-mode insecurity banner (non-fatal)
        console.warn('[Jarvis] Web mode: API key is in renderer. Use Electron for production.');
      }
    } catch (err) {
      this._h.onError(`Token fetch failed: ${err.message}`);
      this._h.onStateChange('error');
      return;
    }

    const url = `${LIVE_WS_BASE}?key=${encodeURIComponent(key)}`;

    const state = this._reconnectAttempt === 0 ? 'connecting' : 'reconnecting';
    this._h.onStateChange(state);

    try {
      this._ws = new WebSocket(url);
    } catch (err) {
      this._handleFatalError(`WebSocket create failed: ${err.message}`);
      return;
    }

    this._ws.onopen    = () => this._onOpen();
    this._ws.onmessage = (ev) => this._onMessage(ev);
    this._ws.onerror   = ()  => {}; // onerror fires before onclose; onclose handles retry
    this._ws.onclose   = (ev) => this._onClose(ev);
  }

  _onOpen() {
    this._reconnectAttempt = 0;
    this._send(this._buildSetupMessage());
    // State changes to 'live' after server confirms setup (first serverContent)
  }

  _buildSetupMessage() {
    const sysInstruction = this._h.getSystemInstruction?.() || '';
    const msg = {
      setup: {
        model: MODEL,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: JARVIS_VOICE_NAME },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: sysInstruction }],
        },
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        inputAudioTranscription:  {},
        outputAudioTranscription: {},
      },
    };

    // Resume previous session if handle available
    if (this._sessionHandle) {
      msg.setup.sessionResumption = { handle: this._sessionHandle };
    }

    return msg;
  }

  async _onMessage(ev) {
    let data;
    try {
      const text = typeof ev.data === 'string' ? ev.data : await ev.data.text();
      data = JSON.parse(text);
    } catch {
      return;
    }

    // ── Setup complete ────────────────────────────────────────────
    if (data.setupComplete) {
      this._h.onStateChange('live');
      this._reconnectingSilently = false;
      return;
    }

    // ── Session resumption handle ─────────────────────────────────
    if (data.sessionResumptionUpdate?.newHandle) {
      this._sessionHandle = data.sessionResumptionUpdate.newHandle;
    }

    // ── goAway: server is shutting down this connection ───────────
    if (data.goAway) {
      this._scheduleReconnect('Server go-away. Reconnecting...');
      return;
    }

    // ── serverContent ─────────────────────────────────────────────
    if (data.serverContent) {
      const sc = data.serverContent;

      // Barge-in
      if (sc.interrupted) {
        this._h.onInterrupted();
        return;
      }

      // Audio parts
      const parts = sc.modelTurn?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith('audio/pcm')) {
          this._h.onAudioChunk(part.inlineData.data);
        }
      }

      // Transcripts
      if (sc.inputTranscription?.text) {
        this._h.onInputTranscript(sc.inputTranscription.text);
      }
      if (sc.outputTranscription?.text) {
        this._h.onOutputTranscript(sc.outputTranscription.text);
      }
    }

    // ── toolCall ──────────────────────────────────────────────────
    if (data.toolCall) {
      const calls = data.toolCall.functionCalls || [];
      const responses = [];

      for (const call of calls) {
        let result;
        try {
          result = await executeTool(call.name, call.args || {}, this._h.toolCtx || {});
        } catch (err) {
          result = { error: err.message };
        }
        responses.push({
          id:       call.id,
          name:     call.name,
          response: { output: result },
        });
      }

      this._send({ toolResponse: { functionResponses: responses } });
    }
  }

  _onClose(ev) {
    if (this._closed) return;

    const code = ev.code;
    // 1000 = normal, 1001 = going away (server restart)
    if (code === 1000 || code === 1001) {
      this._scheduleReconnect(null); // transparent
      return;
    }
    // WebSocket codes indicating voice stream closed
    if (code === 1008 || code === 4001) {
      const msg = ev.reason ? `Voice stream: ${ev.reason}` : 'Jarvis intelligent assistant active (3.8 Flash).';
      this._h.onError(msg);
      this._h.onStateChange('rest-fallback');
      return;
    }

    this._scheduleReconnect(null);
  }

  _scheduleReconnect(userMessage) {
    if (this._closed) return;
    if (this._reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this._h.onError('Jarvis intelligent assistant active (3.8 Flash).');
      this._h.onStateChange('rest-fallback');
      return;
    }

    const delayMs = Math.min(RECONNECT_BASE_MS * 2 ** this._reconnectAttempt, 30_000);
    this._reconnectAttempt++;

    if (delayMs > 2000) {
      // Only tell user if reconnect takes > 2 seconds
      if (userMessage) this._h.onError(userMessage);
      this._h.onStateChange('reconnecting');
    } else {
      this._reconnectingSilently = true;
    }

    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      if (!this._closed) this._openSocket();
    }, delayMs);
  }

  _handleFatalError(msg) {
    this._h.onError(msg || 'Jarvis intelligent assistant active (3.8 Flash).');
    this._h.onStateChange('rest-fallback');
  }

  _send(obj) {
    if (!this._isOpen()) return;
    try {
      this._ws.send(JSON.stringify(obj));
    } catch { /* noop */ }
  }

  _isOpen() {
    return this._ws?.readyState === WebSocket.OPEN;
  }
}
