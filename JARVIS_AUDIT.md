# 🎙️ Jarvis + Automation — Review #2

**Date:** 02 Oct 2026 · **Reviewed commit:** `816d9c8` (origin/main)
**Previous review:** `6309a99` → see git history of this file
**Verified with:** `npx eslint .`, `npx vitest run`, `npm run build`, plus a live probe of the NLP engine

---

## ⚡ TL;DR

Aapne jo push kiya usme **Review #1 ke zyadatar hotfix ho chuke hain** — dashboard ab crash nahi karta. 👏

Lekin aapki teen complaints bilkul sahi hain, aur teeno ka alag-alag karan hai:

| Aapki complaint | Asli karan | Status |
|---|---|---|
| **"automation nhi ho rha"** | `bulkBookingEngine.js` me `ReferenceError: liveStatus is not defined` — **har** bulk booking crash hoti thi | ✅ **Maine fix kar diya** (commit `5d40255`) |
| **"real time nhi hai"** | Live API nahi lagayi — `generateContent` pe audio file bhej rahe ho. Ye **push-to-talk** hai, real-time nahi | ❌ Architecture badalna padega |
| **"gemini realtime voice working nhi kar pa rha"** | Electron me `webkitSpeechRecognition` ab bhi hai (dead), aur jawab Windows ke SAPI voice se bolwa rahe ho | ❌ Dono replace karne honge |

---

## ✅ Pehle: jo theek ho gaya

Credit jahan banta hai:

| Review #1 ka issue | Ab |
|---|---|
| 10 × `no-undef` in `handleExecuteAIAction` | ✅ Fixed — sahi setters, arrays as arrays, exact-case status |
| `'analytics'` tab blank screen | ✅ Fixed — `validTabs` whitelist + error toast |
| `\|\| hoardings[0]` galat site book karta tha | ✅ Fixed — ab `candidates` return hote hain, 0 match pe "Site nahi mila" |
| Spoken dates ignore ho rahi thi | ✅ Fixed — `"1 November se 30 November"` → `2026-11-01 … 2026-11-30` ✓, `"agle mahine"` → `2026-11-01 … 2026-11-30` ✓, `"15 din"` → +15 ✓ |
| `"ppt import karna hai"` → EXPORT_PPT | ✅ Fixed — `!text.includes('import')` guard |
| Questions hijack ho rahe the | ✅ Fixed — `isQuestion` guard. `"hoarding ka rate kya hai"` → `null` → LLM tak jaata hai ✓ |
| Stale closures (`isMuted`, `hoardings`, `activeTab`) | ✅ Fixed — sab refs me |
| Echo loop | ✅ Fixed — `if (isSpeakingRef.current) return;` |
| No unmount cleanup | ✅ Fixed |
| Remote Unsplash avatar | ✅ Fixed — local import |
| `Promise.race` without abort | ✅ Fixed — `AbortController` |
| Groq 70B @ 2.5s | ✅ Fixed — `llama-3.1-8b-instant` |
| Electron: permissions, single-instance, CSP, will-navigate, log file, Ctrl+Shift+J | ✅ **Sab ho gaya** — `main.cjs` ab solid hai |

---

## 🔴 1. "Automation nhi ho rha" — mil gaya, aur fix kar diya

Ye **Jarvis ka bug nahi tha**. `src/core/bulkBookingEngine.js` me pehle se pada tha (commit `6309a99` me bhi tha), isliye Jarvis ke kaam me kisi ne notice nahi kiya.

```
$ npx eslint .
src/core/bulkBookingEngine.js:635:17  no-undef  'liveStatus' is not defined.
src/core/bulkBookingEngine.js:637:19  no-undef  'liveStatus' is not defined.
   … (9 aur baar)
src/core/bulkBookingEngine.js:829:27  no-undef  'pLoc' is not defined.
src/core/bulkBookingEngine.js:830:25  no-undef  'pFacing' is not defined.
src/core/pptxEngine.js:603:79        no-undef  'hasLogoOrFlashKeyword' is not defined.
✖ 12 errors
```

### Kya ho raha tha

```js
if (isConflicted && allowOverride) {
    updatedSlots  = overrideRes.updatedSlots;
    updatedSiteObj = overrideRes.updatedSite;
    // ← liveStatus yahan banta hi nahi tha
} else {
    saveSiteBookingSlots(targetSite, updatedSlots);          // ① local me SAVE ho gaya
    const liveStatus = resolveSiteLiveStatus({...});         // ② const — is block ke andar hi
}                                                            // ③ block khatam, liveStatus gaya

batchUpdates.push({
    status: liveStatus.status || 'Booked',   // 💥 ReferenceError
```

**Natija — aur yahi sabse bura hissa hai:**

1. Line ① pe booking **local storage me save ho jaati thi**
2. Line 635 pe `ReferenceError` throw hota tha
3. `BulkBookingWizard.jsx:201` catch karta tha → `appToast.error("Booking failed: liveStatus is not defined")`
4. **Google Sheet sync kabhi nahi hota tha**

Matlab har bulk booking ke baad **local app aur Google Sheet alag-alag ho jaate the.** App me booking dikhti, sheet me nahi. Jitni baar chalaya, utni baar divergence badhi.

### Proof

Maine ek regression test likha aur pehle **purane code pe** chalaya:

```
### ORIGINAL (broken) code ###
ReferenceError: liveStatus is not defined
    635|         status: liveStatus.status || 'Booked',
Tests  3 failed (3)

### fix ke baad ###
Tests  3 passed (3)
```

### Kya fix kiya (commit `5d40255`)

| File | Fix |
|---|---|
| `bulkBookingEngine.js` | `liveStatus` ko branch ke bahar hoist kiya, **override path pe bhi** compute kiya, aur reads ko `?.` se safe banaya |
| `bulkBookingEngine.js:830` | `pLoc`/`pFacing` apne scope ke bahar padhe ja rahe the (photo-upload fallback) → ab `p.site` se seedha read |
| `pptxEngine.js:603` | `hasLogoOrFlashKeyword` declare hi nahi tha → `img.logoCandidate` use kiya |
| **naya** `bulkBookingCommitRegression.test.js` | 3 tests — clean booking, override booking, multi-site sync |

```
eslint : 12 errors → 0 errors   ✅
vitest : 193 passing (1 pre-existing network-only fail)
build  : ✓ 8.38s
```

> 📌 **Zaroori:** Jo bookings ab tak locally save hui aur sheet me nahi gayin, woh ab bhi mismatch hain. Ek baar bulk booking dobara chalakar ya manually sheet se reconcile karke verify kar lena.

---

## 🔴 2. "Real time nhi hai" — bilkul sahi, ye push-to-talk hai

`src/services/voiceActionEngine.js:17` me `callGemini38Flash` **`generateContent`** use karta hai — yaani ek normal HTTP request/response. Ye **Live API nahi hai.**

### Abhi ka flow

```
Mic dabao  →  MediaRecorder on  →  bolo  →  Mic DOBARA dabao  →  recording stop
   →  Blob  →  FileReader base64  →  HTTP POST (poori audio file)
   →  Gemini poori clip sunta hai  →  JSON reply  →  speechSynthesis bolta hai
```

Har turn pe **5 jagah wait**: user ko button dabana padta hai, poori file upload hoti hai, model poori clip process karta hai, phir TTS. Realistically **4-8 second** per turn.

Aur UI bhi yahi kehta hai — `AIVoiceCopilot.jsx:415`:
```js
setCurrentTranscript("🎙️ Sun raha hoon... Boliye aur fir Mic dabayein");
```
"Mic dabayein" — ye walkie-talkie hai, conversation nahi.

### Real-time kya hota hai

```
Mic chalu rehta hai  →  audio 16kHz PCM me chunk-by-chunk WebSocket pe stream
   →  Gemini ka server-side VAD khud detect karta hai ki aap ruk gaye
   →  jawab ki audio chunks turant wapas aati hain (24kHz)
   →  beech me bol do to model khud ruk jaata hai (barge-in)
```

Button nahi. Wait nahi. Interrupt ho sakta hai.

Iske liye **Gemini Live API** chahiye:
```
Model     gemini-3.8-live
Endpoint  wss://generativelanguage.googleapis.com/ws/
          google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
Audio in  16-bit PCM LE, 16 kHz, "audio/pcm;rate=16000"
Audio out 16-bit PCM, 24 kHz  (model ki apni awaaz — speechSynthesis ki zarurat hi nahi)
```

Google ka official doc: https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket

Aur ye Gemini audio doc me likha bhi hai:
> *"For real-time voice and video interactions, see the **Live API**."*

Yaani Google khud keh raha hai ki `generateContent` + audio real-time ke liye nahi hai.

---

## 🔴 3. "Realtime voice working nhi kar pa rha" — 3 wajah

### 3a. Web Speech API ab bhi code me hai, aur Electron me dead hai

`AIVoiceCopilot.jsx:253`:
```js
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) return null;        // chup-chaap null
```

Ye Review #1 ka P0-2 hai — **abhi tak waisa hi.** Electron me `webkitSpeechRecognition` Chrome ka private cloud service hai, Chromium ka nahi. Error: `network`, hamesha.

Aur `onerror` ab bhi sirf `console.warn` karta hai (line 311).

Ek `voiceNotice` state banaya gaya tha (line 31) — **par use kabhi set hi nahi kiya jaata.** Sirf teen jagah `setVoiceNotice(null)` hai. Yaani error message ka dabba bana diya, usme kuch dala nahi.

**Natija:** desktop app me continuous listening kaam nahi karti, user ko pata bhi nahi chalta kyun.

### 3b. Jawab Windows ke SAPI voice se bolwa rahe ho

`speakNaturalReply` → `window.speechSynthesis` → `getNaturalVoice()`:
```js
voices.find(v => v.lang.startsWith('hi') && (v.name.includes('Google') || ...))
...
return voices[0];     // ← Windows pe yahi chalta hai
```

Browser me Chrome "Google हिन्दी" voice deta hai — achhi lagti hai. **Electron me Chrome ki voices nahi hoti**, sirf Windows SAPI5. Hindi voice (Microsoft Hemant/Kalpana) tabhi milti hai jab user ne Hindi language pack install kiya ho — 95% machines pe nahi hota.

To `voices[0]` = *"Microsoft David – English (United States)"*, aur woh `"Begum Bridge par 12 sites available hain"` ko American accent me padhta hai. **Yahi "voice working nhi kar pa rha" hai.**

Live API me ye problem hi nahi — model apni awaaz khud bhejta hai, system voices se koi lena-dena nahi.

### 3c. Mic fail ho to button chup-chaap kuch nahi karta

```js
const startAudioRecording = () => {
  if (!streamRef.current) return;      // ← mic nahi mila? bas return. koi message nahi.
```

`streamRef.current` sirf `startMicAnalysis()` set karta hai, aur woh fail hone pe sirf `console.warn` karta hai. To mic permission deny / mic na ho / device busy ho — **mic button dabane pe literally kuch nahi hota, koi error nahi.**

### 3d. Waveform ab bhi nakli hai

`AIVoiceCopilot.jsx:160`:
```js
const dynamicVol = 0.35 + 0.3 * Math.sin(step);
```
`Math.random()` ki jagah `Math.sin()` aa gaya — **lekin ye ab bhi asli audio nahi hai.** Jarvis ki awaaz ka waveform ek sine wave hai.

---

## 🟠 4. NLP me jo abhi bhi galat nikal raha hai

Maine engine ko real vaakyon pe chalaya. Date parsing ab excellent hai ✅, par `search`/`siteQuery` extraction leaky hai:

| Bola | Nikla | Problem |
|---|---|---|
| `Tata Motors ke liye Begum Bridge pe 1 Nov se 30 Nov tak book kardo` | `siteQuery: "begum bridge `**se**`"` | trailing "se" → `loc.includes("begum bridge se")` **match nahi hoga** → "Site nahi mila" |
| `Meerut me 40x10 available sites dikhao` | `search: "meerut me"` + city `Meerut` | `setSearchTerm("meerut me")` **kisi location se match nahi karega** → screen pe 0 results, jabki city filter sahi laga hai |
| `client Tata Motors ke liye available sites dikhao` | `search: "client tata motors liye"` | client ka naam **location search** me daal diya → 0 results |
| `Begum Bridge dikhao` | `null` | sabse common command! Guard ko `dimensions \|\| city \|\| status \|\| media \|\| 'site' \|\| 'hoarding'` chahiye — inme se koi nahi hai, to offline matcher chhod deta hai |
| `campaign report dikhao` | `SWITCH_TAB → clients` | `dashboard` hona chahiye tha |

Root cause ek hi hai: `siteQueryExtract()` ek **stopword blacklist** hai. Blacklist kabhi poori nahi hoti. Jab city/dimension/status alag field me nikal liye, to woh words `search` string se bhi hatne chahiye — abhi nahi hat rahe.

Live API + function calling me ye poori problem khatam ho jaati hai, kyunki model structured arguments bhejta hai, regex nahi.

---

## 🔴 5. Security — 5 API keys ab bhi committed hain

`src/services/geminiService.js:20-24` — **koi badlaav nahi:**

```js
// Never hardcode a key here — this file is bundled and served to the browser.
    ... || 'AQ.Ab8RN6JX5X6bvAY9y-iBaVbdO_nAC49puDmbVyvGDZCkhGHHxQ',
    ... || 'AQ.Ab8RN6JloH5_7Hu50bxb4ODlyw0sG07RmWtNE57_JlGI09tPAw',
    ... || 'AQ.Ab8RN6KKuExOPSzweXaW0-4rEziM3GmonFb3-rvxHDc-ohOBcQ',
    ... || 'AQ.Ab8RN6KpJdKYy-63CLrqiPDSuEP8LW2Q2ioYPDLIIs5IdA560g',
    'AQ.Ab8RN6IR8j97v_TwvrhH8cB-HXI2y6-XDmPD6fjpsPHFUI1v-g'
```

Ye `hoarding-hd9a.vercel.app` ke JS bundle me, aur `.exe` ke `app.asar` me ship ho rahi hain. **Google AI Studio me jaakar aaj hi revoke karo** — code se hatane se purani keys un-leak nahi hotin.

---

## 🟡 6. Chhoti cheezein

| | |
|---|---|
| `interpretVoiceCommand` (`voiceActionEngine.js:360`, ~95 lines) | ab bhi **dead code** — kahin import nahi hota |
| `resolveRelativeDates` ka regex | ab `(20\d\d-\d\d-\d\d)` hai ✅ — 2030 wala bug gaya |
| `src/core/bulkBookingRealFiles.test.js:117` | live `docs.google.com` fetch karta hai → network ke bina **suite red**. Mock karo ya env flag ke peeche daalo |
| `npm run lint` CI me nahi hai | yahi wajah hai ki 12 errors mahino tak chhupe rahe. `.github/workflows/` me add karo |
| `AdminDashboard` chunk 1.04 MB | Jarvis ko `lazy(() => import(...))` se load karo |

---

## 🗺️ Ab aage kya

| Priority | Kaam | Effort |
|---|---|---|
| 🔴 **Abhi** | 5 Gemini keys revoke karo | 5 min |
| 🔴 **Abhi** | Sheet reconcile karo — jo bookings local me hain par sheet me nahi | 15 min |
| 🟠 **Agla** | **Live API migration** — Web Speech + MediaRecorder + speechSynthesis teeno hatao | main kaam |
| 🟡 Baad me | `siteQueryExtract` → function calling se replace | Live API ke saath hi ho jayega |
| 🟡 Baad me | `npm run lint` CI me | 10 min |

👉 Live API ka pura copy-paste prompt: **[`JARVIS_REALTIME_PROMPT.md`](./JARVIS_REALTIME_PROMPT.md)**
