# 🚀 Deploy Steps — Security Fixes Live Karne Ke Liye

Do kaam karne hain. Dono ke bina fixes active nahi honge.

---

## 1️⃣ Vercel Environment Variables

### Kya karna hai
Vercel dashboard kholo → apna project (`hoarding-hd9a`) → **Settings** → **Environment Variables** → teen variables add karo:

| Name | Value |
|---|---|
| `VITE_GROQ_API_KEY` | `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` |
| `VITE_GEMINI_API_KEY_1` | `AQ.Ab8RN6IR8j97v_TwvrhH8cB-HXI2y6-XDmPD6fjpsPHFUI1v-g` |
| `VITE_GEMINI_API_KEY_2` | `AQ.Ab8RN6KKCBjZXkMCVP50IXHFI_oeqS88iQoSJ7wHw_fAtCc1JQ` |

Har ek ke liye **Production, Preview, Development** teeno checkbox tick karna.

**Add karne ke baad ek naya deployment trigger karna padega** — env vars purane build me automatically nahi jaate. Deployments tab → latest deployment ke `...` menu → **Redeploy**.

### Verify kaise karein
Redeploy ke baad site kholo → Admin Dashboard → koi AI feature chalao (PPT import ya daily photo match). Agar chal gaya to keys sahi lagi hain.

### CLI se karna ho to
```bash
npx vercel login
npx vercel link
npx vercel env add VITE_GROQ_API_KEY production
# (value paste karo jab poochhe)
npx vercel --prod
```

> Maine ye khud nahi kar paaya kyunki is sandbox me aapka Vercel account logged-in nahi hai
> (koi `VERCEL_TOKEN` ya `~/.vercel` credentials nahi the). GitHub ka access tha isliye
> code push kar diya, par Vercel ka nahi.

---

## 2️⃣ Google Apps Script Deploy

### File kahan hai
Do jagah same code hai (dono ab identical hain):
- **`GOOGLE_APPS_SCRIPT_FINAL.js`** — repo root me (main reference)
- **`google_apps_script/Code.gs`** — ye wala push script actually deploy karta hai

> ⚠️ **Ek baat jo maine pakdi:** `Code.gs` purana version tha jisme security bug abhi bhi tha,
> aur `scripts/appscript-sync.js` **usi ko prefer karta hai**. Agar aap bina dhyan diye
> `npm run script:push` chalate, to purana asurakshit backend dobara deploy ho jaata aur
> saare auth fixes chup-chaap chale jaate. Maine dono files sync kar di hain.

### Option A — Manual (sabse aasaan, recommend karta hoon)

1. Apna Apps Script project kholo: https://script.google.com → apna project
2. Left sidebar me **`Code.gs`** pe click karo
3. Editor me **saara purana code select karo** (Ctrl+A) aur delete karo
4. Repo se `GOOGLE_APPS_SCRIPT_FINAL.js` ka **pura content copy** karke paste karo
5. **Save** (Ctrl+S)
6. Upar right me **Deploy** → **Manage deployments**
7. Existing deployment ke saamne **pencil (Edit)** icon pe click karo
8. **Version** dropdown → **New version** select karo
9. **Deploy** dabao

> **Important:** "New deployment" mat banana — usse **URL badal jaayega** aur app ka
> `APPS_SCRIPT_URL` toot jaayega. Hamesha existing deployment ko **Edit** karke
> new version deploy karna.

### Option B — CLI se
```bash
npm run script:push
```
Ye tabhi chalega jab Google OAuth setup ho (`credentials.json` + `token.json`).
Abhi wo files repo me nahi hain, isliye pehle:
```bash
npm run google:connect
```

---

## 3️⃣ Deploy Ke Baad — Zaroori

### Logout / Login karo
Purane session tokens ab **invalid** hain (kyunki backend ab properly validate karta hai).
Dashboard me ho to logout karo, phir dobara login karo.

Agar dashboard atak jaaye to browser console me:
```js
localStorage.clear(); sessionStorage.clear(); location.reload();
```

### Staff link dobara bhejo
Purana staff token (`'staff-token'`) ab kaam nahi karega. Naya lene ke liye:
1. Admin Dashboard me login karo
2. Staff upload link generate karo (jahan pehle karte the)
3. Naya link staff ko WhatsApp pe bhejo — wo ek baar kholenge, device yaad rakh lega

### Admin credentials set hain na?
Agar `ADH_ADMIN_ID` / `ADH_ADMIN_HASH` set nahi hain to login fail hoga
("Admin security is not configured"). Apps Script editor me ek baar chalao:
```js
setAdminCredentials('your-admin-id', 'your-password')
```

---

## ✅ Sab Theek Hai Ya Nahi — Check List

| Test | Expected |
|---|---|
| Bina login `/admin/dashboard` kholo | Login page pe redirect ho |
| Console me `localStorage.isAdminAuthenticated='true'` → reload | **Phir bhi login maange** (pehle ghus jaata tha) |
| Sahi ID/password se login | Dashboard khule |
| `/staff/upload` bina token kholo | "Access Link Required" screen |
| Token wala staff link kholo | Camera khule |
| Public page pe right-click | **Kaam kare** (pehle block tha) |
| Admin page pe right-click | Block rahe |
| AI feature chalao | Kaam kare (env vars set hone ke baad) |
