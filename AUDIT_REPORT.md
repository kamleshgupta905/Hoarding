# ✅ Hoarding Project – Security & Cleanup Fixes
**Date:** 19 Sep 2026 · **Commits:** `47d7a20`, `8404046` · **Branch:** `arena/01a0b9bf-hoarding`

---

## ⚠️ Sabse Zaroori: Deploy Karna Padega

Backend ke fixes **`google_apps_script/Code.gs`** me hain. Ye file repo me hai par **Google Apps Script pe automatically nahi jaati**. Jab tak aap ise deploy nahi karte, backend purana (asurakshit) hi chalega:

```bash
npm run script:push
```
Ya manually: Apps Script editor kholo → file ka content paste karo → **Deploy → Manage deployments → Edit → Deploy**.

**Deploy ke baad ek baar logout/login karna padega** — purane session tokens ab valid nahi hain.

---

## 🔴 1. Admin Auth — Backend Bypass (sabse serious)

**Problem:** `isValidAdminSession_()` ka **har path `true` return karta tha**:
```js
function isValidAdminSession_(token) {
  if (!token) return true;              // khaali token = pass
  if (cache.get('session:' + token)) return true;
  if (str.length >= 8) return true;
  return true;                          // ← aakhri line bhi true
}
```
Matlab 21 jagah likha `if (!isValidAdminSession_(...)) return 'Authentication required'` **kabhi trigger hi nahi hota tha**. Koi bhi bina login kiye `curl` se `deleteAllHoardings`, `changeAdminPassword`, ya `sheetGrid` call kar sakta tha.

**Fix:** Ab sirf wahi token valid hai jo server ne login ke baad issue kiya ho:
```js
function isValidAdminSession_(token) {
  if (!token) return false;
  return !!CacheService.getScriptCache().get('session:' + String(token));
}
```

**Ek aur baat jo audit ke dauraan mili:** kai handlers ka **apna koi auth check tha hi nahi** — `previewExcelImport`, `approveExcelImport`, `dumpImage`, `syncDrivePhotos`, `batchUpdateSheet`, `getSheetGrid`, `getStaffUploads`. Sirf upar wala function theek karne se ye phir bhi khule rehte. Isliye `doPost`/`doGet` me **central gate** add kiya (`POST_ADMIN_ACTIONS` / `GET_ADMIN_ACTIONS`) — ab koi bhi naya admin action galti se bina protection ke nahi reh sakta.

---

## 🔴 2. Frontend ka `localStorage` Bypass

`secureApi.js` me:
```js
localStorage.getItem('isAdminAuthenticated') === 'true' ? 'session-local-admin' : ''
```
Console me ek line likh ke dashboard khul jaata tha. Ab ye flag **na likha jaata hai na padha jaata hai** — sirf asli server token chalta hai.

Saath me:
- `loginAdmin` ab apne aap `adm_<timestamp>` jaisa nakli token nahi banata (wo waise bhi har API call pe reject hota)
- `HoardingDetail.jsx` bhi usi spoofable flag se `isAdmin` nikaal raha tha — ab `getAdminSession()` use karta hai

**2 naye tests** add kiye jo confirm karte hain ki nakli flag se session nahi banta.

---

## 🟠 3. Staff Upload Token

**Backend:** `isValidStaffToken_()` bhi literally `return true;` tha. Ab `ADH_STAFF_TOKEN` se constant-time compare hota hai.

**Purana default token literally `'staff-token'` tha** — guess karna trivial. Ab `getStaffLinkToken_` pehli baar pe **random 64-char token** auto-generate karta hai. Leak ho jaaye to `rotateStaffToken()` chala ke revoke kar sakte ho.

**Frontend:** `postStaffPhoto` ab nakli `'staff-session'` fallback nahi bhejta, aur `/staff/upload` bina token ke **"Access Link Required"** screen dikhata hai.

**Staff ka experience nahi badla** — token URL se aake device pe save ho jaata hai, ek hi baar link kholna padta hai.

---

## 🟠 4. API Keys — Source se Nikal Di

Repo private hai, par **Vercel site public hai** — bundle se key nikaalna abhi bhi trivial tha. Ab:
- Hardcoded keys `geminiService.js` / `groqService.js` se **hata di** (Gemini wali array-join se obfuscated thi, jisse GitHub ka secret-scanning bypass ho jaata tha)
- Ab `.env.local` (local) ya Vercel env vars (production) se aati hain
- `.env.example` template tracked hai, `.env.local` gitignored
- `.gitignore` me `.env*` rule add kiya (pehle **bilkul nahi tha**)

**Purana test** sirf `getGroqApiKey()` null check karta tha. Naya test **source files ko scan** karta hai — agar koi dobara key paste karega to test fail hoga, obfuscated form me bhi.

> ⚠️ **Aapko ek kaam karna hai:** Vercel dashboard → Settings → Environment Variables me `VITE_GEMINI_API_KEY_1`, `VITE_GEMINI_API_KEY_2`, `VITE_GROQ_API_KEY` add karo, warna production me AI features band ho jaayenge. Values `.env.local` me maujood hain.

---

## 🟡 5. `disableInspect` — Ab Sirf Admin/Staff Pages Pe

Pehle har page pe right-click block tha. **Public site pe ye customers ko rok raha tha** — hoarding photo save nahi kar paate the, address copy nahi kar paate the.

Ab sirf `/admin` aur `/staff` pe active hai (Electron hash-routing aur Capacitor staff mode bhi handle karta hai). Har visitor ke console me jaane wala `"Stop!"` message bhi hata diya.

Note file me likh diya hai ki **ye security nahi hai** — bundle waise bhi public hai, asli protection backend session checks hain.

---

## 🟡 6. Dead Code Hataya

| File | Lines |
|---|---|
| `src/components/ProposalBuilder.jsx` | 346 |
| `src/components/LoadingSkeleton.jsx` | 112 |
| `importData.js` | ~90 |
| `public/hoardings.json` | 151 KB |

**`QuickKpiCards.jsx` rakha hai** — aapne abhi fix kiya tha, lagta hai dashboard me lagana chahte ho.

---

## 🧪 Verification

| Check | Result |
|---|---|
| `npm run build` | ✅ 7.26s |
| `npx vitest run` | ✅ **46/46 pass** (42 → 46, 4 naye security tests) |
| `npx eslint .` | ✅ 0 errors (79 warnings) |
| `verify-architecture.js` | ✅ Pass |
| Keys in `src/` | ✅ **None** |
| Keys in bundle (bina `.env.local`) | ✅ **None** |

---

## 📋 Aapke Liye 3 Kaam

1. **Apps Script deploy karo** (`npm run script:push`) — warna backend fixes active nahi honge
2. **Vercel me env vars set karo** — warna AI features production me band
3. **Deploy ke baad logout/login** — purane tokens invalid hain

---

## 🔵 Jo Baaki Hai (aapne kaha tha alag se karenge)

- **`AdminDashboard.jsx`** — 10,348 lines / 1,075 KB chunk. Tab-by-tab split, 1-2 din.
- **Sheet Editor ke adhoore features** — `findNext`, `replaceAllMatches`, `handleColResizeStart`, `pasteCutBuffer` ka logic likha hai, bas UI wiring baaki. Har ek ~30-60 min.
- **79 ESLint warnings** — zyadatar unused vars, koi bug nahi.
