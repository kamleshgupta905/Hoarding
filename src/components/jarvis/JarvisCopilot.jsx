import React, {
  useState, useEffect, useRef, useCallback, Suspense
} from 'react';
import {
  MicOff, Power, ChevronDown, Loader2, Check, Send, Sparkles
} from 'lucide-react';
import localAvatar from '../../assets/krishna_avatar.jpg';

// ─── Lazy-loaded heavy modules (keeps AdminDashboard chunk small) ────────────
const loadJarvisCore = () => import('../../services/jarvis/liveSession.js');
const loadAudioCapture = () => import('../../services/jarvis/audioCapture.js');
const loadAudioPlayback = () => import('../../services/jarvis/audioPlayback.js');

// ─── Connection states ───────────────────────────────────────────────────────
const STATE = {
  IDLE:           'idle',
  REQUESTING_MIC: 'requesting-mic',
  CONNECTING:     'connecting',
  LIVE:           'live',
  RECONNECTING:   'reconnecting',
  ERROR:          'error',
};

const STATE_LABEL = {
  [STATE.IDLE]:           'Online',
  [STATE.REQUESTING_MIC]: 'Mic Permission...',
  [STATE.CONNECTING]:     'Connecting...',
  [STATE.LIVE]:           'Live',
  [STATE.RECONNECTING]:   'Reconnecting...',
  [STATE.ERROR]:          'Error',
};

// ─── Constants ───────────────────────────────────────────────────────────────
const AVATAR_URL = localAvatar;
const ACCENT     = '#5F6FFF';
const MAX_TRANSCRIPT_LINES = 40;

// ─────────────────────────────────────────────────────────────────────────────
// JarvisCopilot — real-time speech-to-speech via Gemini Live API
// ─────────────────────────────────────────────────────────────────────────────

export default function JarvisCopilot({
  hoardings         = [],
  activeTab         = 'inventory',
  onExecuteAction   = null,
  dataService       = {},
  setters           = {},
}) {
  // ── UI state ───────────────────────────────────────────────────
  const [isOpen,        setIsOpen]        = useState(false);
  const [connState,     setConnState]     = useState(STATE.IDLE);
  const [isMuted,       setIsMuted]       = useState(false);
  const [callDuration,  setCallDuration]  = useState(0);
  const [userRms,       setUserRms]       = useState(0);
  const [modelRms,      setModelRms]      = useState(0);
  const [transcripts,   setTranscripts]   = useState([]);   // [{role, text}]
  const [successCard,   setSuccessCard]   = useState(null);
  const [errorMsg,      setErrorMsg]      = useState(null);
  const [manualInput,   setManualInput]   = useState('');
  const [isManualBusy,  setIsManualBusy]  = useState(false);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [showKeyInput,  setShowKeyInput]  = useState(false);

  // ── Refs (stable across renders, no stale closures) ───────────
  const sessionRef        = useRef(null);
  const captureRef        = useRef(null);
  const playbackRef       = useRef(null);
  const timerRef          = useRef(null);
  const hoardingsRef      = useRef(hoardings);
  const activeTabRef      = useRef(activeTab);
  const isMutedRef        = useRef(isMuted);
  const connStateRef      = useRef(STATE.IDLE);
  const manualBusyRef     = useRef(false);

  useEffect(() => { hoardingsRef.current   = hoardings;  }, [hoardings]);
  useEffect(() => { activeTabRef.current   = activeTab;  }, [activeTab]);
  useEffect(() => { isMutedRef.current     = isMuted;    }, [isMuted]);
  useEffect(() => { connStateRef.current   = connState;  }, [connState]);

  // ── Ctrl+Shift+J + Electron IPC ───────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);

    let unsub = null;
    if (window.electronAPI?.onToggleJarvis) {
      unsub = window.electronAPI.onToggleJarvis(() => setIsOpen(prev => !prev));
    }

    return () => {
      window.removeEventListener('keydown', onKey);
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // ── Call duration timer ───────────────────────────────────────
  useEffect(() => {
    if (connState === STATE.LIVE) {
      setCallDuration(0);
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [connState]);

  const formatDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  // ── Append transcript lines ───────────────────────────────────
  const appendTranscript = useCallback((role, text) => {
    if (!text?.trim()) return;
    setTranscripts(prev => {
      const next = [...prev, { role, text: text.trim() }];
      return next.length > MAX_TRANSCRIPT_LINES ? next.slice(-MAX_TRANSCRIPT_LINES) : next;
    });
  }, []);

  // ── System instruction (dynamic, injected into each session) ──
  const getSystemInstruction = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const count = hoardingsRef.current.length;
    const cities = [...new Set(hoardingsRef.current.map(h => h.City).filter(Boolean))].slice(0, 8).join(', ');

    return `You are Jarvis, the voice copilot for Heera Advertising's OOH billboard desk.
Speak natural Hinglish — Hindi grammar, English for business terms (site, booking, available, override, proposal).
ONE short sentence per reply unless asked for a list. This is a phone call, not a document.
Today is ${today}. Current view: ${activeTabRef.current}. Inventory loaded: ${count} sites. Cities: ${cities || 'Meerut, Delhi, Noida'}.
Rules:
- Never invent a site, price, date or count. If you do not have it, call a tool.
- Before any booking, read back site + client + start + end and wait for "haan".
- If a site name is ambiguous, ask which one. Never guess.
- Resolve relative dates to exact YYYY-MM-DD before calling a tool.
- Say numbers in Hindi words: "do sau pachaas", not "250".
- If a tool returns an error, say plainly what went wrong. Do not pretend it worked.
- Who built you: "Mujhe Scallar IT Solution ke developer Kamlesh Gupta ji ne banaya hai."`;
  }, []);

  // ── Tool context passed to executeTool ────────────────────────
  const buildToolCtx = useCallback(() => ({
    hoardings:          hoardingsRef.current,
    handleExecuteAIAction: onExecuteAction,
    dataService,
    setters,
  }), [onExecuteAction, dataService, setters]);

  // ── Start live session ────────────────────────────────────────
  const handleStartCall = useCallback(async () => {
    if (!isOpen) { setIsOpen(true); return; }
    if (connState !== STATE.IDLE && connState !== STATE.ERROR) return;

    setErrorMsg(null);
    setSuccessCard(null);
    setTranscripts([]);
    setConnState(STATE.REQUESTING_MIC);

    // Lazy-load modules
    const [{ AudioCapture }, { AudioPlayback }, { LiveSession }] = await Promise.all([
      loadAudioCapture(),
      loadAudioPlayback(),
      loadJarvisCore(),
    ]);

    // Playback (model → speaker)
    const playback = new AudioPlayback({ onRms: (rms) => setModelRms(rms) });
    playbackRef.current = playback;

    // Capture (mic → model)
    const capture = new AudioCapture();
    captureRef.current = capture;

    // Live session
    const session = new LiveSession({
      getSystemInstruction,
      toolCtx: buildToolCtx(),
      onInputTranscript:  (text) => appendTranscript('user',   text),
      onOutputTranscript: (text) => appendTranscript('jarvis', text),
      onAudioChunk:       (b64)  => playback.enqueue(b64),
      onInterrupted:      ()     => playback.flush(),
      onStateChange:      (s) => {
        const mapped = {
          connecting:    STATE.CONNECTING,
          live:          STATE.LIVE,
          reconnecting:  STATE.RECONNECTING,
          error:         STATE.ERROR,
          idle:          STATE.IDLE,
        }[s] || s;
        setConnState(mapped);
      },
      onError: (msg) => {
        setErrorMsg(msg);
        window.electronAPI?.logEvent?.('ERROR', 'Jarvis live session error', msg);
      },
    });
    sessionRef.current = session;

    // Start mic capture — errors surface to user
    await capture.start({
      onChunk: (b64) => {
        if (!isMutedRef.current && connStateRef.current === STATE.LIVE) {
          session.sendAudio(b64);
        }
      },
      onRms:   (rms) => setUserRms(rms),
      onError: (err) => {
        setErrorMsg(err.message);
        setConnState(STATE.ERROR);
        window.electronAPI?.logEvent?.('ERROR', 'Jarvis mic error', err.message);
      },
    });

    if (connStateRef.current === STATE.ERROR) return;  // mic failed

    // Connect WebSocket
    await session.connect();
    window.electronAPI?.logEvent?.('INFO', 'Jarvis Live API session started');
  }, [isOpen, connState, getSystemInstruction, buildToolCtx, appendTranscript]);

  // ── End call ──────────────────────────────────────────────────
  const handleEndCall = useCallback(() => {
    window.electronAPI?.logEvent?.('INFO', 'Jarvis Live API session ended');
    sessionRef.current?.close();
    captureRef.current?.stop();
    playbackRef.current?.close();
    sessionRef.current  = null;
    captureRef.current  = null;
    playbackRef.current = null;
    setConnState(STATE.IDLE);
    setUserRms(0);
    setModelRms(0);
    setIsMuted(false);
    setCallDuration(0);
    setSuccessCard(null);
    setErrorMsg(null);
  }, []);

  // ── Mute / unmute ─────────────────────────────────────────────
  const handleToggleMute = useCallback(() => {
    setIsMuted(m => !m);
  }, []);

  // ── Manual typed command (offline fallback) ───────────────────
  const handleSendManual = useCallback(async (e) => {
    e?.preventDefault?.();
    const cmd = manualInput.trim();
    if (!cmd || manualBusyRef.current) return;
    setManualInput('');
    manualBusyRef.current = true;
    setIsManualBusy(true);
    appendTranscript('user', cmd);

    try {
      const { chatWithJarvis } = await import('../../services/voiceActionEngine.js');
      const res = await chatWithJarvis({
        userText:  cmd,
        hoardings: hoardingsRef.current,
        activeTab: activeTabRef.current,
      });
      if (res) {
        appendTranscript('jarvis', res.reply || 'Theek hai.');
        if (res.action && res.action !== 'NONE' && onExecuteAction) {
          onExecuteAction(res.actionPayload);
        }
        if (res.successCard) setSuccessCard(res.successCard);
      }
    } catch (err) {
      appendTranscript('jarvis', 'Network error. Typed commands still work offline.');
    } finally {
      manualBusyRef.current = false;
      setIsManualBusy(false);
    }
  }, [manualInput, appendTranscript, onExecuteAction]);

  // ── Unmount cleanup ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      captureRef.current?.stop();
      playbackRef.current?.close();
      clearInterval(timerRef.current);
    };
  }, []);

  // ── Compute waveform pulse ring size ──────────────────────────
  const activeRms  = modelRms > 0.02 ? modelRms : userRms;
  const ringOffset = connState === STATE.LIVE ? Math.round(activeRms * 55) : 0;
  const baseSize   = connState === STATE.LIVE ? 96 : 128;

  const isLive      = connState === STATE.LIVE;
  const isConnecting = connState === STATE.CONNECTING || connState === STATE.REQUESTING_MIC || connState === STATE.RECONNECTING;
  const hasError    = connState === STATE.ERROR;

  return (
    <div
      style={{
        position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <style>{`
        @keyframes jarvPing { 75%,100%{ transform:scale(2); opacity:0; } }
        @keyframes jarvPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes jarvSlideUp { from{opacity:0;transform:translateY(16px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
      `}</style>

      {/* ── Copilot card ──────────────────────────────────────── */}
      {isOpen && (
        <div
          style={{
            background: '#ffffff', borderRadius: '2rem',
            boxShadow: '0 20px 60px -15px rgba(0,0,0,0.22)',
            width: '92vw', maxWidth: '340px', height: '560px', maxHeight: '85vh',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            border: '1px solid #f3f4f6', marginBottom: '16px',
            animation: 'jarvSlideUp 0.35s cubic-bezier(0.16,1,0.3,1)',
          }}
          role="dialog"
          aria-label="Jarvis Voice Copilot"
        >
          {/* Header */}
          <div style={{
            background: ACCENT, padding: '16px 20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                overflow: 'hidden', border: '2px solid #fff',
                boxShadow: '0 2px 6px rgba(0,0,0,.1)', flexShrink: 0,
              }}>
                <img src={AVATAR_URL} alt="Jarvis" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div>
                <h3 style={{ color: '#fff', fontSize: '14px', fontWeight: 800, margin: 0 }}>Jarvis</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%', background: '#fff',
                    animation: isLive ? 'jarvPulse 1.5s infinite' : 'none',
                  }} />
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,.75)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    {isLive ? `Live Call • ${formatDuration(callDuration)}` : STATE_LABEL[connState]}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Minimize Jarvis"
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', cursor: 'pointer', padding: '4px' }}
            >
              <ChevronDown size={24} />
            </button>
          </div>

          {/* Body */}
          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>

            {/* Success card overlay */}
            {successCard && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 30,
                background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(5px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px',
              }}>
                <div style={{ background: '#fff', width: '100%', borderRadius: '16px', boxShadow: '0 15px 35px rgba(0,0,0,.12)', border: '1px solid #e0e7ff', overflow: 'hidden' }}>
                  <div style={{ background: '#10b981', padding: '16px', textAlign: 'center' }}>
                    <div style={{ width: '44px', height: '44px', background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', color: '#10b981' }}>
                      <Check size={26} strokeWidth={3.5} />
                    </div>
                    <h3 style={{ color: '#fff', fontWeight: 800, fontSize: '16px', margin: 0 }}>{successCard.title || 'Done!'}</h3>
                  </div>
                  <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#475569' }}>
                    {(successCard.items || []).map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: idx === successCard.items.length - 1 ? 'none' : '1px solid #f1f5f9', paddingBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{item.label}</span>
                        <span style={{ fontWeight: 700, color: '#0f172a', textAlign: 'right', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '12px', background: '#f8fafc', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                    <button type="button" onClick={() => setSuccessCard(null)} style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer' }} aria-label="Dismiss">Dismiss</button>
                  </div>
                </div>
              </div>
            )}

            {/* Avatar + waveform area */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: isLive ? '16px' : '28px', paddingBottom: '4px' }}>
              <div style={{ position: 'relative', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isLive && (
                  <div style={{
                    position: 'absolute', borderRadius: '50%',
                    background: `rgba(95,111,255,0.22)`,
                    width:  `${baseSize + ringOffset}px`,
                    height: `${baseSize + ringOffset}px`,
                    opacity: activeRms > 0.03 ? Math.min(1, 0.3 + activeRms) : 0,
                    transition: 'all 0.1s ease-out',
                    pointerEvents: 'none',
                  }} />
                )}
                <div style={{
                  position: 'relative', zIndex: 10, borderRadius: '50%',
                  overflow: 'hidden', border: '5px solid #fff',
                  boxShadow: '0 10px 35px -5px rgba(0,0,0,.12)',
                  background: '#f1f5f9',
                  width: `${baseSize}px`, height: `${baseSize}px`,
                  transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)',
                }}>
                  <img src={AVATAR_URL} alt="Jarvis" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>

              {/* Error notice */}
              {hasError && errorMsg && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px',
                  padding: '10px 14px', margin: '0 16px 8px', fontSize: '12px', color: '#dc2626',
                  textAlign: 'center', lineHeight: 1.5,
                }}>
                  <strong>⚠️ {errorMsg}</strong>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={handleStartCall}
                      style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}
                      aria-label="Retry connection"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowKeyInput(s => !s)}
                      style={{ background: '#ffffff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '6px', padding: '4px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      {showKeyInput ? 'Hide Key' : 'Set API Key'}
                    </button>
                  </div>
                  {showKeyInput && (
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <input
                        type="password"
                        placeholder="Paste AIza... / Gemini Key"
                        value={customKeyInput}
                        onChange={(e) => setCustomKeyInput(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (customKeyInput.trim()) {
                            localStorage.setItem('adh_gemini_api_key', customKeyInput.trim());
                            localStorage.setItem('gemini_api_key', customKeyInput.trim());
                            setShowKeyInput(false);
                            handleStartCall();
                          }
                        }}
                        style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Save & Connect
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Transcript scroll area */}
              <TranscriptArea transcripts={transcripts} connState={connState} isConnecting={isConnecting} />
            </div>

            {/* Controls */}
            <div style={{ padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Live controls: Mute + End Call */}
              {(isLive || isConnecting) && (
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                    aria-pressed={isMuted}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      background: isMuted ? '#fef2f2' : '#f1f5f9',
                      border: isMuted ? '1px solid #fecaca' : '1px solid #e2e8f0',
                      borderRadius: '20px', padding: '8px 16px',
                      fontSize: '12px', fontWeight: 700,
                      color: isMuted ? '#dc2626' : '#64748b',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <MicOff size={14} />
                    {isMuted ? 'Muted' : 'Mute'}
                  </button>
                  <button
                    type="button"
                    onClick={handleEndCall}
                    aria-label="End call"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      background: '#dc2626', border: 'none',
                      borderRadius: '20px', padding: '8px 18px',
                      fontSize: '12px', fontWeight: 700, color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <Power size={14} />
                    End Call
                  </button>
                </div>
              )}

              {/* Start call button (idle / error) */}
              {!isLive && !isConnecting && (
                <button
                  type="button"
                  onClick={handleStartCall}
                  aria-label="Start Jarvis voice call"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    background: ACCENT, color: '#fff', border: 'none',
                    borderRadius: '14px', padding: '12px',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                >
                  <Sparkles size={16} />
                  Jarvis se baat karein (Real-time)
                </button>
              )}

              {/* Typed command (fallback / offline) */}
              <form onSubmit={handleSendManual} style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                  placeholder="Ya yahan type karein..."
                  aria-label="Type a command for Jarvis"
                  disabled={isManualBusy}
                  style={{
                    flex: 1, border: '1px solid #e2e8f0', borderRadius: '10px',
                    padding: '9px 12px', fontSize: '12px', outline: 'none',
                    background: isManualBusy ? '#f8fafc' : '#fff',
                    color: '#0f172a',
                  }}
                />
                <button
                  type="submit"
                  disabled={!manualInput.trim() || isManualBusy}
                  aria-label="Send typed command"
                  style={{
                    background: ACCENT, border: 'none', borderRadius: '10px',
                    padding: '9px 12px', cursor: manualInput.trim() ? 'pointer' : 'default',
                    opacity: manualInput.trim() ? 1 : 0.4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {isManualBusy
                    ? <Loader2 size={14} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                    : <Send size={14} color="#fff" />}
                </button>
              </form>

              {/* Offline banner */}
              {connState === STATE.ERROR && (
                <p style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'center', margin: 0 }}>
                  Offline mode — AI off. Typed commands still work.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Launcher bubble ──────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-label={isOpen ? 'Minimize Jarvis' : 'Open Jarvis voice copilot'}
        style={{
          width: '56px', height: '56px', borderRadius: '50%',
          background: isLive ? '#10b981' : ACCENT,
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px -4px rgba(0,0,0,0.3)',
          transition: 'all 0.2s ease', position: 'relative',
        }}
      >
        {isLive && (
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: '#10b981', opacity: 0.4,
            animation: 'jarvPing 1.5s cubic-bezier(0,0,.2,1) infinite',
          }} />
        )}
        <img src={AVATAR_URL} alt="Jarvis" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
      </button>
    </div>
  );
}

// ─── TranscriptArea sub-component ────────────────────────────────────────────

function TranscriptArea({ transcripts, connState, isConnecting }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  return (
    <div
      style={{
        width: '100%', flexGrow: 1,
        overflowY: 'auto', padding: '4px 16px 0',
        maxHeight: '180px',
        display: 'flex', flexDirection: 'column', gap: '6px',
      }}
      aria-live="polite"
      aria-label="Conversation transcript"
    >
      {transcripts.length === 0 && (
        <p style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', margin: '8px 0' }}>
          {isConnecting
            ? 'Connecting...'
            : connState === STATE.LIVE
              ? 'Boliye — main sun raha hoon...'
              : 'Real-time voice ke liye "Jarvis se baat karein" dababein.'}
        </p>
      )}
      {transcripts.map((t, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: t.role === 'user' ? 'row-reverse' : 'row',
            gap: '6px', alignItems: 'flex-end',
          }}
        >
          <div style={{
            maxWidth: '78%',
            background: t.role === 'user' ? '#5F6FFF' : '#f1f5f9',
            color: t.role === 'user' ? '#fff' : '#0f172a',
            padding: '6px 10px', borderRadius: t.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
            fontSize: '12px', lineHeight: 1.45,
          }}>
            {t.text}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
