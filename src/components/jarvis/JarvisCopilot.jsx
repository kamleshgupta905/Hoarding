import React, {
  useState, useEffect, useRef, useCallback, Suspense
} from 'react';
import {
  Mic, MicOff, Power, ChevronDown, ChevronUp, Loader2, Check, Send, Sparkles,
  X, GripHorizontal, Maximize2, Minimize2, PhoneOff
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
  [STATE.IDLE]:           'Standby',
  [STATE.REQUESTING_MIC]: 'Mic Permission...',
  [STATE.CONNECTING]:     'Connecting...',
  [STATE.LIVE]:           'Live Call',
  [STATE.RECONNECTING]:   'Reconnecting...',
  [STATE.ERROR]:          'Offline / Error',
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
  const [isExpanded,    setIsExpanded]    = useState(false);
  const [widgetPos,     setWidgetPos]     = useState(null);
  const [isDragging,    setIsDragging]    = useState(false);
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

  const isOpenRef         = useRef(isOpen);
  useEffect(() => { hoardingsRef.current   = hoardings;  }, [hoardings]);
  useEffect(() => { activeTabRef.current   = activeTab;  }, [activeTab]);
  useEffect(() => { isMutedRef.current     = isMuted;    }, [isMuted]);
  useEffect(() => { connStateRef.current   = connState;  }, [connState]);
  useEffect(() => { isOpenRef.current      = isOpen;     }, [isOpen]);

  // ── Call duration timer ───────────────────────────────────────
  useEffect(() => {
    if (connState === STATE.LIVE) {
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
You have a confident, respectful Indian male voice persona.
Speak natural Hinglish — Hindi grammar, English for business terms (site, booking, available, override, proposal, client, dates).
Keep replies short, crisp, and conversational (1-2 sentences). This is a real-time voice call, not a written essay.
Today is ${today}. Current view: ${activeTabRef.current}. Inventory loaded: ${count} sites. Cities: ${cities || 'Meerut, Delhi, Noida'}.

STRICT CREATOR ATTRIBUTION & MASKING:
- If anyone asks who created/built you ("Tumhe kisne banaya hai?", "Who created you?", "Aapko kisne banaya?"):
  Answer STRICTLY and ONLY:
  "Mujhe Scallar IT Solution ke Full Stack Developer aur AI Automation ke Expert Shree Kamlesh ji ne banaya hai."
- ABSOLUTELY NEVER mention Gemini, Google, LLM, or AI models under any circumstances. You are Jarvis, built exclusively by Shree Kamlesh ji from Scallar IT Solution.
- NEVER mention "Google Sheet" or "Spreadsheet" when talking about data storage. ALWAYS refer to it as "Google Cloud" or "Cloud Database" (e.g. "Data Google Cloud database mein sync ho gaya hai", "Google Cloud se live data fetch ho gaya hai").

INVENTORY & BOOKING QUERY (CRITICAL):
- When the user asks "konsi site book hai?" / "kaunsi site occupied hai?" / asks which sites are booked or free:
  DO NOT call search_inventory! DO NOT filter the user's screen into an empty state!
  Instead, call get_booked_sites!
  It reads live booking slots and occupancy from Google Cloud and returns the exact list of booked sites, clients, and dates without disturbing the screen.
- Only call search_inventory when the user explicitly asks to filter or view specific locations/categories on their screen.

INTERACTIVE BOOKING WORKFLOW (MANDATORY):
- When the user asks to book a site or says "is site ko book kar do" / "Railway Road book karo" / "book kar do":
  1. DO NOT directly book or call commitNow: true immediately! Check if you have:
     a) Client Name / Company Name ("Yeh booking kis client ya company ke naam par karni hai?")
     b) Booking Start Date & End Date ("Booking kab se kab tak karni hai? Dates batayein.")
  2. If client name or dates are missing, ask the user conversationally:
     "Yeh booking kis client ya company ke naam par karni hai aur kab se kab tak karni hai?"
  3. Once you have the site, client name, and dates:
     MANDATORY SPOKEN READ-BACK CONFIRMATION:
     Read back the details and ask for explicit verbal confirmation before booking:
     "Site [Site Number or Location], Client: [Client Name], [Start Date] se [End Date] tak book kar doon? Confirm karein."
  4. Only when the user explicitly confirms verbally ("haan", "yes", "kar do", "confirm", "theek hai"):
     Call prepare_booking with commitNow: true (or book_multiple_sites with commitNow: true).
  5. After the booking tool succeeds, tell the user:
     "Booking confirm ho gayi hai aur Google Cloud par update ho gayi hai! Maine screen par site open kar di hai."

BULK OPERATIONS & CRUD (DELETE, CLIENT UPDATE, COMMERCIALS):
- BULK / SINGLE CLIENT NAME UPDATE:
  When the user asks to update or change a client's name (e.g. "Site 12 par client name Tata Motors kardo", or bulk "Patanjali ki sabhi sites par Kalyan Jewellers kardo"):
  Call update_client_name. It updates the client name and syncs immediately to Google Cloud.
- BULK / SINGLE SITE DELETION (SAFETY CONFIRMATION MANDATORY):
  When user asks to delete site(s) (e.g. "Site 15 delete kardo", or "Meerut ki in sites ko delete kardo"):
  DO NOT delete immediately! First identify the site(s) and ask for spoken confirmation:
  "Kya aap sach me Site [SL / Location] ko Google Cloud database se delete karna chahte hain?"
  When user says "Haan confirm" / "delete kar do": call delete_sites with confirmed: true.
- CANCEL / RELEASE BOOKING:
  When user asks to cancel booking or make site available (e.g. "Site 8 ki booking cancel kardo"):
  Call release_booking.
- UPDATE SITE DETAILS:
  When user asks to change rate, price, media format, or facing: call update_site_details.

SCREEN SYNCHRONIZATION & FULL CONTROL:
- When discussing or looking up a site, call get_site_details so the site appears highlighted on screen.
- When user asks to see stats or overview, call switch_view with view: 'dashboard'.
- When user asks to see clients or client bookings, call switch_view with view: 'clients'.
- When user asks to see inventory, call switch_view with view: 'inventory'.
- When user asks to export PPT or Excel, call export_proposal.
- When user asks to clear filters, call reset_filters.

SITE IDENTIFICATION & SPEECH:
- NEVER read raw hexadecimal UUIDs (like '202c42...'). Instead identify sites by their Site Number (SL / S. No., e.g. "Site Number 12"), Facing (e.g. "Facing Meerut"), Size ("40 by 20"), and Location.
- Say numbers in natural Hindi words: "do sau pachaas", not "250".
- Never invent a site, price, date or count. If you do not have it, call a tool.
- If a tool returns an error, say plainly what went wrong. Do not pretend it worked.`;
  }, []);

  // ── Drag handling for the floating mini widget ────────────────
  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });

  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

    const currentX = widgetPos?.x ?? Math.max(16, window.innerWidth - 360);
    const currentY = widgetPos?.y ?? Math.max(16, window.innerHeight - 200);

    dragRef.current = {
      startX: clientX,
      startY: clientY,
      posX: currentX,
      posY: currentY,
    };
    setIsDragging(true);

    const onMove = (moveEv) => {
      const moveX = moveEv.type.startsWith('touch') ? moveEv.touches[0].clientX : moveEv.clientX;
      const moveY = moveEv.type.startsWith('touch') ? moveEv.touches[0].clientY : moveEv.clientY;
      const deltaX = moveX - dragRef.current.startX;
      const deltaY = moveY - dragRef.current.startY;
      const widgetWidth = 330;
      const widgetHeight = isExpanded ? 520 : 130;
      const clampedX = Math.min(Math.max(10, dragRef.current.posX + deltaX), window.innerWidth - widgetWidth - 10);
      const clampedY = Math.min(Math.max(10, dragRef.current.posY + deltaY), window.innerHeight - widgetHeight - 10);
      setWidgetPos({ x: clampedX, y: clampedY });
    };

    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  }, [widgetPos, isExpanded]);

  // ── Tool context passed to executeTool ────────────────────────
  const buildToolCtx = useCallback(() => ({
    hoardings:          hoardingsRef.current,
    handleExecuteAIAction: onExecuteAction,
    dataService,
    setters,
  }), [onExecuteAction, dataService, setters]);

  // ── Start live session ────────────────────────────────────────
  const handleStartCall = useCallback(async () => {
    setIsOpen(true);
    if (connStateRef.current !== STATE.IDLE && connStateRef.current !== STATE.ERROR) return;

    setErrorMsg(null);
    setSuccessCard(null);
    setTranscripts([]);
    connStateRef.current = STATE.REQUESTING_MIC;
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
    await playback.resume();

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
        connStateRef.current = mapped;
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
        connStateRef.current = STATE.ERROR;
        setConnState(STATE.ERROR);
        window.electronAPI?.logEvent?.('ERROR', 'Jarvis mic error', err.message);
      },
    });

    if (connStateRef.current === STATE.ERROR) return;  // mic failed

    // Connect WebSocket
    await session.connect();
    window.electronAPI?.logEvent?.('INFO', 'Jarvis Live API session started');
  }, [getSystemInstruction, buildToolCtx, appendTranscript]);

  // ── Ctrl+Shift+J + Electron IPC ───────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        e.preventDefault();
        if (!isOpenRef.current) {
          handleStartCall();
        } else {
          setIsOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);

    let unsub = null;
    if (window.electronAPI?.onToggleJarvis) {
      unsub = window.electronAPI.onToggleJarvis(() => {
        if (!isOpenRef.current) {
          handleStartCall();
        } else {
          setIsOpen(false);
        }
      });
    }

    return () => {
      window.removeEventListener('keydown', onKey);
      if (typeof unsub === 'function') unsub();
    };
  }, [handleStartCall]);

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

  // ── Manual typed command (live session or offline fallback) ───
  const handleSendManual = useCallback(async (e) => {
    e?.preventDefault?.();
    const cmd = manualInput.trim();
    if (!cmd || manualBusyRef.current) return;
    setManualInput('');
    manualBusyRef.current = true;
    setIsManualBusy(true);
    appendTranscript('user', cmd);

    // If live call is connected, stream user prompt directly over the Live session
    if (sessionRef.current && connStateRef.current === STATE.LIVE) {
      try {
        sessionRef.current.sendText(cmd);
      } catch (err) {
        console.warn('sendText live error:', err);
      } finally {
        manualBusyRef.current = false;
        setIsManualBusy(false);
      }
      return;
    }

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
    } catch {
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

  const isLive      = connState === STATE.LIVE;
  const isConnecting = connState === STATE.CONNECTING || connState === STATE.REQUESTING_MIC || connState === STATE.RECONNECTING;
  const hasError    = connState === STATE.ERROR;

  const currentLeft = widgetPos?.x ?? Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 360);
  const currentTop  = widgetPos?.y ?? Math.max(16, (typeof window !== 'undefined' ? window.innerHeight : 800) - (isExpanded ? 540 : 180));

  return (
    <>
      <style>{`
        @keyframes jarvPing { 75%,100%{ transform:scale(2); opacity:0; } }
        @keyframes jarvPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes jarvSlideUp { from{opacity:0;transform:translateY(16px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes waveBar { 0%,100%{transform:scaleY(0.3)} 50%{transform:scaleY(1)} }
      `}</style>

      {/* ── Draggable Copilot Card ──────────────────────────────── */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Jarvis Voice Copilot"
          style={{
            position: 'fixed',
            left: `${currentLeft}px`,
            top: `${currentTop}px`,
            zIndex: 9999,
            width: '330px',
            maxWidth: 'calc(100vw - 20px)',
            height: isExpanded ? '520px' : 'auto',
            maxHeight: '90vh',
            background: '#ffffff',
            borderRadius: '18px',
            boxShadow: '0 20px 50px -10px rgba(15,23,42,0.35), 0 0 0 1px rgba(99,102,241,0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            animation: 'jarvSlideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
            transition: isDragging ? 'none' : 'height 0.22s ease',
            userSelect: isDragging ? 'none' : 'auto',
          }}
        >
          {/* Header & Drag Handle */}
          <div
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {/* Avatar & Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                overflow: 'hidden', border: '1.5px solid #fff',
                boxShadow: '0 2px 5px rgba(0,0,0,.15)', flexShrink: 0,
              }}>
                <img src={AVATAR_URL} alt="Jarvis" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div>
                <h3 style={{ color: '#fff', fontSize: '13px', fontWeight: 800, margin: 0, lineHeight: 1.1 }}>Jarvis</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: isLive ? '#4ade80' : '#fff',
                    animation: isLive ? 'jarvPulse 1.4s infinite' : 'none',
                  }} />
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,.85)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {isLive ? `Live • ${formatDuration(callDuration)}` : STATE_LABEL[connState]}
                  </span>
                </div>
              </div>
            </div>

            {/* Drag Grip Handle */}
            <div style={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.6)', cursor: isDragging ? 'grabbing' : 'grab' }} title="Drag widget anywhere">
              <GripHorizontal size={18} />
            </div>

            {/* Header Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={() => setIsExpanded(e => !e)}
                title={isExpanded ? 'Compact mode' : 'Expand details & chat'}
                aria-label={isExpanded ? 'Compact mode' : 'Expand details & chat'}
                style={{
                  background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px',
                  color: '#fff', cursor: 'pointer', padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close"
                aria-label="Close Jarvis widget"
                style={{
                  background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px',
                  color: '#fff', cursor: 'pointer', padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* ── Compact Body Mode ── */}
          {!isExpanded && (
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#fff' }}>
              {/* Audio Pulse Visualizer + Status Text */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                  {modelRms > 0.02
                    ? '🔊 Jarvis bol raha hai...'
                    : (isLive
                      ? '🎙️ Main sun raha hoon...'
                      : (isConnecting
                        ? 'Connecting to Jarvis...'
                        : (hasError ? '⚠️ Mic / Offline Error' : 'Ready to assist')))}
                </span>

                {/* 5-bar animated audio equalizer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '18px' }}>
                  {[0.4, 0.8, 1, 0.7, 0.5].map((scale, i) => {
                    const dynamicHeight = isLive
                      ? Math.max(4, Math.min(18, Math.round((activeRms * 80 + 4) * scale)))
                      : (isConnecting ? 8 : 4);
                    return (
                      <span
                        key={i}
                        style={{
                          width: '3px',
                          height: `${dynamicHeight}px`,
                          borderRadius: '2px',
                          background: isLive ? (modelRms > 0.02 ? '#6366f1' : '#10b981') : '#cbd5e1',
                          transition: 'height 0.08s ease',
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons Row */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {(isLive || isConnecting) ? (
                  <>
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        background: isMuted ? '#fef2f2' : '#f1f5f9',
                        border: isMuted ? '1px solid #fecaca' : '1px solid #e2e8f0',
                        borderRadius: '10px', padding: '8px 12px',
                        fontSize: '12px', fontWeight: 700,
                        color: isMuted ? '#dc2626' : '#475569',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                      {isMuted ? 'Muted' : 'Mute'}
                    </button>
                    <button
                      type="button"
                      onClick={handleEndCall}
                      aria-label="Cut call"
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        background: '#dc2626', border: 'none',
                        borderRadius: '10px', padding: '8px 12px',
                        fontSize: '12px', fontWeight: 700, color: '#fff',
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}
                    >
                      <PhoneOff size={14} />
                      Cut
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartCall}
                    aria-label="Start voice call"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      background: ACCENT, color: '#fff', border: 'none',
                      borderRadius: '10px', padding: '9px 14px',
                      fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    <Sparkles size={15} />
                    Jarvis se baat karein (Live Voice)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Expanded Body Mode (Transcripts, Manual Input, Settings) ── */}
          {isExpanded && (
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

              {/* Avatar + waveform area in expanded view */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '16px', paddingBottom: '4px' }}>
                <div style={{ position: 'relative', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isLive && (
                    <div style={{
                      position: 'absolute', borderRadius: '50%',
                      background: 'rgba(95,111,255,0.22)',
                      width: `${84 + ringOffset}px`,
                      height: `${84 + ringOffset}px`,
                      opacity: activeRms > 0.03 ? Math.min(1, 0.3 + activeRms) : 0,
                      transition: 'all 0.1s ease-out',
                      pointerEvents: 'none',
                    }} />
                  )}
                  <div style={{
                    position: 'relative', zIndex: 10, borderRadius: '50%',
                    overflow: 'hidden', border: '4px solid #fff',
                    boxShadow: '0 8px 25px -4px rgba(0,0,0,.15)',
                    background: '#f1f5f9',
                    width: '80px', height: '80px',
                  }}>
                    <img src={AVATAR_URL} alt="Jarvis" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                </div>

                {/* Error notice */}
                {hasError && errorMsg && (
                  <div style={{
                    background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px',
                    padding: '8px 12px', margin: '0 14px 6px', fontSize: '11px', color: '#dc2626',
                    textAlign: 'center', lineHeight: 1.4,
                  }}>
                    <strong>⚠️ {errorMsg}</strong>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '6px' }}>
                      <button
                        type="button"
                        onClick={handleStartCall}
                        style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowKeyInput(s => !s)}
                        style={{ background: '#ffffff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
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
                          style={{ padding: '5px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
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
              <div style={{ padding: '8px 14px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(isLive || isConnecting) && (
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        background: isMuted ? '#fef2f2' : '#f1f5f9',
                        border: isMuted ? '1px solid #fecaca' : '1px solid #e2e8f0',
                        borderRadius: '20px', padding: '7px 14px',
                        fontSize: '12px', fontWeight: 700,
                        color: isMuted ? '#dc2626' : '#64748b', cursor: 'pointer',
                      }}
                    >
                      {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                      {isMuted ? 'Muted' : 'Mute'}
                    </button>
                    <button
                      type="button"
                      onClick={handleEndCall}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        background: '#dc2626', border: 'none',
                        borderRadius: '20px', padding: '7px 14px',
                        fontSize: '12px', fontWeight: 700, color: '#fff', cursor: 'pointer',
                      }}
                    >
                      <PhoneOff size={14} />
                      Cut Call
                    </button>
                  </div>
                )}

                {!isLive && !isConnecting && (
                  <button
                    type="button"
                    onClick={handleStartCall}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      background: ACCENT, color: '#fff', border: 'none',
                      borderRadius: '12px', padding: '10px',
                      fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    <Sparkles size={16} />
                    Jarvis se baat karein (Real-time)
                  </button>
                )}

                {/* Typed command form */}
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
                      padding: '8px 10px', fontSize: '12px', outline: 'none',
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
                      padding: '8px 12px', cursor: manualInput.trim() ? 'pointer' : 'default',
                      opacity: manualInput.trim() ? 1 : 0.4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {isManualBusy
                      ? <Loader2 size={14} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                      : <Send size={14} color="#fff" />}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Floating Launcher Bubble (When closed) ────────────────── */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            if (connState === STATE.IDLE || connState === STATE.ERROR) {
              handleStartCall();
            }
          }}
          aria-label="Open Jarvis voice copilot"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: isLive ? '#10b981' : ACCENT,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 24px -4px rgba(0,0,0,0.35)',
            transition: 'all 0.2s ease',
          }}
        >
          {isLive && (
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: '#10b981', opacity: 0.4,
              animation: 'jarvPing 1.5s cubic-bezier(0,0,.2,1) infinite',
            }} />
          )}
          <img src={AVATAR_URL} alt="Jarvis" style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover' }} />
        </button>
      )}
    </>
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
            ? 'Jarvis se connect ho raha hai...'
            : connState === STATE.LIVE
              ? '🎙️ Boliye — main sun raha hoon...'
              : 'Voice call ke liye "Jarvis se baat karein" dabayein ya niche type karein.'}
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
