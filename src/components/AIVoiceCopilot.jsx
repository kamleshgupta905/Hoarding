import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  Send, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Radio, 
  Zap, 
  Bot, 
  CornerDownLeft 
} from 'lucide-react';
import { interpretVoiceCommand } from '../services/voiceActionEngine.js';

export default function AIVoiceCopilot({
  hoardings = [],
  activeTab = 'inventory',
  onExecuteAction = null
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [manualText, setManualText] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'listening' | 'processing' | 'executing' | 'speaking'
  const [statusMsg, setStatusMsg] = useState('Say something or ask anything...');
  const [isMuted, setIsMuted] = useState(false);
  const [recentActions, setRecentActions] = useState([]);

  const recognitionRef = useRef(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'hi-IN'; // Supports Hindi + English (Hinglish) seamlessly

      recognition.onstart = () => {
        setIsListening(true);
        setStatus('listening');
        setStatusMsg('🎙️ Sun raha hoon... (Listening)');
      };

      recognition.onresult = (event) => {
        let currentInterim = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += trans;
          } else {
            currentInterim += trans;
          }
        }

        setInterimText(currentInterim);
        if (finalTranscript) {
          setTranscript(finalTranscript);
          handleProcessCommand(finalTranscript);
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition notice:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setStatusMsg('⚠️ Microphone permission chahiye.');
        } else {
          setStatus('idle');
          setStatusMsg('Say something or ask anything...');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech Recognition aapke browser me support nahi karta. Please use Chrome or Edge, ya text type karein.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setStatus('idle');
    } else {
      setTranscript('');
      setInterimText('');
      try {
        recognitionRef.current.start();
        setIsOpen(true);
      } catch (err) {
        console.warn('Recognition start notice:', err);
      }
    }
  };

  const speakText = (text) => {
    if (isMuted || !synthRef.current || !text) return;
    try {
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      // Prefer Indian English / Hindi voice
      const voices = synthRef.current.getVoices();
      const hindiVoice = voices.find(v => v.lang.includes('hi') || v.lang.includes('IN'));
      if (hindiVoice) utterance.voice = hindiVoice;

      utterance.onstart = () => setStatus('speaking');
      utterance.onend = () => setStatus('idle');
      synthRef.current.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis notice:', e);
    }
  };

  const handleProcessCommand = async (commandText) => {
    if (!commandText || !commandText.trim()) return;
    setStatus('processing');
    setStatusMsg('🧠 Thinking & Planning Action...');

    try {
      const actionPayload = await interpretVoiceCommand(commandText, {
        totalSites: hoardings.length,
        activeTab
      });

      if (!actionPayload) {
        setStatus('idle');
        setStatusMsg('Samajh nahi aaya, please dobara bolein.');
        return;
      }

      setStatus('executing');
      setStatusMsg(`⚡ Executing: ${actionPayload.action}`);

      // Add to recent actions
      setRecentActions(prev => [{
        text: commandText,
        action: actionPayload.action,
        speech: actionPayload.speech,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }, ...prev.slice(0, 4)]);

      // Speak feedback
      if (actionPayload.speech) {
        speakText(actionPayload.speech);
      }

      // Trigger Execution in Parent Dashboard
      if (onExecuteAction) {
        onExecuteAction(actionPayload);
      }

      setTimeout(() => {
        setStatus('idle');
        setStatusMsg('Ready for next command...');
      }, 2500);

    } catch (err) {
      console.warn('Action interpretation error:', err);
      setStatus('idle');
      setStatusMsg('Error processing command. Dobara try karein.');
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    setTranscript(manualText);
    const textToRun = manualText;
    setManualText('');
    handleProcessCommand(textToRun);
  };

  const quickPrompts = [
    'Begum Bridge ke 40x10 available sites',
    'Tata Motors ke liye book karo',
    'Overridden bookings dikhao',
    'Client campaigns open karo',
    'Reset all filters',
    'PPT campaign proposal download karo'
  ];

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999 }}>
      {/* 🚀 EXPANDED ASSISTANT PANEL */}
      {isOpen && (
        <div style={{
          width: '360px',
          maxHeight: '520px',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(16px)',
          borderRadius: '20px',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 30px rgba(245, 158, 11, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          marginBottom: '14px',
          animation: 'fadeInUp 0.25s ease'
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.25), transparent)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 10px rgba(245, 158, 11, 0.5)'
              }}>
                <Bot size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Jarvis AI Copilot</span>
                  <span style={{ fontSize: '0.65rem', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', padding: '1px 6px', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                    Live Auto
                  </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  Voice & Autonomous Dashboard
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                style={{
                  background: isMuted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.08)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px',
                  color: isMuted ? '#f87171' : '#cbd5e1',
                  cursor: 'pointer'
                }}
              >
                {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px',
                  color: '#cbd5e1',
                  cursor: 'pointer'
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Status & Waveform */}
          <div style={{
            padding: '16px',
            textAlign: 'center',
            background: 'rgba(2, 6, 23, 0.5)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{
              fontSize: '0.78rem',
              color: status === 'listening' ? '#f59e0b' : status === 'executing' ? '#10b981' : '#94a3b8',
              fontWeight: 700,
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}>
              {status === 'listening' && <Radio size={14} className="animate-pulse" />}
              {status === 'executing' && <Zap size={14} />}
              <span>{statusMsg}</span>
            </div>

            {/* Live Subtitles / Transcript */}
            <div style={{
              minHeight: '44px',
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '10px',
              border: '1px dashed rgba(255, 255, 255, 0.15)',
              fontSize: '0.84rem',
              color: '#f1f5f9',
              fontStyle: transcript || interimText ? 'normal' : 'italic',
              lineHeight: 1.4
            }}>
              {interimText ? (
                <span style={{ color: '#fbbf24' }}>"{interimText}..."</span>
              ) : transcript ? (
                <span>"{transcript}"</span>
              ) : (
                <span style={{ color: '#64748b' }}>"Begum bridge 40x10 filter karo..."</span>
              )}
            </div>

            {/* Big Mic Button with Pulsing Wave */}
            <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={toggleListening}
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  border: 'none',
                  background: isListening 
                    ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                    : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: isListening 
                    ? '0 0 25px rgba(239, 68, 68, 0.7)' 
                    : '0 0 20px rgba(245, 158, 11, 0.5)',
                  transform: isListening ? 'scale(1.08)' : 'scale(1)',
                  transition: 'all 0.2s ease'
                }}
              >
                {isListening ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
            </div>
          </div>

          {/* Quick Command Suggestions */}
          <div style={{ padding: '12px 14px', flex: 1, overflowY: 'auto', maxHeight: '160px' }}>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Quick Voice Commands:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {quickPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setTranscript(prompt);
                    handleProcessCommand(prompt);
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '4px 10px',
                    color: '#e2e8f0',
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Manual Input Form */}
          <form onSubmit={handleManualSubmit} style={{
            padding: '10px 14px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            gap: '8px',
            background: 'rgba(15, 23, 42, 0.8)'
          }}>
            <input 
              type="text"
              placeholder="Or type voice command in Hindi/English..."
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '0.8rem',
                color: '#ffffff',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={!manualText.trim()}
              style={{
                background: '#f59e0b',
                border: 'none',
                borderRadius: '8px',
                padding: '7px 12px',
                color: '#000000',
                fontWeight: 700,
                cursor: manualText.trim() ? 'pointer' : 'default',
                opacity: manualText.trim() ? 1 : 0.4
              }}
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      {/* 🔘 COLLAPSED FLOATING TRIGGER BUTTON */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            toggleListening();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            border: '2px solid #f59e0b',
            borderRadius: '9999px',
            padding: '10px 18px',
            color: '#f8fafc',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4), 0 0 20px rgba(245, 158, 11, 0.35)',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.6)'
          }}>
            <Mic size={16} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#f59e0b', lineHeight: 1.2 }}>
              Voice Copilot
            </div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
              Speak Hindi / English
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
