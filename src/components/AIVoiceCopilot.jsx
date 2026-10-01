import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Power, 
  ChevronDown, 
  Loader2, 
  AudioLines, 
  Check,
  Send,
  Sparkles
} from 'lucide-react';
import { chatWithJarvis } from '../services/voiceActionEngine.js';
import localAvatar from '../assets/krishna_avatar.jpg';

export default function AIVoiceCopilot({
  hoardings = [],
  activeTab = 'inventory',
  onExecuteAction = null
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [modelVolume, setModelVolume] = useState(0);
  const [userVolume, setUserVolume] = useState(0);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [successCard, setSuccessCard] = useState(null);
  const [voiceNotice, setVoiceNotice] = useState(null);
  const [manualInput, setManualInput] = useState('');

  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const historyRef = useRef([]);
  const isSpeakingRef = useRef(false);
  const isConnectedRef = useRef(false);
  const isMutedRef = useRef(false);
  const hoardingsRef = useRef(hoardings);
  const activeTabRef = useRef(activeTab);
  const isProcessingRef = useRef(false);

  // Sync refs to avoid stale closures
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    hoardingsRef.current = hoardings;
  }, [hoardings]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Global shortcut Ctrl+Shift+J and Electron IPC to toggle Jarvis
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    let unsub = null;
    if (window.electronAPI?.onToggleJarvis) {
      unsub = window.electronAPI.onToggleJarvis(() => {
        setIsOpen(prev => !prev);
      });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // Call duration counter
  useEffect(() => {
    if (isConnected) {
      setCallDuration(0);
      timerRef.current = window.setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isConnected]);

  // Format call duration MM:SS
  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Find the highest quality Natural / Neural voice available in the browser
  const getNaturalVoice = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // 1. Preferred Hindi natural voices
    const hindiVoice = voices.find(v => 
      v.lang.startsWith('hi') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Online'))
    ) || voices.find(v => v.lang.startsWith('hi'));
    if (hindiVoice) return hindiVoice;

    // 2. High fidelity English natural voices (Indian or UK/US Neural)
    const indianEn = voices.find(v => v.lang === 'en-IN' && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neerja') || v.name.includes('Prabhat')));
    if (indianEn) return indianEn;

    const ukFemale = voices.find(v => v.name.includes('Google UK English Female') || (v.lang === 'en-GB' && v.name.includes('Natural')));
    if (ukFemale) return ukFemale;

    const naturalEn = voices.find(v => v.name.includes('Natural') || v.name.includes('Google'));
    if (naturalEn) return naturalEn;

    return voices[0];
  };

  // Natural Speech Playback with Real-Time Audio Waveform Simulation
  const speakNaturalReply = (text, onComplete) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (onComplete) onComplete();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const chosenVoice = getNaturalVoice();
    if (chosenVoice) utterance.voice = chosenVoice;

    utterance.lang = chosenVoice?.lang || 'hi-IN';
    utterance.rate = 1.04;
    utterance.pitch = 1.05;

    // Audio Visualizer waveform simulation during model speech
    let volInterval = null;
    let step = 0;
    utterance.onstart = () => {
      setIsModelSpeaking(true);
      isSpeakingRef.current = true;
      volInterval = setInterval(() => {
        step += 0.25;
        const dynamicVol = 0.35 + 0.3 * Math.sin(step);
        setModelVolume(dynamicVol);
      }, 80);
    };

    utterance.onend = () => {
      if (volInterval) clearInterval(volInterval);
      setModelVolume(0);
      setIsModelSpeaking(false);
      isSpeakingRef.current = false;
      if (onComplete) onComplete();
    };

    utterance.onerror = () => {
      if (volInterval) clearInterval(volInterval);
      setModelVolume(0);
      setIsModelSpeaking(false);
      isSpeakingRef.current = false;
      if (onComplete) onComplete();
    };

    window.speechSynthesis.speak(utterance);
  };

  // Start continuous user microphone capture with RMS volume analysis
  const startMicAnalysis = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current || !isConnectedRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const norm = Math.min(1, avg / 128);

        // Don't show user volume if model is speaking or mic is muted
        if (!isSpeakingRef.current) {
          setUserVolume(norm);
        } else {
          setUserVolume(0);
        }

        animFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (err) {
      console.warn("Microphone analyser not accessible:", err);
    }
  };

  // Stop microphone stream & visualizer
  const stopMicAnalysis = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch(e) {}
      audioContextRef.current = null;
    }
    setUserVolume(0);
  };

  // Initialize Speech Recognition for continuous two-way conversation
  const initSpeechRecognition = () => {
    if (typeof window === 'undefined') return null;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'hi-IN'; // Understands Hindi, English, and Hinglish

    recognition.onresult = async (event) => {
      if (!isConnectedRef.current) return;
      if (isSpeakingRef.current) return; // Prevent echo loop when Jarvis is speaking

      let interim = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interim += t;
        }
      }

      if (interim) {
        setCurrentTranscript(interim);
      }

      if (finalTranscript.trim()) {
        const spoken = finalTranscript.trim();
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;
        setCurrentTranscript(spoken);

        // Add to history
        historyRef.current.push({ role: 'user', content: spoken });

        // Query conversational engine
        try {
          const res = await chatWithJarvis({
            userText: spoken,
            history: historyRef.current,
            hoardings: hoardingsRef.current,
            activeTab: activeTabRef.current
          });

          if (res) {
            historyRef.current.push({ role: 'assistant', content: res.reply });
            setCurrentTranscript(res.reply);

            // Execute dashboard action live!
            if (res.action && res.action !== 'NONE' && onExecuteAction) {
              onExecuteAction(res.actionPayload);
            }

            // Display success card if present (Prescripto style!)
            if (res.successCard) {
              setSuccessCard(res.successCard);
            }

            // Speak natural response
            speakNaturalReply(res.reply, () => {
              // Stay in continuous call, ready for next turn
            });
          }
        } catch (err) {
          console.warn("Conversation turn error:", err);
          speakNaturalReply("Theek hai, main samajh gaya.", () => {});
        } finally {
          isProcessingRef.current = false;
        }
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech') return;
      console.warn("Speech recognition error:", e.error);
      if (e.error === 'network' || e.error === 'service-not-allowed' || e.error === 'not-allowed') {
        setVoiceNotice("Speech recognition unavailable in desktop app/browser. Niche input box se commands execute karein.");
      }
    };

    recognition.onend = () => {
      // Auto-restart if call is still active and not muted
      if (isConnectedRef.current && !isMutedRef.current) {
        try {
          recognition.start();
        } catch (e) {}
      }
    };

    return recognition;
  };

  // Start Call Session
  const handleStartCall = async () => {
    if (!isOpen) { 
      setIsOpen(true); 
      return; 
    }

    setIsConnecting(true);
    setCurrentTranscript('');
    setSuccessCard(null);
    setVoiceNotice(null);

    // Warm up speech synthesis voices
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }

    // Set connection active BEFORE starting analysis so RMS volume loop runs properly
    setIsConnected(true);
    isConnectedRef.current = true;
    setIsMuted(false);
    isMutedRef.current = false;

    // Start mic stream & waveform analyser
    await startMicAnalysis();

    // Start continuous speech recognition
    const rec = initSpeechRecognition();
    recognitionRef.current = rec;
    if (rec) {
      try {
        rec.start();
      } catch (err) {
        console.warn("Recognition start issue:", err);
      }
    } else {
      setVoiceNotice("Speech recognition unavailable in desktop app/browser. Niche input box se commands execute karein.");
    }

    setIsConnecting(false);

    // Initial greeting in natural human voice (Prescripto style)
    const greeting = "Namaste! Main Jarvis hoon. Hoarding inventory, bookings ya campaigns ke liye batayein main kya madad kar sakta hoon?";
    setCurrentTranscript(greeting);
    historyRef.current = [{ role: 'assistant', content: greeting }];
    speakNaturalReply(greeting);
    window.electronAPI?.logEvent?.('INFO', 'Voice Copilot call session started');
  };

  // End Call Session
  const handleEndCall = () => {
    window.electronAPI?.logEvent?.('INFO', 'Voice Copilot call session ended');
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
      recognitionRef.current = null;
    }
    stopMicAnalysis();

    setIsConnected(false);
    isConnectedRef.current = false;
    setIsConnecting(false);
    setIsModelSpeaking(false);
    setModelVolume(0);
    setUserVolume(0);
    setCurrentTranscript('');
    setSuccessCard(null);
    historyRef.current = [];
  };

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }
      stopMicAnalysis();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Toggle Mute
  const toggleMute = () => {
    const nextMuted = !isMutedRef.current;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;
    if (nextMuted) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }
      setUserVolume(0);
    } else {
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch(e) {}
      }
    }
  };

  // Manual command dispatcher (works anywhere, including Electron desktop app)
  const handleSendManualCommand = async (e) => {
    e?.preventDefault?.();
    if (!manualInput.trim() || isProcessingRef.current) return;
    const cmd = manualInput.trim();
    setManualInput('');
    setCurrentTranscript(cmd);
    historyRef.current.push({ role: 'user', content: cmd });
    isProcessingRef.current = true;
    try {
      const res = await chatWithJarvis({
        userText: cmd,
        history: historyRef.current,
        hoardings: hoardingsRef.current,
        activeTab: activeTabRef.current
      });
      if (res) {
        historyRef.current.push({ role: 'assistant', content: res.reply });
        setCurrentTranscript(res.reply);
        if (res.action && res.action !== 'NONE' && onExecuteAction) {
          onExecuteAction(res.actionPayload);
        }
        if (res.successCard) {
          setSuccessCard(res.successCard);
        }
        speakNaturalReply(res.reply, () => {});
      }
    } catch (err) {
      console.warn("Manual command error:", err);
    } finally {
      isProcessingRef.current = false;
    }
  };

  // High Resolution Professional Avatar (Local asset)
  const AVATAR_URL = localAvatar || "/krishna_avatar.jpg";
  const FALLBACK_AVATAR = localAvatar || "/krishna_avatar.jpg";

  const handleImageError = (e) => {
    if (e.currentTarget.src !== FALLBACK_AVATAR) {
      e.currentTarget.src = FALLBACK_AVATAR;
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      <style>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .4; }
        }
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      {isOpen && (
        <div style={{
          background: '#ffffff',
          borderRadius: '2rem',
          boxShadow: '0 20px 60px -15px rgba(0,0,0,0.22)',
          width: '92vw',
          maxWidth: '320px',
          height: '520px',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          border: '1px solid #f3f4f6',
          marginBottom: '16px',
          animation: 'slideUpFade 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>

          {/* 🌟 Header Section (Prescripto Primary #5F6FFF) */}
          <div style={{
            background: '#5F6FFF',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'relative',
            zIndex: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '2px solid #ffffff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                flexShrink: 0
              }}>
                <img 
                  src={AVATAR_URL} 
                  onError={handleImageError}
                  alt="Jarvis" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 800, margin: 0, lineHeight: 1.2, letterSpacing: '0.01em' }}>
                  Jarvis
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    animation: isConnected ? 'pulse 1.5s infinite' : 'none'
                  }}></span>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.75)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {isConnected ? `Live Call • ${formatDuration(callDuration)}` : "Online"}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
                transition: 'color 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
              title="Minimize Copilot"
            >
              <ChevronDown size={24} />
            </button>
          </div>

          {/* 🌟 Main Content Area */}
          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', position: 'relative', background: '#ffffff' }}>

            {/* 🎯 Success Card Overlay (Prescripto Style) */}
            {successCard ? (
              <div style={{
                position: 'absolute',
                inset: 0,
                zIndex: 30,
                background: 'rgba(255, 255, 255, 0.96)',
                backdropFilter: 'blur(5px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px'
              }}>
                <div style={{
                  background: '#ffffff',
                  width: '100%',
                  borderRadius: '16px',
                  boxShadow: '0 15px 35px rgba(0,0,0,0.12)',
                  border: '1px solid #e0e7ff',
                  overflow: 'hidden'
                }}>
                  <div style={{ background: '#10b981', padding: '16px', textAlign: 'center' }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      background: '#ffffff',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 8px',
                      color: '#10b981',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                    }}>
                      <Check size={26} strokeWidth={3.5} />
                    </div>
                    <h3 style={{ color: '#ffffff', fontWeight: 800, fontSize: '16px', margin: 0 }}>
                      {successCard.title || "Executed!"}
                    </h3>
                  </div>

                  <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#475569' }}>
                    {(successCard.items || []).map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: idx === successCard.items.length - 1 ? 'none' : '1px solid #f1f5f9', paddingBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                          {item.label}
                        </span>
                        <span style={{ fontWeight: 700, color: '#0f172a', textAlign: 'right', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '12px', background: '#f8fafc', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                    <button
                      type="button"
                      onClick={() => setSuccessCard(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#4f46e5',
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        cursor: 'pointer'
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transition: 'all 0.5s ease',
                paddingTop: isConnected ? '24px' : '36px',
                paddingBottom: '8px'
              }}>
                <div style={{ position: 'relative', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {/* Dynamic Voice Pulse Ring */}
                  {isConnected && (
                    <div
                      style={{
                        position: 'absolute',
                        borderRadius: '50%',
                        background: 'rgba(95, 111, 255, 0.22)',
                        width: `${(isConnected ? 96 : 128) + (isModelSpeaking ? modelVolume * 65 : userVolume * 55)}px`,
                        height: `${(isConnected ? 96 : 128) + (isModelSpeaking ? modelVolume * 65 : userVolume * 55)}px`,
                        opacity: (isModelSpeaking || userVolume > 0.05) ? Math.min(1, 0.35 + Math.max(modelVolume, userVolume)) : 0,
                        transition: 'all 0.12s ease-out',
                        pointerEvents: 'none'
                      }}
                    />
                  )}

                  {/* Avatar Container */}
                  <div style={{
                    position: 'relative',
                    zIndex: 10,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: '5px solid #ffffff',
                    boxShadow: '0 10px 35px -5px rgba(0,0,0,0.12)',
                    background: '#f1f5f9',
                    width: isConnected ? '96px' : '128px',
                    height: isConnected ? '96px' : '128px',
                    transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}>
                    <img 
                      src={AVATAR_URL} 
                      onError={handleImageError}
                      alt="Jarvis" 
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: (isModelSpeaking && isConnected) ? 'scale(1.10)' : 'scale(1.0)',
                        transition: 'transform 0.15s ease'
                      }}
                    />
                  </div>

                  {/* Status Dot */}
                  <div style={{
                    position: 'absolute',
                    background: '#5F6FFF',
                    border: '3px solid #ffffff',
                    borderRadius: '50%',
                    zIndex: 20,
                    width: isConnected ? '14px' : '18px',
                    height: isConnected ? '14px' : '18px',
                    bottom: isConnected ? '4px' : '8px',
                    right: isConnected ? '4px' : '8px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                  }}></div>
                </div>

                <div style={{ textAlign: 'center', padding: '0 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '2px' }}>
                    <h2 style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 900,
                      color: '#1E1B4B',
                      fontSize: isConnected ? '17px' : '20px',
                      margin: 0,
                      letterSpacing: '-0.01em'
                    }}>
                      Jarvis
                    </h2>
                    <span style={{
                      background: '#E0F2FE',
                      color: '#0369A1',
                      fontSize: '9px',
                      fontWeight: 900,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      border: '1px solid #BAE6FD'
                    }}>
                      AI
                    </span>
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                    OOH Media Copilot
                  </p>
                </div>
              </div>
            )}

            {/* 💬 Interaction Area (Live Transcript / Dialogue) */}
            <div style={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 20px',
              textAlign: 'center',
              overflowY: 'auto'
            }}>
              <style>{`
                @keyframes adh-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              `}</style>
              <div style={{ width: '100%', padding: '6px 0', minHeight: '52px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {!isConnected ? (
                  <p style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 500, lineHeight: 1.45, margin: 0 }}>
                    Hello! I'm Jarvis. How can I help you manage hoardings, bookings or PPT proposals today?
                  </p>
                ) : (
                  <>
                    <p style={{ color: '#1E1B4B', fontSize: '13.5px', fontWeight: 600, lineHeight: 1.4, margin: '0 0 6px' }}>
                      {currentTranscript || (userVolume > 0.08 ? "Sun raha hoon..." : "Listening...")}
                    </p>
                    {voiceNotice && (
                      <div style={{
                        background: '#fef3c7',
                        color: '#92400e',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        margin: '4px 0 8px',
                        border: '1px solid #fde68a'
                      }}>
                        {voiceNotice}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ⌨️ Inline Command Input (Guarantees usability even on Electron without WebSpeech) */}
              <form onSubmit={handleSendManualCommand} style={{ width: '100%', marginTop: '6px', display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="Ya type karein: 'Begum Bridge book karo'..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    outline: 'none',
                    background: '#f8fafc',
                    color: '#0f172a'
                  }}
                />
                <button
                  type="submit"
                  disabled={!manualInput.trim()}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: manualInput.trim() ? '#5F6FFF' : '#cbd5e1',
                    color: '#ffffff',
                    cursor: manualInput.trim() ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Send command"
                >
                  <Send size={14} />
                </button>
              </form>
            </div>

            {/* 🎛️ Footer Controls */}
            <div style={{ padding: '0 24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {!isConnected ? (
                <div style={{ width: '100%' }}>
                  <button
                    type="button"
                    onClick={handleStartCall}
                    disabled={isConnecting}
                    style={{
                      width: '100%',
                      background: '#5F6FFF',
                      color: '#ffffff',
                      borderRadius: '16px',
                      padding: '18px 24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      fontWeight: 700,
                      fontSize: '14px',
                      border: 'none',
                      cursor: isConnecting ? 'wait' : 'pointer',
                      boxShadow: '0 12px 28px rgba(95, 111, 255, 0.32)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
                  >
                    {isConnecting ? (
                      <Loader2 size={20} style={{ animation: 'adh-spin 1s linear infinite' }} color="#ffffff" />
                    ) : (
                      <>
                        <AudioLines size={20} color="#ffffff" />
                        <span>Start Voice Call</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '28px' }}>
                  <button
                    type="button"
                    onClick={toggleMute}
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid #f1f5f9',
                      background: isMuted ? '#ef4444' : '#ffffff',
                      color: isMuted ? '#ffffff' : '#64748b',
                      cursor: 'pointer',
                      boxShadow: isMuted ? '0 6px 16px rgba(239, 68, 68, 0.3)' : '0 4px 12px rgba(0,0,0,0.06)',
                      transition: 'all 0.15s ease'
                    }}
                    title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                  >
                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>

                  <button
                    type="button"
                    onClick={handleEndCall}
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      background: '#EF4444',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 12px 28px rgba(239, 68, 68, 0.35)',
                      transition: 'all 0.15s ease'
                    }}
                    title="End Call"
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
                  >
                    <Power size={24} />
                  </button>
                </div>
              )}
            </div>

            {/* 🏷️ Bottom Branding (Prescripto style) */}
            <div style={{
              padding: '12px 0',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderTop: '1px solid #f8fafc'
            }}>
              <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, margin: 0, letterSpacing: '0.02em' }}>
                Powered by <span style={{ color: '#5F6FFF', fontWeight: 900 }}>Scallar IT Solution</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 Launcher Icon (Bigger w-20 h-20 / 80px exactly like Prescripto) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          style={{
            position: 'relative',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            overflow: 'hidden',
            border: '4px solid #ffffff',
            boxShadow: '0 15px 45px -10px rgba(0,0,0,0.45)',
            background: '#5F6FFF',
            cursor: 'pointer',
            padding: 0,
            transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
          title="Open Jarvis AI Voice Copilot"
        >
          <img 
            src={AVATAR_URL} 
            onError={handleImageError}
            alt="Jarvis AI" 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />

          {/* Glowing Beacon Indicator */}
          <div style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            display: 'flex',
            width: '14px',
            height: '14px'
          }}>
            <span style={{
              position: 'absolute',
              display: 'inline-flex',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: '#ffffff',
              opacity: 0.75,
              animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite'
            }}></span>
            <span style={{
              position: 'relative',
              display: 'inline-flex',
              borderRadius: '50%',
              width: '14px',
              height: '14px',
              background: '#ffffff',
              border: '2.5px solid #5F6FFF',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}></span>
          </div>
        </button>
      )}
    </div>
  );
}
