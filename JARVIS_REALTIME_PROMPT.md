# 🧠 Prompt — Jarvis ko asli real-time voice banane ke liye

**Updated for commit `816d9c8` + `5d40255`.** Pichla hotfix round ho chuka hai — ye prompt sirf
**bache hue real-time gap** ko target karta hai.

Pehle 3 baatein:

1. **Keys revoke karo.** `src/services/geminiService.js:20-24` me 5 keys abhi bhi committed hain.
2. **Live API key chahiye.** `gemini-3.8-live` ke liye Live API enabled key. Free tier pe session limit hai.
3. Ye prompt `src/components/AIVoiceCopilot.jsx` ko **replace** karta hai. Dashboard ka
   `handleExecuteAIAction` ab theek hai — usko mat tod-na, bas usme tool results wapas karwana hai.

---

## 📋 Prompt — ye poora box copy karo

````text
ROLE
Senior engineer on the existing React 19 + Vite 7 + Electron 43 repo `kamleshgupta905/Hoarding`
(Heera Advertising — OOH billboard inventory & booking). Branch: arena/01a0f862-hoarding.

GOAL
Replace the current push-to-talk voice copilot with TRUE real-time speech-to-speech using the
Gemini Live API, working inside the packaged Windows .exe. No button-press per turn, no
waiting for a whole clip to upload, interruptible mid-sentence.

================================================================================
PART A — CURRENT STATE (already fixed, do NOT redo)
================================================================================
These were repaired in 816d9c8 / 5d40255. Keep them working:
- AdminDashboard.jsx handleExecuteAIAction: correct setters, ARRAY filters
  (setInventoryCityFilter / setInventoryLocalityFilter / setInventoryMediaFilter /
  setInventorySizeFilter), exact-case setInventoryStatusFilter, validTabs whitelist,
  candidate-based QUICK_BOOK with no `|| hoardings[0]` fallback. It already returns
  result objects like { success, needsClarification, candidates, error }.
- electron/main.cjs: single-instance lock, media permission handlers, CSP, will-navigate
  guard, jarvis.log file logging, CommandOrControl+Shift+J global shortcut.
- voiceActionEngine.js: date resolution ("agle mahine", "1 November se 30 November tak",
  "15 din") works; question guard stops the matcher hijacking conversation; AbortController
  replaced Promise.race; Groq uses llama-3.1-8b-instant.
- bulkBookingEngine.js / pptxEngine.js ReferenceErrors fixed; eslint is at 0 errors.
  KEEP IT AT 0.

================================================================================
PART B — WHAT IS STILL WRONG (fix these)
================================================================================

B1. NOT REAL TIME. `voiceActionEngine.js:17 callGemini38Flash` posts a whole recorded blob to
    `generateContent`. `AIVoiceCopilot.jsx:349 startAudioRecording` uses MediaRecorder and only
    sends on stop — the user must press Mic twice per turn ("Boliye aur fir Mic dabayein",
    line 415). Round trip is 4-8 seconds. Google's own audio doc says: "For real-time voice and
    video interactions, see the Live API."

B2. `AIVoiceCopilot.jsx:253` still uses `window.webkitSpeechRecognition`. That is Chrome's
    proprietary cloud service, not part of Chromium — in Electron it always fails with
    `error: "network"`. `onerror` at line 311 only console.warns. A `voiceNotice` state exists
    at line 31 but is NEVER set to anything except null, so the user sees no error at all.

B3. Replies are spoken with `window.speechSynthesis`. In Electron on Windows there are no
    Chrome "Google हिन्दी" voices, only SAPI5. `getNaturalVoice()` falls through to `voices[0]`
    = "Microsoft David - English (US)", which reads Hinglish in an American accent. This is the
    single most visible "voice not working" symptom.

B4. `startAudioRecording` begins with `if (!streamRef.current) return;`. streamRef is only set
    by `startMicAnalysis()`, which swallows getUserMedia failures with console.warn. So on mic
    denial the Mic button silently does nothing.

B5. Jarvis's waveform is still synthetic: `AIVoiceCopilot.jsx:160`
    `const dynamicVol = 0.35 + 0.3 * Math.sin(step);`

B6. `siteQueryExtract()` is a stopword blacklist and leaks. Verified failures:
      "…Begum Bridge pe 1 Nov se 30 Nov tak book kardo" -> siteQuery "begum bridge se"
         (trailing "se" => loc.includes() never matches => "Site nahi mila")
      "Meerut me 40x10 available sites dikhao"          -> search "meerut me"  => 0 results
      "client Tata Motors ke liye available sites dikhao"-> search "client tata motors liye"
      "Begum Bridge dikhao"                             -> null (guard needs a dimension/city/
         status/media/'site'/'hoarding' token, and this has none)
      "campaign report dikhao"                          -> clients tab, should be dashboard
    Do not patch the regex. Replace it with model function-calling arguments.

B7. `src/services/geminiService.js:20-24` still hardcodes 5 Gemini API keys.

B8. `interpretVoiceCommand` (voiceActionEngine.js:360, ~95 lines) is dead code — delete it.

================================================================================
PART C — TARGET ARCHITECTURE
================================================================================
Reference: https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket

  Model      gemini-3.8-live
  Endpoint   wss://generativelanguage.googleapis.com/ws/
             google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=KEY
  Ephemeral  .../BidiGenerateContentConstrained?access_token=TOKEN   (use this in the renderer)
  Audio in   raw 16-bit PCM LE, 16 kHz, mimeType "audio/pcm;rate=16000"
  Audio out  raw 16-bit PCM, 24 kHz  (model's own voice — delete speechSynthesis entirely)
  Config     responseModalities:["AUDIO"], inputAudioTranscription:{}, outputAudioTranscription:{}
  Built in   server-side VAD, barge-in via serverContent.interrupted, function calling

C1. KEY MUST NOT REACH THE RENDERER
    electron/main.cjs: add `ipcMain.handle('jarvis:get-live-token', ...)` which POSTs to
    https://generativelanguage.googleapis.com/v1beta/auth_tokens with header
    `x-goog-api-key: <key from process.env.GEMINI_API_KEY or encrypted electron-store>`:
      { "uses": 1, "expireTime": "<now+10min ISO8601>",
        "liveConnectConstraints": { "model": "models/gemini-3.8-live",
          "config": { "responseModalities": ["AUDIO"],
                      "inputAudioTranscription": {}, "outputAudioTranscription": {} } } }
    Return only the token. Expose as `window.electronAPI.getJarvisLiveToken()` in preload.cjs.
    Web build (no electronAPI): fall back to VITE_GEMINI_LIVE_KEY and show a banner that web
    mode is less secure.
    Extend the existing CSP in main.cjs connect-src to include
    `wss://generativelanguage.googleapis.com` — it is currently missing the wss scheme.

C2. NEW FILES
    src/services/jarvis/liveSession.js   WebSocket lifecycle: setup msg, send audio, receive
                                         serverContent, toolCall -> toolResponse, handle
                                         `interrupted`, `goAway`, `sessionResumptionUpdate`,
                                         exponential-backoff reconnect.
    src/services/jarvis/audioCapture.js  getUserMedia -> AudioContext({sampleRate:16000})
                                         -> AudioWorkletNode -> Float32 to Int16 -> base64
                                         -> realtimeInput. Emits REAL RMS for the waveform.
    src/services/jarvis/audioPlayback.js Queue 24 kHz Int16 chunks on one AudioContext with a
                                         scheduled playhead (no gaps). flush() hard-stops on
                                         interruption.
    public/jarvis-pcm-worklet.js         AudioWorklet processor. ScriptProcessorNode is
                                         deprecated — do not use it.
    src/services/jarvis/tools.js         Tool declarations + executeTool() dispatcher.
    src/components/jarvis/JarvisCopilot.jsx
    + vitest files for liveSession and tools.

C3. DELETE
    src/components/AIVoiceCopilot.jsx            (replaced)
    voiceActionEngine.js: callGemini38Flash, interpretVoiceCommand, parseOfflineVoiceCommand's
      role as the primary path, siteQueryExtract, and all speechSynthesis usage.
      KEEP resolveRelativeDates — it works well and the tools still need it.
    Keep a trimmed parseOfflineVoiceCommand ONLY as the offline fallback in C6 step 3.

================================================================================
PART D — TOOLS (function calling replaces all regex extraction)
================================================================================
Declare under `tools: [{ functionDeclarations: [...] }]` in the setup message. Each tool
returns structured JSON sent back as a toolResponse so the model speaks accurate numbers.
Route them through the EXISTING handleExecuteAIAction where possible — it already returns
result objects; just surface them.

 1. search_inventory { query?, city?, locality?, status?, mediaType?, widthFt?, heightFt?,
                       availableFrom?, availableTo? }
    status enum: "All"|"Available"|"Booked"|"Active Booked"|"Upcoming (Future Booked)"
    The model supplies CLEAN separated arguments — this is what kills B6. `query` must contain
    only the location text, never the city/size/status words.
    returns { matchCount, topMatches:[{siteId, location, city, size, status, monthlyCost}] } max 8

 2. get_inventory_stats { city?, asOfDate? }
    MUST use resolveSiteLiveStatus(site) from dataService — the same source the KPI cards use,
    not the static STATUS column, or Jarvis will quote numbers the screen disagrees with.
    returns { total, available, booked, upcoming, byCity }

 3. get_site_details { siteQuery }
    returns { found, site?, bookingSlots?, candidates? }
    2+ matches => found:false + candidates, so Jarvis ASKS. Never auto-pick.

 4. prepare_booking { siteQuery, clientName, startDate, endDate, isOverride?, overrideMode? }
    PREPARE ONLY. Resolve the site, run checkBookingConflict(getSiteBookingSlots(site), ...),
    and only on a single confident match call setQuickBookingTarget({...}) to open the existing
    modal pre-filled. Ambiguous => { needsClarification:true, candidates }.
    returns { prepared, siteId, location, clientName, startDate, endDate, nights,
              estimatedCost, conflict, requiresHumanConfirm:true }
    HARD RULE: the human clicks Confirm in the modal. Voice alone never commits a booking.

 5. confirm_destructive_action { actionId, spokenConfirmation }
    Required before any override/replace. Model reads back site + client + dates and waits for
    an explicit "haan confirm". Log it to jarvis.log via window.electronAPI.logEvent.

 6. switch_view { view }
    Reuse the existing validTabs whitelist in handleExecuteAIAction:
    dashboard|inventory|clients|sheet-editor|staff-review|daily-update|guide|download-apps
    Unknown => { error:"unknown_view", validViews:[...] } so the model self-corrects.

 7. filter_client_bookings { status: All|active|upcoming|completed|displaced, clientName? }
 8. reset_filters {}
 9. export_proposal { format:'ppt'|'excel', scope:'all'|'filtered'|'starred' }
    ppt+starred -> handleDownloadStarredPpt(); ppt -> handleDownloadProposalPpt();
    excel -> exportProposalExcel(scopedArray). returns { started:true, estimatedSeconds }
10. get_expiring_sites { withinDays? } -> getExpiringSites(hoardings, withinDays ?? 15)

================================================================================
PART E — SYSTEM INSTRUCTION (setup.systemInstruction). Keep it SHORT — latency.
================================================================================
  You are Jarvis, the voice copilot for Heera Advertising's OOH billboard desk.
  Speak natural Hinglish — Hindi grammar, English for business terms (site, booking,
  available, override, proposal). ONE short sentence per reply unless asked for a list.
  This is a phone call, not a document.
  Today is {TODAY}. Current view: {ACTIVE_TAB}. Inventory loaded: {N} sites. Cities: {CITIES}.
  Rules:
  - Never invent a site, price, date or count. If you do not have it, call a tool.
  - Before any booking, read back site + client + start + end and wait for "haan".
  - If a site name is ambiguous, ask which one. Never guess.
  - Resolve relative dates to exact YYYY-MM-DD before calling a tool.
  - Say numbers in Hindi words: "do sau pachaas", not "250".
  - If a tool returns an error, say plainly what went wrong. Do not pretend it worked.
  - Who built you: "Mujhe Scallar IT Solution ke developer Kamlesh Gupta ji ne banaya hai."

Put the voice name in speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName as a single
exported constant so it can be swapped in one place.

================================================================================
PART F — UI (src/components/jarvis/JarvisCopilot.jsx)
================================================================================
F1. Keep the current look: #5F6FFF, rounded card, bottom-right launcher, call timer, mute +
    end-call buttons, success card, local krishna_avatar.jpg. Do not restyle.
F2. DELETE the "Mic dabayein" push-to-talk button and its copy. Once connected the mic streams
    continuously; the only controls are Mute and End Call.
F3. Waveform from REAL RMS: user side from the AudioWorklet, Jarvis side from the decoded
    24 kHz output buffer. No Math.sin, no Math.random.
F4. Live 2-party transcript from serverContent.inputTranscription / outputTranscription,
    scrolling — not one overwritten line.
F5. Honest states: idle | requesting-mic | connecting | live | reconnecting | error.
    ACTUALLY SET the error state (B2's voiceNotice is dead code today): mic denial, no mic
    device, websocket failure, missing key — each shows a real message + Retry button.
    Never show "Listening..." when nothing is connected.
F6. Barge-in: on serverContent.interrupted, flush the playback queue immediately. Do not write
    your own interrupt heuristic — server VAD owns it.
F7. Cleanup on unmount and End Call: close WebSocket, stop all MediaStream tracks, close both
    AudioContexts, clear timers. Verify the Windows mic indicator turns off.
F8. Keep Ctrl+Shift+J (already wired through electronAPI.onToggleJarvis).
F9. aria-labels on every control; fully keyboard operable.
F10. Keep the typed-command input box as the fallback UI for C6 steps 2 and 3.

================================================================================
PART G — SECURITY (do this first, one commit)
================================================================================
G1. Delete the 5 hardcoded keys at src/services/geminiService.js:20-24 — env/localStorage only.
G2. Add a check in scripts/verify-architecture.js that fails if /AQ\.[A-Za-z0-9_-]{30,}/ or
    /AIza[0-9A-Za-z_-]{35}/ appears under src/ or electron/.
G3. Tell the user in your summary that the old keys are in git history and must be revoked in
    Google AI Studio — editing the file does not un-leak them.

================================================================================
PART H — FALLBACK LADDER (each step visible in the UI)
================================================================================
  1. Live API speech-to-speech                                    (full experience)
  2. Live API unavailable -> typed chat backed by gemini-3.8-flash + the SAME tools
  3. No network -> local-only: tools still run from typed input; banner "Offline — AI off,
     commands still work". The keyword parser is allowed HERE ONLY. It must never run ahead
     of the model while the model is reachable.
Session resumption: handle goAway / sessionResumptionUpdate, reconnect transparently, and only
tell the user if it takes more than 2 seconds.

================================================================================
PART I — TESTS (vitest). All green before you report done.
================================================================================
I1. tools.test.js — arg validation; switch_view rejects unknown views; search_inventory sends
    ARRAYS to the city/locality/media setters and exact-case 'Available'.
I2. Booking safety — ambiguous siteQuery returns needsClarification and calls
    setQuickBookingTarget ZERO times; prepare_booking invokes no dataService write function;
    a conflicting range without override returns conflict:true.
I3. The B6 sentences must now resolve correctly through tool args (assert the arguments the
    dispatcher receives, with the model mocked):
      "Begum Bridge dikhao", "Meerut me 40x10 available sites dikhao",
      "client Tata Motors ke liye available sites dikhao", "campaign report dikhao",
      "Tata Motors ke liye Begum Bridge pe 1 November se 30 November tak book kardo"
I4. liveSession.test.js with a mock WebSocket: setup message shape, PCM base64 framing,
    toolCall -> toolResponse round trip, interrupted -> playback flush, goAway -> reconnect.
I5. Fix src/core/bulkBookingRealFiles.test.js:117 — it fetches docs.google.com live and fails
    the suite without network. Mock it or gate it behind an env flag.
I6. Do not regress src/core/bulkBookingCommitRegression.test.js (guards the liveStatus crash).
I7. `npx eslint .` must stay at 0 errors. Add `npm run lint` to .github/workflows/ so it can't
    regress again — that gap is why 12 no-undef errors survived for months.

================================================================================
PART J — CONSTRAINTS
================================================================================
- Do NOT touch booking/override/displacement logic in dataService.js or bulkBookingEngine.js.
  193 tests cover it. Jarvis is a caller, not an owner.
- AudioWorklet only; no ScriptProcessorNode.
- No Web Speech API anywhere. No speechSynthesis anywhere.
- No Tailwind — plain CSS + inline styles.
- Respect .agent/rules/ooh-architecture.md (Zustand for cross-cutting state, Sheets is the
  source of truth, geo math via geoService.js, modular components).
- Lazy-load the Jarvis module with dynamic import() — the AdminDashboard chunk is 1.04 MB.
- Hinglish in user-facing strings, English in code and comments.

================================================================================
PART K — DELIVERY
================================================================================
Commit after each step:
  1. Security cleanup (G)
  2. Tool layer + dashboard wiring + tests (D, I1-I3) — testable with zero audio
  3. Live session + audio pipeline (C, H)
  4. UI (F)
  5. Token proxy + CSP wss (C1)

Before reporting done, paste the output of:
  npx eslint .      (0 errors)
  npx vitest run    (green)
  npm run build
  npm run electron:build

Then give a manual test script for the packaged .exe:
  mic permission; "Meerut me 40 by 10 available sites dikhao"; "Begum Bridge ki details batao";
  an ambiguous site name; a booking with spoken dates; an override attempt (must be refused
  without read-back confirmation); interrupting Jarvis mid-sentence; mute/unmute; unplug the
  network then reconnect; close the app (Windows mic indicator must go off).
````

---

## 🧭 Reference — repo ke asli naam

| Cheez | Asli value |
|---|---|
| Search | `setSearchTerm(string)` |
| City / Locality / Media / Size | `setInventoryCityFilter([...])` etc — **sab arrays** |
| Status | `setInventoryStatusFilter('Available')` — exact case |
| Date range | `setFilterStartDate` / `setFilterEndDate` |
| Tabs | `dashboard, inventory, clients, sheet-editor, staff-review, daily-update, guide, download-apps` |
| Client filter | `setClientStatusFilter('All'\|'active'\|'upcoming'\|'completed'\|'displaced')` |
| Booking modal | `setQuickBookingTarget({ site, clientName, startDate, endDate, isOverride, overrideMode, overrideReason })` |
| Highlight | `setAiHighlightedSiteId(siteId)` |
| PPT / Excel | `handleDownloadProposalPpt()` · `handleDownloadStarredPpt()` · `exportProposalExcel(sites, filename?, headers?)` |
| Live status | `resolveSiteLiveStatus(site)` — `dataService.js` |
| Conflict check | `checkBookingConflict(getSiteBookingSlots(site), start, end)` |
| Site keys | `City`, `Locality`, `Location ` *(trailing space!)*, `STATUS`, `_SiteID`, `Lat.`, `Long.` |
