# 🔍 Hoarding Project – Audit Report (Round 2)
**Date:** 19 Sep 2026 · **Commit:** `09314d2` "Fix syntax errors, undefined variables, and API key bugs" · **Version:** 1.7.0

Aapka naya code merge karke dobara pura scan kiya — build, tests, lint, live dev server, aur frontend ka deep review.

---

## ✅ Pichhli Baar Ke Bugs – Verification

| # | Bug | Status |
|---|---|---|
| 1 | `QuickKpiCards.jsx` backticks missing | ✅ **Fixed** (BOM character bhi hat gaya, accha) |
| 2 | `DEFAULT_KEY is not defined` (groqService) | ✅ **Fixed** (const add kiya) |
| 3 | `index is not defined` (AdminDashboard catch block) | ✅ **Fixed** (`.map()` se sahi kiya) |
| 4 | `siteObj` direct mutation | ✅ **Fixed** (3 mutation lines hata di) |
| 5 | `no-control-regex` lint error | ✅ **Fixed** (eslint-disable comment) |
| 6 | `vite.config.js` → `allowedHosts` | ✅ Fixed (maine kiya tha) |

**Result:** ESLint ab **0 errors** (pehle 8 the) · Build ✅ 9.7s · Tests ✅ 42/42 pass · Dev server ✅ chalta hai.

Shaandaar kaam. Ab jo abhi bhi bacha hai:

---

## 🔴 NAYA BUG (aapke fix se aaya)

### `siteObj` mutation hatane se ek chhota side-effect
**File:** `src/pages/AdminDashboard.jsx` line ~1145

Aapne 3 mutation lines hata di (sahi kiya), lekin uske **theek neeche** line 1162 pe:
```js
if (urlToRemove) removeSiteHistory(siteObj, urlToRemove);
```
`removeSiteHistory()` ab bhi purana `siteObj` use kar raha hai jiska `ImageURL` **update nahi hua**. Ye function localStorage caches purge karta hai, to kaam to kar jaayega, par jo `setHoardings()` block neeche aata hai (line 1176) wo `restoredPhotoUrl` sahi set karta hai — matlab **actual behaviour theek hai**. 👍

Bas ek baat confirm kar lo: reject karne ke baad UI me purani photo wapas aa rahi hai ya nahi. Agar nahi aa rahi, to `setHoardings` ka `isMatch` condition check karna (line 1178) — wo sirf `SL` ya `siteId` se match karta hai, agar dono khaali hue to rollback skip ho jaayega.

---

## 🟠 ABHI BHI PENDING (pichhli report se)

### 1. `/hira-logo.png` file abhi bhi missing hai — **404**
Live server par test kiya:
```
/hira-logo.png  -> 404 (HTML fallback aa raha hai, image nahi)
/heera-logo.png -> 200 ✅ (asli file ka naam ye hai)
/favicon.ico    -> 404
```
- `index.html` line 6: favicon → toota hua
- `index.html` line 14: `og:image` → **WhatsApp/Facebook pe link share karoge to preview image nahi aayegi**
- `public/sw.js` line 9-10: precache list me dono missing files — isse **poora `cache.addAll()` fail ho jaata hai**, matlab offline mode kaam hi nahi karega
- `package.json` line 57: `win.icon: "public/favicon.ico"` → Windows installer default icon ke saath banegi

**Fix:** `index.html` aur `sw.js` me `/hira-logo.png` → `/heera-logo.png` karo, aur `favicon.ico` entry hata do (ya `app-icon-192.png` use karo).

### 2. `/staff/upload` bilkul public hai — koi auth nahi
`StaffUpload.jsx` me `token` shabd ek baar bhi nahi hai. `secureApi.js` me `getStaffUploadLink()` token generate karta hai, par page use verify hi nahi karta. Koi bhi URL guess karke photos upload kar sakta hai.

### 3. Admin auth abhi bhi `localStorage` se bypass ho sakta hai
`secureApi.js:26` → `localStorage.isAdminAuthenticated === 'true'` se session ban jaata hai. Personal project hai to theek, par jaan lo ki ye open hai.

### 4. `.npmrc` nahi hai — plain `npm install` fail hota hai
`react-helmet-async@2.0.5` React 19 support nahi karta → ERESOLVE. `--legacy-peer-deps` zaroori hai.
**Bonus tip:** React 19 me `<title>` aur `<meta>` **natively** kaam karte hain — `react-helmet-async` dependency poori tarah hata sakte ho.

---

## 🎨 FRONTEND ME KAMI (jo aapne specially poocha)

### 5. 🌙 Dark Mode **poori tarah disabled hai** — sirf dikhawa hai
`src/components/DarkModeContext.jsx`:
```js
const [isDark, setIsDark] = useState(false);
useEffect(() => {
  root.classList.remove('dark');          // hamesha light force
  root.setAttribute('data-theme', 'light');
}, []);
const toggle = () => {};                   // ❌ khaali function!
```
- `toggle()` kuch karta hi nahi
- `setIsDark` kabhi call hi nahi hota
- `DarkModeToggle.jsx` component bana hua hai par **kahin import hi nahi**
- `index.css` me koi `[data-theme="dark"]` / `.dark` CSS rules hi nahi hain

Matlab dark mode ka pura infrastructure hai par **feature exist hi nahi karta**. Ya to properly implement karo ya ye 3 files hata do.

### 6. 🔗 Footer ke saare links **dummy** hain
`Footer.jsx` me:
- 4 social icons (Instagram, LinkedIn, Facebook, Twitter) → sabhi `href="#"`
- "About Agency", "Our Solutions", "Career Portal", "Support Desk" → sabhi `href="#"`
- "Terms of Service", "Privacy Policy" → `href="#"`
- "Prime Cities", "Digital Billboards", "Media Kit 2026" → teeno `to="/"` (sab home pe jaate hain)
- **Newsletter box ka koi `onSubmit` handler hi nahi** — email daalo, button dabao, kuch nahi hota
- Contact details **placeholder** hain: `+91 99999 00000`, `media@heeraadvertising.com`, "Skyline Plaza, Sector 18, Noida" — jabki `HoardingDetail.jsx:916` me asli number `+91 9569528771` use ho raha hai. **Inconsistent.**

### 7. 📄 **404 page nahi hai**
`/nonexistentpage123` → HTTP 200 aur khaali CityList page dikhta hai ("Discovering 0 premium billboard locations"). Route `/:cityName` sab kuch nigal jaata hai. User ko samajh nahi aayega ki page exist nahi karta.
**Fix:** `<Route path="*" element={<NotFound />} />` add karo, aur `CityList` me agar city inventory me hai hi nahi to proper message dikhao.

### 8. 📱 `AdminLogin.css` me **ek bhi media query nahi**
Login page mobile pe test karo — `padding: 40px` + `max-width: 400px` chhoti screens pe tight lagega. Baaki saare pages me responsive breakpoints hain, sirf login page chhoot gaya.

### 9. ♿ Accessibility gaps
- **39 `<img>` tags me se sirf 23 me `alt`** hai → 16 images bina alt text ke (SEO + screen reader dono ke liye bura)
- `CityList.jsx` me **pagination nahi hai** — agar 500+ hoardings hain to sab ek saath DOM me render honge → mobile pe page freeze/lag. Infinite scroll ya pagination zaroori hai.

### 10. 🔍 SEO kami
- `robots.txt` nahi hai
- `sitemap.xml` nahi hai
- Ye ek **public discovery platform** hai — Google pe hoardings index karane ke liye dono chahiye. Helmet se meta tags to lag rahe hain par crawler ko guidance nahi mil rahi.

### 11. ⚡ Performance
- `AdminDashboard` chunk = **1,075 KB** (gzip 335 KB) — single 10,348-line file
- `public/hoardings.json` 151 KB repo me pada hai, **kahin fetch hi nahi hota** — dead weight
- `CityList` chunk 173 KB (Leaflet ki wajah se) — map sirf tab load karo jab user "Map" tab pe click kare

### 12. 🧹 Dead code (abhi bhi 0 references)
| File | Lines | Status |
|---|---|---|
| `components/ProposalBuilder.jsx` | 346 | kabhi import nahi |
| `components/LoadingSkeleton.jsx` | 112 | kabhi import nahi |
| `components/DarkModeToggle.jsx` | 31 | kabhi import nahi |
| `components/dashboard/QuickKpiCards.jsx` | 71 | fix to ho gaya, par ab bhi unused |
| `public/hoardings.json` | 151 KB | kabhi fetch nahi |
| `importData.js` (root) | 3 KB | kabhi reference nahi |

### 13. 🔧 Sheet Editor ke adhoore features
ESLint warnings batate hain ki ye functions **likhe gaye par UI se connect hi nahi kiye**:
- `findNext`, `findPrev`, `replaceCurrent`, `replaceAllMatches` → **Find & Replace feature adhoora**
- `handleColResizeStart`, `handleRowResizeStart` → **column/row resize adhoora**
- `pasteCutBuffer` → **cut-paste adhoora**
- `maxZoneCount`, `verifiedPercent` → calculate hote hain, kahin dikhte nahi

Excel-jaisa editor banaya hai to ye teeno features user expect karega.

### 14. Baaki chhoti cheezein
- `disableInspect.js` right-click block karta hai — **legit users ko image save karne se rokta hai** par security 5 second me bypass ho jaati hai. Public site pe ye UX ke liye bura hai.
- Service worker `CACHE_NAME = 'heera-staff-cache-v1'` hardcoded — naye deploy pe stale cache rahega. `APP_VERSION` se derive karo.
- 83 ESLint warnings (zyadatar unused vars) — errors 0 hain, par saaf karna accha rahega.
- `Navbar.jsx` me `localStorage.getItem()` render ke andar direct call hai — React state nahi hai, to login ke baad button "Admin" se "Dashboard" **turant nahi badlega** jab tak page reload na ho.

---

## 🎯 Priority Order

| Priority | Task | Time |
|---|---|---|
| 🔴 1 | `hira-logo.png` → `heera-logo.png` (index.html + sw.js + package.json) | 10 min |
| 🔴 2 | 404 route add karo | 20 min |
| 🟠 3 | Footer ke dummy links + asli contact details | 30 min |
| 🟠 4 | Dark mode: ya implement karo ya hata do | 1-2 hr |
| 🟠 5 | `/staff/upload` pe token verify | 1 hr |
| 🟠 6 | `.npmrc` + react-helmet-async hatao | 20 min |
| 🟡 7 | `robots.txt` + `sitemap.xml` | 30 min |
| 🟡 8 | CityList pagination | 1 hr |
| 🟡 9 | Missing `alt` attributes (16 images) | 30 min |
| 🟡 10 | AdminLogin responsive | 20 min |
| 🔵 11 | Sheet Editor find/replace wire karo | 3-4 hr |
| 🔵 12 | Dead code cleanup | 30 min |
| 🔵 13 | AdminDashboard split (10k lines) | 1-2 din |

---

*Bolo to priority 1-6 wale fixes main abhi kar doon — lagbhag 3 ghante ka kaam hai aur frontend turant polished lagega.*
