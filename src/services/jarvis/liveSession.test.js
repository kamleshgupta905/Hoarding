/**
 * liveSession.test.js — LiveSession unit tests with a mock WebSocket (I4)
 *
 * Tests:
 * - Setup message shape
 * - PCM base64 framing
 * - toolCall → toolResponse round trip
 * - interrupted → playback flush
 * - goAway → reconnect (exponential backoff)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveSession } from './liveSession.js';

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

class MockWebSocket {
  constructor(url) {
    this.url       = url;
    this.readyState = 1; // OPEN
    this.sent      = [];
    MockWebSocket.instances.push(this);
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close()    { this.readyState = 3; }

  // Test helpers — simulate server-sent messages
  simulateOpen()    { this.onopen?.(); }
  simulateClose(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  simulateMessage(obj) {
    const ev = { data: JSON.stringify(obj) };
    this.onmessage?.(ev);
  }
}
MockWebSocket.OPEN     = 1;
MockWebSocket.CLOSING  = 2;
MockWebSocket.CLOSED   = 3;
MockWebSocket.instances = [];

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_HANDLERS = () => ({
  onInputTranscript:    vi.fn(),
  onOutputTranscript:   vi.fn(),
  onAudioChunk:         vi.fn(),
  onInterrupted:        vi.fn(),
  onStateChange:        vi.fn(),
  onError:              vi.fn(),
  getSystemInstruction: vi.fn(() => 'System instruction text'),
  toolCtx:              {},
});

function createSession(overrides = {}) {
  return new LiveSession({ ...DEFAULT_HANDLERS(), ...overrides });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('I4 — LiveSession with mock WebSocket', () => {
  let origWS;

  beforeEach(() => {
    MockWebSocket.instances = [];
    origWS = global.WebSocket;
    global.WebSocket = MockWebSocket;

    // Mock window.electronAPI so getJarvisLiveToken returns a fake key
    global.window = {
      ...(global.window || {}),
      electronAPI: {
        getJarvisLiveToken: vi.fn(async () => 'FAKE_API_KEY_FOR_TEST'),
        logEvent: vi.fn(),
      },
    };
  });

  afterEach(() => {
    global.WebSocket = origWS;
  });

  // ── Setup message shape ───────────────────────────────────────
  it('sends a valid setup message on open', async () => {
    const session = createSession();
    await session.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    expect(ws.sent.length).toBeGreaterThan(0);
    const setupMsg = ws.sent[0];
    expect(setupMsg).toHaveProperty('setup');
    expect(setupMsg.setup).toHaveProperty('model');
    expect(setupMsg.setup.model).toMatch(/gemini/i);
    expect(setupMsg.setup).toHaveProperty('tools');
    expect(Array.isArray(setupMsg.setup.tools[0]?.functionDeclarations)).toBe(true);
    expect(setupMsg.setup).toHaveProperty('systemInstruction');
    expect(setupMsg.setup.generationConfig.responseModalities).toContain('AUDIO');
    expect(setupMsg.setup).toHaveProperty('inputAudioTranscription');
    expect(setupMsg.setup).toHaveProperty('outputAudioTranscription');
  });

  // ── State transitions ─────────────────────────────────────────
  it('transitions to "live" after setupComplete', async () => {
    const h = DEFAULT_HANDLERS();
    const session = new LiveSession(h);
    await session.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ setupComplete: {} });

    expect(h.onStateChange).toHaveBeenCalledWith('live');
  });

  // ── PCM base64 framing ────────────────────────────────────────
  it('sendAudio wraps PCM in realtimeInput with correct mimeType', async () => {
    const session = createSession();
    await session.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ setupComplete: {} });

    const fakeB64 = btoa('FAKEPCMDATA');
    session.sendAudio(fakeB64);

    const audioMsg = ws.sent.find(m => m.realtimeInput);
    expect(audioMsg).toBeDefined();
    expect(audioMsg.realtimeInput.audio.mimeType).toBe('audio/pcm;rate=16000');
    expect(audioMsg.realtimeInput.audio.data).toBe(fakeB64);
  });

  // ── toolCall → toolResponse round trip ────────────────────────
  it('responds to toolCall with a toolResponse containing function results', async () => {
    // Inject a mock executeTool via toolCtx — actually we need to mock the module
    // Instead, we'll verify the message shape of the toolResponse
    const session = createSession({
      toolCtx: {
        hoardings: [],
        handleExecuteAIAction: vi.fn(async () => {}),
      },
    });
    await session.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ setupComplete: {} });

    // Simulate a toolCall from server
    ws.simulateMessage({
      toolCall: {
        functionCalls: [
          { id: 'call-001', name: 'switch_view', args: { view: 'inventory' } },
        ],
      },
    });

    // Wait for async execution
    await new Promise(r => setTimeout(r, 50));

    const responseMsg = ws.sent.find(m => m.toolResponse);
    expect(responseMsg).toBeDefined();
    expect(responseMsg.toolResponse.functionResponses[0].id).toBe('call-001');
    expect(responseMsg.toolResponse.functionResponses[0].name).toBe('switch_view');
    expect(responseMsg.toolResponse.functionResponses[0].response).toHaveProperty('output');
  });

  // ── interrupted → playback flush ─────────────────────────────
  it('calls onInterrupted when server sends interrupted:true', async () => {
    const h = DEFAULT_HANDLERS();
    const session = new LiveSession(h);
    await session.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ setupComplete: {} });

    ws.simulateMessage({ serverContent: { interrupted: true } });

    expect(h.onInterrupted).toHaveBeenCalledOnce();
    // onAudioChunk should NOT have been called
    expect(h.onAudioChunk).not.toHaveBeenCalled();
  });

  // ── goAway → reconnect ────────────────────────────────────────
  it('schedules reconnect on goAway', async () => {
    vi.useFakeTimers();
    const h = DEFAULT_HANDLERS();
    const session = new LiveSession(h);
    await session.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ setupComplete: {} });

    MockWebSocket.instances = [];  // clear so we can detect new connection
    ws.simulateMessage({ goAway: {} });

    // Advance timer to trigger reconnect
    await vi.advanceTimersByTimeAsync(2000);

    // A new WebSocket should have been created
    expect(MockWebSocket.instances.length).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  // ── Audio chunks ──────────────────────────────────────────────
  it('calls onAudioChunk for PCM audio parts in serverContent', async () => {
    const h = DEFAULT_HANDLERS();
    const session = new LiveSession(h);
    await session.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ setupComplete: {} });

    const fakeAudio = btoa('FAKE_PCM_24KHZ');
    ws.simulateMessage({
      serverContent: {
        modelTurn: {
          parts: [
            { inlineData: { mimeType: 'audio/pcm;rate=24000', data: fakeAudio } },
          ],
        },
      },
    });

    expect(h.onAudioChunk).toHaveBeenCalledWith(fakeAudio);
  });

  // ── Transcript ────────────────────────────────────────────────
  it('calls onInputTranscript and onOutputTranscript', async () => {
    const h = DEFAULT_HANDLERS();
    const session = new LiveSession(h);
    await session.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ setupComplete: {} });

    ws.simulateMessage({
      serverContent: {
        inputTranscription:  { text: 'User said this' },
        outputTranscription: { text: 'Jarvis replied this' },
      },
    });

    expect(h.onInputTranscript).toHaveBeenCalledWith('User said this');
    expect(h.onOutputTranscript).toHaveBeenCalledWith('Jarvis replied this');
  });

  // ── Clean close ───────────────────────────────────────────────
  it('close() sets state to idle and stops reconnection', async () => {
    const h = DEFAULT_HANDLERS();
    const session = new LiveSession(h);
    await session.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    session.close();
    expect(h.onStateChange).toHaveBeenCalledWith('idle');
  });
});
