# 📸 Staff Camera → AI Match → History/Review — Detailed Plan

**Likha gaya:** 03 Oct 2026 · **Code base:** `5d40255` (branch `arena/01a0f862-hoarding`)
**Status:** plan only — abhi koi code nahi badla

---

## 🎯 Verdict: aapki soch 80% sahi hai

| Aapka point | Verdict |
|---|---|
| App khulte hi location permission maange | ✅ Sahi — **par OS ka GPS toggle app se ON nahi ho sakta**, ye technically impossible hai. Workaround neeche |
| Photo click karte hi lat-long + naming aa jaye | ✅ **Already bana hua hai** aur achha bana hai |
| AI background me inventory se match kare, history me lage | ✅ **Already bana hua hai** |
| Staff ko kuch na dikhe, sirf photo click kare | ✅ **Bilkul sahi — aur ye abhi ulta hai.** Abhi staff ko sab dikhta hai |
| AI gine ki image me kitne hoarding hain | ✅ Achha idea — par "1 photo = 1 primary site" rule chahiye |
| Visual details se inventory match | ✅ Already partial hai (dHash + landmarks), extend karna hai |
| Match hone pe sab sync ho jaye | ⚠️ **Sirf history sync karo. STATUS kabhi auto mat likho** |
| Unmatched → Review | ✅ Already hai |
| Review me 300m ke andar wali aa jaye | ⚠️ **Ye feature abhi DEAD CODE hai** (neeche #1), aur 300m fix nahi, adaptive hona chahiye |
| **"but same facing ki"** | ❌ **Ye aapke plan ki sabse badi galti hai** — isse sahi site chhup jayegi |
| Admin confirm kare to match ho jaye | ✅ Sahi — par "nayi site hai" option bhi chahiye |

---

## 📦 Part 1 — Jo pehle se bana hua hai (ise dubara mat banwana)

Kaafi kuch already hai. Ye list isliye de raha hoon taaki koi AI isse scratch se na likhe:

| Cheez | Kahan | Haal |
|---|---|---|
| Staff camera app | `src/pages/StaffUpload.jsx` (1561 lines) | ✅ Kaam karta hai |
| Android app | `capacitor.config.json` → `com.heeraadvertising.staff` | ✅ Vercel URL load karta hai `?mode=staff` |
| GPS permission modal + "Turn On Location" button | `StaffUpload.jsx:1380` | ✅ Hai |
| Live GPS `watchPosition` + accuracy | `StaffUpload.jsx:843` | ✅ Hai |
| Digital compass (heading → N/NE/E…) | `StaffUpload.jsx:573` | ✅ Hai |
| GPS watermark photo pe stamp | `stampGpsWatermarkOnBlob` line 38 | ✅ Bahut achha bana hai |
| Offline queue (IndexedDB) | `src/services/staffQueue.js` | ✅ Hai |
| Token-based staff access | `hasStaffToken()` | ✅ Hai |
| Desktop block + QR code | `StaffUpload.jsx:1215` | ✅ Hai |
| **GPS proximity matching** | `aiService.js:378 matchHoardingByGps` | ✅ Solid hai |
| **Structure filter** (unipole vs gantry) | `aiService.js:482` | ✅ Hai |
| **Twin-site facing resolution** | `aiService.js:498` | ✅ Hai |
| **Image dHash similarity** | `aiService.js:568` | ✅ Hai, site ki ImageURL se compare karta hai |
| **Gemini vision match + Occupied/Available** | `geminiService.js:166` | ✅ Hai |
| Auto-sync to site history | `dataService.js:899 recordSiteHistory` | ✅ Hai |
| Review queue | `AdminDashboard.jsx:8957` | ✅ Hai |
| Approve / History Only / Reject | `handleStaffReview` line 5066 | ✅ Hai |
| Visual landmark auto-generate on approve | line 5085 | ✅ Achha feature |

**Matlab base 70% ready hai.** Jo chahiye woh naya system nahi — **5 corrections + 4 naye feature** hain.

---

## 🐛 Part 2 — Jo abhi TOOTA hua hai

### 1. "300m ke andar wali sites dikhe" — ye feature **dead code** hai

Review card me ye likha hai (`AdminDashboard.jsx:9009`):
```jsx
{(upload.NearbySites || []).slice(0, 4).map(site => { ... })}
```

Maine poore repo me grep kiya:
```
AdminDashboard.jsx:9009   ← padhta hai
dataService.js:2165       ← pass-through karta hai
```
**`NearbySites` kahin bhi LIKHA nahi jaata.** Hamesha `[]` rehta hai.

👉 Yaani aapko review me jo nearby sites ki strip dikhni chahiye thi, **woh kabhi dikhi hi nahi.** Aapko laga feature hai — UI me dabba bana hai, data kabhi bhara hi nahi gaya.

### 2. GPS accuracy capture hoti hai par **use nahi hoti**

`matchHoardingByGps` me auto-approve ka rule hai (`aiService.js:412`):
```js
if (closest.distanceM <= 25 && (!candidates[1] || candidates[1].distanceM > 30)) {
    return { confidence: 99, ... }   // AUTO_APPROVED
}
```

Isme `accuracy` ka naam tak nahi hai. Matlab agar phone ka GPS fix **±80 meter** ka hai (building ke paas, cloudy din, sasta phone — ye normal hai), tab bhi agar calculated distance 25m aa gayi to **99% confidence** de deta hai.

👉 **±80m accuracy pe 25m distance ka koi matlab nahi hai.** Ye galat auto-match ki sabse badi wajah hai.

### 3. History ki photo **reload pe gayab** ho jaati hai

`StaffUpload.jsx:1059` me `recordSiteHistory` ko `base64Data` (data: URL) bheja jaata hai.
`dataService.js:929` me logic hai:
```js
if (isRemote && !cleanUrl.startsWith('data:image/') && cleanUrl.length < 3000) {
    → localStorage me save         // permanent
} else {
    → sessionStorage me save        // ❌ tab band = photo gayab
}
```
Data URL hamesha `else` me jaata hai → **sessionStorage** → app restart pe history khaali.

### 4. Field me Gemini call **fail hogi**

`capturePhoto` photo lene ke turant baad `analyzeHoardingImage` call karta hai, jo andar se Gemini ko HTTP request bhejta hai. Field me Begum Bridge pe 2 bar signal pe:
- request timeout hogi → `catch` → "Sent to admin review"
- **har photo review me chali jayegi**

Ya to staff 30 second khada rahega, ya sab manual ho jayega.

### 5. Staff ko sab kuch dikh raha hai — aapki complaint bilkul sahi

Abhi photo lene se **pehle** HUD me ye dikhta hai (`StaffUpload.jsx:1466-1520`):
```
📍 Begum Bridge Metro Station          [ 18m ]
   Sadar Bazar, Meerut
   Compass Facing: NE (48°)
   Traffic Facing: Modipuram
   Live GPS Fix: 28.998107, 77.705821 (±12m)
```
Aur photo ke **baad** banner (line 1425):
```
✨ AUTO-MATCHED (50m)
[SL #1] Begum Bridge Metro Station
Available • 18m away • Direct History Saved ✅
```
Plus bolta bhi hai: `speakOfflineVoice('Site photo auto-match aur history me sync ho gayi hai.')`

👉 **Audit ke hisab se ye galat hai.** Staff ko pata chal jaata hai ki app kya soch raha hai. Woh 200m door se photo khinch ke bhi dekh sakta hai ki app ne match kar liya — aur aage badh jaayega.

---

## ⚠️ Part 3 — Aapke plan me 5 corrections (ye sabse zaroori hissa hai)

### ❌ Correction 1 — "same facing ki" FILTER mat lagao

**Aapka plan:** review me 300m ke andar sirf same facing wali sites dikhein.

**Problem:** facing kahan se aata hai? Phone ke magnetometer se:
```js
heading = Math.round(360 - e.alpha);   // StaffUpload.jsx:580
```

Android compass teen jagah jhooth bolta hai:
1. **Hoarding ka steel pole khud magnet ki tarah kaam karta hai** — 40-60° ka error normal hai
2. Phone calibrate nahi hua (figure-8 ghumaye bina) → 90° tak galat
3. `360 - alpha` tabhi sahi hai jab phone **seedha khada** ho. Staff upar ki taraf tilt karke photo leta hai → alpha bakwaas

**Agar aap hard filter laga doge:** compass ne galat direction di → sahi site list se **gायब** → admin usko match hi nahi kar payega → photo hamesha ke liye review me atki rahegi.

**✅ Sahi tarika — FILTER nahi, SORT + BADGE:**
```
Begum Bridge – Modipuram facing     18m   🟢 Facing match
Begum Bridge – Soti Ganj facing     22m   ⚪ Opposite facing
Sadar Bazar Chowk                  140m   ⚪ Different facing
```
- Same facing wali **sabse upar**, green badge ke saath
- Baaki bhi **dikhti rahein**, neeche, grey badge
- Upar ek toggle: `[✓] Sirf same facing` — **default ON**, admin chahe to OFF kar de

Isse aapko 95% waqt wahi milega jo aap chahte ho, aur 5% jab compass jhooth bole tab bhi admin phasega nahi.

---

### ❌ Correction 2 — 300m fix mat rakho, GPS accuracy ke hisab se adjust karo

**Problem dono taraf hai:**

| Situation | 300m fix ka natija |
|---|---|
| Khula highway, accuracy ±5m | 300m me 15 sites aa jayengi → admin ko bekaar ki list |
| Sadar Bazar, buildings, accuracy ±70m | Asli site 340m pe calculate hui → **list me hai hi nahi** → admin phas gaya |

**✅ Sahi tarika — adaptive radius:**
```
radius = clamp(100m,  6 × gpsAccuracy,  400m)

±5m  accuracy →  100m  (saaf fix, tight search)
±25m accuracy →  150m
±70m accuracy →  400m  (kharab fix, wide search)
```
Plus review card pe ek button: **"Aur door tak dekho (+200m)"** — kabhi admin phase hi nahi.

Aur list ko distance se nahi, **score** se sort karo (neeche Part 5).

---

### ❌ Correction 3 — Vision AI phone pe mat chalao

**Aapka plan:** photo click karte hi AI background me match kare.

**Problem:** "AI" ka matlab abhi Gemini API call hai. Field me:
- 2 bar signal → 15-30 s ya timeout
- Har photo = paisa (aur aapke 5 keys abhi bhi phone ke bundle me hain — **ye bhi revoke karo**)
- Staff 50 photo lega → 50 API call → staff khada intezar karega

**✅ Sahi tarika — do layer:**

```
PHONE (hamesha, offline bhi, <100ms):
  GPS + compass + capture + watermark + queue
  └→ Local deterministic score (sirf maths, koi network nahi)
     └→ score ≥ 85 → AUTO
        score 60-85 → REVIEW (suggestion ke saath)
        score < 60  → REVIEW (blank)

ADMIN DESKTOP / jab net mile:
  └→ Gemini vision: kitne hoarding, Occupied/Available, visual match
     └→ score ko upgrade/downgrade kare
```

Phone kabhi network ka wait na kare. Vision **optional upgrade** hai, requirement nahi.

Fayda: admin desktop app me net achha hai, key wahi rehti hai, aur staff ka phone 10x fast ho jaata hai.

---

### ⚠️ Correction 4 — "kuch na dikhe" — identity chhupao, health dikhao

**Aapka plan sahi hai**, par agar literally **kuch bhi** nahi dikhega to:
- Staff ko pata nahi chalega photo gaya ya nahi → 5 baar click karega
- GPS nahi mila to 40 photo bina location ke le lega → **saari review me**
- Camera ka focus kharab tha → pata hi nahi chala

**✅ Sahi tarika — "task-blind, health-visible":**

| ❌ Chhupao (site identity) | ✅ Dikhao (capture health) |
|---|---|
| Site ka naam | GPS: 🟢 ready (±8m) / 🟡 weak (±45m) / 🔴 off |
| SL number | Compass: 🟢 calibrated / 🟡 calibrate karo |
| Distance "18m away" | Shutter animation + thumbnail |
| "AUTO-MATCHED ✅" | `12 bheji • 3 baki` counter |
| Available/Occupied status | Blur detect: "photo hil gayi, dobara lo" |
| Nearby sites list | Undo button (jo abhi hai) |
| Voice "match ho gayi" | — |

Capture ke baad bas: **✓ Photo saved** — bas. Na naam, na status, na distance.

**Bonus:** agar GPS accuracy ±100m se kharab hai to **shutter hi lock kar do** — "GPS weak, 10 second ruko". Isse hi 60% review queue khatam ho jayegi.

---

### ⚠️ Correction 5 — "AI gine kitne hoarding hain" — 1 photo = 1 primary site

**Aapka idea achha hai**, par agar ek photo me 3 hoarding hain aur AI teeno ko match kar de, to woh ek hi photo 3 sites ki history me lag jayegi → history jhooth bolne lagegi.

**✅ Sahi tarika:**
```
Primary subject = sabse bada + sabse centered panel
  → isi site ki history me photo lagegi

Baaki panels = "co-visible observations"
  → alag table me log honge
  → history me NAHI jayenge
  → par "is site ke aas-paas ye bhi dikhe" intel mil jaayegi
```

Ye actually **bahut valuable** hai — free me competitor intel aur occupancy data mil jaata hai. Par history clean rehni chahiye.

---

## 🧠 Part 4 — Jo aapke plan me nahi tha (par hona chahiye)

### A. Duplicate / fraud detection

Field staff ka gaming real hai:

| Trick | Detection |
|---|---|
| Ek hi hoarding ki 2 photo, 2 alag site bata ke | **dHash** — `computeImageDHash` already hai. Same day + distance < 8 → duplicate flag |
| Gaadi se bina utre photo | Lagatar 2 photo me GPS 500m shift in 10 s → "moving vehicle" flag |
| Screen/printout ki photo | GPS accuracy + Gemini se "is this a photo of a screen?" |
| Purani photo gallery se | Camera-only capture (already hai ✅) + EXIF timestamp check |

### B. Learning loop — system khud behtar hota jaye

Jab admin review me **Confirm** dabaye, to sirf history me mat daalo:
```
1. Photo ka dHash   → site ke "ReferenceHashes" me add karo
2. Photo ka GPS      → site ke coordinates ka running average update karo
3. Compass heading   → site ka "ObservedHeading" bharo
4. Visual landmark   → agar khaali hai to Gemini se bharo (ye already hai ✅)
```
3 mahine me har site ke paas 10-15 confirmed reference photos + sahi GPS centroid ho jayega → **review queue apne aap sookh jayegi.**

Ye single feature sabse zyada ROI dega.

### C. Coverage report — jo sites match ho hi nahi sakti

Agar inventory row me lat/long khaali hai, to woh site **kabhi** match nahi hogi. Dashboard pe ek chhota card chahiye:
```
⚠️ 47 sites me GPS coordinates nahi hain — ye staff photos se kabhi match nahi hongi
   [ List dekho ]
```

### D. "Ye nayi site hai" button

Review me abhi Approve / History Only / Reject hai. Agar staff ne aisi hoarding ki photo li jo inventory me hai hi nahi, to abhi koi option nahi — photo ya to galat site pe lag jayegi ya reject ho jayegi.

Chahiye: **"➕ Nayi site banao"** — GPS + photo + compass se draft row bana de.

### E. STATUS kabhi auto mat likho ⚠️

Gemini "Occupied/Available" detect karta hai. **Isse kabhi seedha sheet me mat likho.**

Hoarding us ghante blank dikh sakti hai kyunki flex badla ja raha tha. Agar AI ne `Available` likh diya aur woh site actually `Booked` thi, to **booked site available dikhne lagegi → double booking.**

→ Proposal banao: `"AI ko laga Available (82%) — abhi sheet me Booked hai"` + admin ke liye ek "Status update karo" button. Auto kabhi nahi.

---

## 🗄️ Part 5 — Data model

### Staff upload record (extend karo)

Abhi jo hai: `UploadId, CapturedAt, Latitude, Longitude, Accuracy, Distance, Facing, ImageURL, Status, Decision, SuggestedSite, ApprovedSite`

Ye add karo:

| Field | Kyun |
|---|---|
| `GpsAccuracyM` | Already capture hoti hai, par score me use nahi hoti |
| `CompassDeg` / `CompassDir` | Review me dikhane ke liye |
| `CompassQuality` | `calibrated` / `uncalibrated` / `unavailable` |
| `MatchScore` 0-100 | Final confidence |
| `MatchBreakdown` JSON | `{gps:42, margin:12, facing:15, structure:8, visual:6}` — admin dekh sake ki AI ne kyun socha |
| **`CandidateSites` JSON** | **Top 8 sites score ke saath — yahi `NearbySites` ko zinda karega** |
| `SearchRadiusM` | Kitni radius me dhoonda |
| `PanelCount` | Image me kitne hoarding dikhe |
| `PrimaryPanelBox` | Subject panel ka bounding box |
| `CoVisiblePanels` JSON | Baaki panels |
| `OccupancyGuess` + `OccupancyConfidence` | Proposal, auto-write nahi |
| `ImageHash` | dHash — dedupe ke liye |
| `DuplicateOfUploadId` | Agar duplicate mila |
| `IntegrityFlags` JSON | `["moving_vehicle","low_gps"]` |
| `StaffId` / `DeviceId` | Kisne li — abhi koi attribution nahi hai |
| `ReviewedBy` / `ReviewedAt` / `ReviewAction` | Audit trail |
| `FinalSiteId` | Ye `_SiteID` ho, site **naam** nahi |

> ⚠️ **Zaroori:** abhi matching site ke **naam** se hoti hai (`recordSiteHistory({"Location ": matchedSite})`). Naam duplicate hote hain ("Begum Bridge Metro Station" **do** sites ka naam hai — dono facing alag). **`_SiteID` use karo**, naam nahi.

### Site row pe naye columns

| Field | Kyun |
|---|---|
| `ReferenceHashes` | Confirmed photos ke dHash (learning loop) |
| `ObservedLat` / `ObservedLng` | Confirmed photos ka GPS average |
| `ObservedHeading` | Camera kis direction se dekhti hai |
| `LastVerifiedAt` | Aakhri baar kab field me dekha gaya |
| `Visual_Landmarks` | ✅ already hai |

---

## 🎯 Part 6 — Scoring engine (system ka dil)

Ek **pure function**, koi network nahi, poori tarah testable:

```
scoreCandidate(photo, site) → 0..100

 1. GPS proximity          0-45
    tolerance = accuracy + 20m
    d ≤ tolerance        → 45
    d ≤ 3 × tolerance    → linear decay 45 → 10
    warna               → 0

 2. Separation margin      0-15
    #1 aur #2 ke beech kitna gap
    gap ≥ 2 × tolerance  → 15   (koi confusion nahi)
    gap ~ 0              → 0    (twin sites — vision chahiye)

 3. Facing agreement       0-15
    compass vs site Facing / Traffic From-To
    CompassQuality = uncalibrated → max 5 (wajan kam)

 4. Structure match        0-10
    photo unipole vs site gantry → 0   (already bana hai)

 5. Visual similarity      0-15
    dHash distance site ki ImageURL + ReferenceHashes se
    + Visual_Landmarks text overlap
```

### Thresholds

| Score | GPS accuracy | Faisla |
|---|---|---|
| ≥ 85 | ≤ 25m | ✅ **AUTO** → history me, staff ko kuch nahi dikhega |
| ≥ 85 | > 25m | ⚠️ **REVIEW** — score achha par GPS pe bharosa nahi |
| 60-84 | koi bhi | ⚠️ **REVIEW** — top suggestion pre-selected |
| < 60 | koi bhi | ⚠️ **REVIEW** — blank, admin khud chune |
| radius me koi site nahi | — | ❓ **UNMATCHED** — "nayi site?" prompt |

👉 **Ye function alag file me ho** (`src/services/staffMatchEngine.js`) taaki iske 30-40 unit tests likhe ja sakein. Abhi ye logic `StaffUpload.jsx` ke andar bikhra hua hai — test karna namumkin hai.

---

## 🖥️ Part 7 — Review cockpit (dashboard)

Abhi review card me sirf image + ek text box + 3 button hain. Chahiye:

```
┌─────────────────────────────────────────────────────────────┐
│  [ PHOTO ]          03 Oct 2026, 11:42 AM · Staff: Ramesh    │
│                     GPS 28.998107, 77.705821  ±14m 🟢        │
│                     Compass NE (48°) 🟢 calibrated           │
│                     📊 Panels detected: 2                    │
│                     ⚠️ Score 64 — GPS theek, facing match    │
│                        nahi hui                              │
│─────────────────────────────────────────────────────────────│
│  [✓] Sirf same facing        Radius: 150m  [ +200m ]        │
│                                                              │
│  ┌──────┐ 🟢 94  Begum Bridge – Modipuram                   │
│  │ img  │       18m · Facing ✓ · Unipole ✓ · dHash 0.91     │
│  └──────┘       [ ✔ CONFIRM ]                               │
│                                                              │
│  ┌──────┐ ⚪ 61  Begum Bridge – Soti Ganj                    │
│  │ img  │       22m · Opposite facing · Unipole ✓           │
│  └──────┘       [ ✔ CONFIRM ]                               │
│                                                              │
│  ┌──────┐ ⚪ 28  Sadar Bazar Chowk                           │
│  │ img  │       140m · Facing ✓ · Gantry ✗                  │
│  └──────┘       [ ✔ CONFIRM ]                               │
│─────────────────────────────────────────────────────────────│
│  [ ➕ Nayi site ]  [ 🗑 Reject ]  [ ⏭ Baad me ]              │
└─────────────────────────────────────────────────────────────┘
```

Zaroori baatein:
- **Side-by-side**: staff ki photo left, candidate ki reference photo right — admin aankh se compare kar sake
- **Score breakdown dikhao** — "kyun 64?" ka jawab mile
- **Keyboard**: `1` `2` `3` candidate chunne ke liye, `Enter` confirm, `→` next. 50 photo 3 minute me nipat jayein
- **Bulk**: "saari 90+ score wali approve kar do"
- Confirm pe **learning loop** (Part 4B) chale

---

## 🗓️ Part 8 — Phases

### Phase 0 — Bug fixes (1-2 din) — **sabse pehle ye**
1. `NearbySites` ko actually **likho** → dead feature zinda ho jayega
2. GPS accuracy ko auto-approve gate me daalo (`accuracy ≤ 25m`)
3. History photo pehle Drive pe upload, **phir** `recordSiteHistory` call — data URL mat bhejo
4. Matching ko site **naam** se hata ke `_SiteID` pe le jao
5. Gemini call ko `AbortController` + 6s timeout + try/catch me daalo — field me block na ho
6. `src/services/geminiService.js:20-24` ki **5 keys revoke** karo — ye staff ke phone me bhi ship ho rahi hain

### Phase 1 — Blind camera (2-3 din)
7. HUD se site identity hatao (naam, distance, facing, status) — health indicators rakho
8. Match banner → `✓ Photo saved` (identity ke bina)
9. `speakOfflineVoice` ka match announcement hatao
10. GPS accuracy > 100m pe shutter lock + "GPS weak, 10 s ruko"
11. Blur detection (Laplacian variance) → "photo hil gayi, dobara lo"
12. `StaffId` / `DeviceId` attribution

### Phase 2 — Scoring engine (3-4 din)
13. `src/services/staffMatchEngine.js` — pure function, Part 6 wala score
14. Adaptive radius
15. Top-8 candidates `CandidateSites` me save
16. Facing: sort + badge (**filter nahi**)
17. **30+ unit tests** — twin sites, kharab GPS, missing coords, uncalibrated compass, unipole-vs-gantry
18. `StaffUpload.jsx` ko is engine pe shift karo

### Phase 3 — Review cockpit (3-4 din)
19. Naya review card (Part 7)
20. Side-by-side compare
21. Score breakdown
22. Keyboard nav + bulk approve
23. "Nayi site" flow
24. Learning loop on confirm

### Phase 4 — Vision layer (4-5 din)
25. Panel count + bounding box + primary subject
26. Co-visible panels log
27. Occupancy **proposal** (auto-write nahi)
28. Vision admin side pe chale, phone pe nahi
29. Vision score ko base score ke saath merge karo

### Phase 5 — Integrity (2-3 din)
30. dHash dedupe (same site + same day)
31. Moving-vehicle detection
32. `IntegrityFlags` review me dikhao
33. GPS coverage report card
34. Staff-wise accuracy leaderboard (kiski photos sabse zyada reject hoti hain)

**Total ≈ 15-21 din.** Phase 0 + 1 ke baad hi aapko 70% fayda dikh jayega.

---

## 🚫 Part 9 — Ye mat karna

| ❌ | Kyun |
|---|---|
| OS ka GPS toggle app se ON karna | **Technically impossible.** Android/iOS kisi app ko location services ON nahi karne dete. Zyada se zyada: app permission maange + settings ka shortcut khole. Jo modal abhi hai woh already sahi approach hai |
| Facing pe hard filter | Compass jhooth bolta hai → sahi site chhup jayegi |
| Sheet me STATUS auto-write | Double booking ho jayegi |
| Site **naam** se match | Duplicate naam hain ("Begum Bridge Metro Station" × 2) |
| Vision phone pe chalana | Field me network nahi hai |
| Ek photo 3 sites me daalna | History jhooth bolegi |
| localStorage me base64 photos | Quota 5MB hai, 10 photo me bhar jayega |
| `StaffUpload.jsx` ko 2000 lines tak badhana | Abhi hi 1561 hai. Engine alag file me |

---

## ✅ Summary

**Aapki soch sahi hai**, teen cheezein badlo:

1. **Facing = sort karo, filter mat karo** — compass pe itna bharosa nahi kar sakte
2. **300m = adaptive karo** (GPS accuracy × 6, 100-400m), aur "+200m" button do
3. **Vision admin side pe chalao**, phone pe nahi — field me net nahi hota

Aur teen cheezein **add** karo jo aapne nahi socha:

4. **Learning loop** — har confirm se site ka GPS + reference hash behtar ho (sabse zyada ROI)
5. **Dedupe + fraud flags** — dHash already bana hua hai, bas use karna hai
6. **GPS accuracy gate** — isse akele hi review queue aadhi ho jayegi

Aur sabse pehla kaam: **`NearbySites` likhna shuru karo** — jo feature aap maang rahe ho, uska UI bana hua hai par usme data kabhi gaya hi nahi.
