/**
 * 🎙️ AI Voice Action Engine ("Jarvis" Dashboard Controller)
 * Interprets natural Hindi, Hinglish, and English voice commands
 * and maps them to structured dashboard automation actions.
 * 
 * Powered by Google Gemini 2.0/Flash with automatic fallback to Groq Llama 3.3.
 */

import { safeJsonParse, getGeminiApiKeys } from './geminiService.js';
import { getGroqApiKey } from './groqService.js';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * ⚡ Direct Google Gemini 3.8 Flash Engine with multi-key failover and multimodal audio support
 */
export const callGemini38Flash = async ({
  prompt,
  audioBase64 = null,
  mimeType = 'audio/webm',
  timeoutMs = 8000
}) => {
  const apiKeys = getGeminiApiKeys();
  const models = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'];

  const parts = [];
  if (audioBase64) {
    parts.push({
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audioBase64
      }
    });
  }
  parts.push({ text: prompt });

  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 600,
      responseMimeType: 'application/json'
    }
  };

  for (const model of models) {
    for (const apiKey of apiKeys) {
      if (!apiKey) continue;
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (response.ok) {
          const data = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = safeJsonParse(text);
            if (parsed) {
              return { ...parsed, modelUsed: model };
            }
          }
        } else {
          continue;
        }
      } catch (err) {
        continue;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  return null;
};

/**
 * 📅 Formats date helper for relative dates (e.g. today, tomorrow, next month)
 */
export const resolveRelativeDates = (startPhrase = '', endPhrase = '') => {
  const now = new Date();

  const toYmd = (date) => {
    const yStr = date.getFullYear();
    const mStr = String(date.getMonth() + 1).padStart(2, '0');
    const dStr = String(date.getDate()).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
  };

  let startDate = toYmd(now);
  const defaultEnd = new Date(now);
  defaultEnd.setDate(defaultEnd.getDate() + 30);
  let endDate = toYmd(defaultEnd);

  const combined = `${startPhrase} ${endPhrase}`.toLowerCase();

  // 1. Literal YYYY-MM-DD (supports 2024-2039+)
  const dateRegex = /\b(20\d{2}-\d{2}-\d{2})\b/g;
  const directMatches = combined.match(dateRegex);
  if (directMatches && directMatches.length >= 2) {
    startDate = directMatches[0];
    endDate = directMatches[1];
    return { startDate, endDate };
  } else if (directMatches && directMatches.length === 1) {
    startDate = directMatches[0];
    const sDateObj = new Date(startDate);
    sDateObj.setDate(sDateObj.getDate() + 30);
    endDate = toYmd(sDateObj);
    return { startDate, endDate };
  }

  // 2. Month name mappings (English & Hinglish)
  const monthMap = {
    jan: 0, january: 0, janvari: 0,
    feb: 1, february: 1, farvari: 1,
    mar: 2, march: 2,
    apr: 3, april: 3, aprail: 3,
    may: 4, mai: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7, agast: 7,
    sep: 8, sept: 8, september: 8, sitambar: 8,
    oct: 9, october: 9, aktubar: 9,
    nov: 10, november: 10, navambar: 10,
    dec: 11, december: 11, disambar: 11
  };

  const monthPattern = /(?:(\d{1,2})\s+)?(jan(?:uary|vari)?|feb(?:ruary|vari)?|mar(?:ch)?|apr(?:il|ail)?|may|mai|jun(?:e)?|jul(?:y)?|aug(?:ust|ast)?|sep(?:t(?:ember)?|itambar)?|oct(?:ober)?|aktubar|nov(?:ember|ambar)?|dec(?:ember|isambar)?)(?:\s+(\d{4}))?/gi;
  const monthMatches = [...combined.matchAll(monthPattern)];

  if (monthMatches.length >= 2) {
    const m1 = monthMatches[0];
    const m2 = monthMatches[1];

    const d1 = parseInt(m1[1] || '1', 10);
    const mon1 = monthMap[m1[2].toLowerCase()];
    const yr1 = parseInt(m1[3] || String(now.getFullYear()), 10);

    const d2 = parseInt(m2[1] || '30', 10);
    const mon2 = monthMap[m2[2].toLowerCase()];
    const yr2 = parseInt(m2[3] || String(yr1), 10);

    startDate = toYmd(new Date(yr1, mon1, d1));
    endDate = toYmd(new Date(yr2, mon2, d2));
    return { startDate, endDate };
  } else if (monthMatches.length === 1) {
    const m = monthMatches[0];
    const d = parseInt(m[1] || '1', 10);
    const mon = monthMap[m[2].toLowerCase()];
    const yr = parseInt(m[3] || String(now.getFullYear()), 10);

    const s = new Date(yr, mon, d);
    const e = new Date(yr, mon + 1, 0);
    startDate = toYmd(s);
    endDate = toYmd(e);
    return { startDate, endDate };
  }

  // 3. "agle mahine" / "next month"
  if (combined.includes('agle mahine') || combined.includes('next month')) {
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    return { startDate: toYmd(nextMonthStart), endDate: toYmd(nextMonthEnd) };
  }

  // 4. "15 din" / "15 days"
  const daysMatch = combined.match(/(\d+)\s*(?:din|days)\b/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    const end = new Date(now);
    end.setDate(end.getDate() + days);
    return { startDate: toYmd(now), endDate: toYmd(end) };
  }

  return { startDate, endDate };
};

/**
 * ⚡ Offline Local Pattern Matcher (Ensures instant execution even without API keys or internet)
 */
export const parseOfflineVoiceCommand = (rawText = '', _context = {}) => {
  const text = String(rawText || '').trim().toLowerCase();
  if (!text) return null;

  // Question guard: Do not hijack informational questions, rate queries, or conversational greetings!
  const isQuestion = /^(kya|kaise|kitna|kitne|kitni|kyun|kahan|kaun|batao|bataiye|rate|rates|price|cost|kharidna|madad|help|who|what|when|where|why|how)\b/i.test(text) ||
                     text.includes('?') || text.includes('kya hai') || text.includes('kaisa hai') || text.includes('kitna hai') || text.includes('rate kya');
  const hasActionVerb = /\b(dikhao|filter|saaf|reset|export|download|kholo|switch|book|allot|reserve)\b/i.test(text);

  if (isQuestion && !hasActionVerb) {
    return null; // Fall through to conversational AI / LLM!
  }

  // 1. Reset Filters
  if (text.includes('reset') || text.includes('saaf karo') || text.includes('clear filter') || text.includes('hatao filter')) {
    return {
      action: 'RESET_FILTERS',
      speech: 'Filters reset kar diye hain, sabhi hoardings dikh rahe hain.'
    };
  }

  // 2. Export Commands (guard against "import")
  if (!text.includes('import')) {
    const isPptExport = (text.includes('ppt') || text.includes('powerpoint') || text.includes('proposal')) &&
                        (text.includes('download') || text.includes('export') || text.includes('banao') || text.includes('generate'));
    if (isPptExport) {
      return {
        action: 'EXPORT_PPT',
        speech: 'Campaign PPT proposal export shuru kar diya hai.'
      };
    }
    const isExcelExport = (text.includes('excel') || text.includes('sheet download') || text.includes('csv')) &&
                          (text.includes('download') || text.includes('export') || text.includes('karo'));
    if (isExcelExport) {
      return {
        action: 'EXPORT_EXCEL',
        speech: 'Excel sheet export shuru kar diya hai.'
      };
    }
  }

  // 3. Booking Commands (match booking verb with word boundary)
  const isBookCmd = /\b(book|reserve|allot|kardo\s+book|booking\s+karo)\b/i.test(text) && !text.includes('booking list') && !text.includes('bookings dikhao');
  if (isBookCmd) {
    let clientName = 'Valued Client';
    const hindiClientMatch = text.match(/([a-zA-Z0-9\s]+?)\s+(?:ke\s+liye|ko|ka\s+booking)\b/i);
    const engClientMatch = text.match(/(?:for|client|party)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:at|on|site|from)|$)/i);
    if (hindiClientMatch && hindiClientMatch[1] && !hindiClientMatch[1].includes('agle mahine') && !hindiClientMatch[1].includes('next month')) {
      clientName = hindiClientMatch[1].trim();
    } else if (engClientMatch && engClientMatch[1] && !engClientMatch[1].includes('next month') && !engClientMatch[1].includes('agle mahine')) {
      clientName = engClientMatch[1].trim();
    }

    // Extract site without swallowing dates
    let textForSite = text
      .replace(new RegExp(`\\b${clientName}\\b`, 'gi'), '')
      .replace(/(?:ke\s+liye|for|client|party)\b/gi, '')
      .replace(/\b\d{1,2}\s+(?:jan(?:uary|vari)?|feb(?:ruary|vari)?|mar(?:ch)?|apr(?:il|ail)?|may|mai|jun(?:e)?|jul(?:y)?|aug(?:ust|ast)?|sep(?:t(?:ember)?|itambar)?|oct(?:ober)?|aktubar|nov(?:ember|ambar)?|dec(?:ember|isambar)?)(?:\s+\d{4})?\b/gi, '')
      .replace(/(?:se\s+\d{1,2}\s+[a-z]+|tak|to)\b/gi, '')
      .replace(/\b(?:agle\s+mahine|next\s+month|book|kardo|karo|override|replace|force|mode|me|pe|par|at|site|hoarding)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const { startDate, endDate } = resolveRelativeDates(text, text);

    return {
      action: 'QUICK_BOOK',
      siteQuery: textForSite || text,
      clientName,
      startDate,
      endDate,
      isOverride: text.includes('override') || text.includes('zabardasti') || text.includes('replace'),
      overrideMode: text.includes('replace') ? 'replace' : text.includes('force') ? 'force' : 'trim',
      speech: `${clientName} ke liye booking modal open kiya ja raha hai.`
    };
  }

  // 4. View Displaced / Overridden Bookings
  if (text.includes('displace') || (text.includes('overrid') && (text.includes('list') || text.includes('dikhao') || text.includes('show') || text.includes('cut') || text.includes('booking')))) {
    return {
      action: 'VIEW_DISPLACED',
      speech: 'Overridden aur displaced bookings filter kar di hain.'
    };
  }

  // 5. Inventory Searching & Filtering (MUST BE BEFORE GENERAL TAB SWITCHES)
  let status = 'All';
  if (text.includes('available') || text.includes('khali') || text.includes('free')) status = 'Available';
  if (text.includes('booked') || text.includes('bhari') || text.includes('occupied')) status = 'Booked';

  const dimMatch = text.match(/\b(\d{1,3})\s*(?:[*xX×]|by)\s*(\d{1,3})\b/i);
  const dimensions = dimMatch ? `${dimMatch[1]}x${dimMatch[2]}` : null;

  let city = null;
  const knownCities = ['meerut', 'delhi', 'noida', 'ghaziabad', 'hapur', 'muzaffarnagar', 'modinagar', 'dehradun'];
  for (const c of knownCities) {
    if (text.includes(c)) {
      city = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }

  let media = null;
  if (text.includes('unipole')) media = 'Unipole';
  if (text.includes('gantry')) media = 'Gantry';
  if (text.includes('billboard')) media = 'Billboard';

  const isExplicitSearch = text.includes('dikhao') || text.includes('search') || text.includes('filter') ||
                           text.includes('show') || text.includes('dikhayein') || text.includes('dhoondo');

  if (isExplicitSearch && (Boolean(dimensions) || Boolean(city) || status !== 'All' || Boolean(media) || text.includes('site') || text.includes('hoarding'))) {
    let cleanSearch = siteQueryExtract(text) || '';
    if (dimensions) {
      cleanSearch = cleanSearch.replace(/\b\d+\s*[*xX×byBY]\s*\d+\b/g, '').trim();
    }
    return {
      action: 'FILTER_INVENTORY',
      search: cleanSearch,
      city,
      dimensions,
      status,
      media,
      speech: `Aapke filter ke mutabik hoardings screen par dikha diye hain.`
    };
  }

  // 6. Tab Switches (ONLY AFTER FILTER CHECKS)
  if (text.includes('client') || text.includes('campaign') || text.includes('grahak') || text.includes('booking list')) {
    return {
      action: 'SWITCH_TAB',
      tab: 'clients',
      speech: 'Client campaigns tab open kar diya hai.'
    };
  }
  if (text.includes('inventory') || text.includes('saari site') || text.includes('all site') || text.includes('hoarding list')) {
    return {
      action: 'SWITCH_TAB',
      tab: 'inventory',
      speech: 'Inventory view open kar diya hai.'
    };
  }
  if (text.includes('dashboard') || text.includes('analytics') || text.includes('report') || text.includes('stat') || text.includes('graph')) {
    return {
      action: 'SWITCH_TAB',
      tab: 'dashboard',
      speech: 'Dashboard report open kar diya hai.'
    };
  }
  if (text.includes('guide') || (text.includes('help') && text.includes('tab')) || (text.includes('madad') && text.includes('tab'))) {
    return {
      action: 'SWITCH_TAB',
      tab: 'guide',
      speech: 'System guide open kar diya hai.'
    };
  }

  return null;
};

const siteQueryExtract = (text) => {
  const stopwords = ['dikhao', 'filter', 'karo', 'mujhe', 'chahiye', 'wale', 'wali', 'show', 'all', 'available', 'khali', 'sites', 'hoardings', 'search', 'ke', 'ka', 'ki', 'pe', 'par', 'hain'];
  let clean = text;
  clean = clean.replace(/\b\d{1,3}\s*[*xX×]\s*\d{1,3}\b/g, '');
  stopwords.forEach(w => {
    clean = clean.replace(new RegExp(`\\b${w}\\b`, 'gi'), '');
  });
  return clean.replace(/\s+/g, ' ').trim();
};




/**
 * 💬 Conversational Dialogue Engine ("Jarvis") with Turn Memory & Real-Time Action Dispatch
 * Powers full two-way natural Hindi / Hinglish / English voice calls.
 */
export const chatWithJarvis = async ({
  userText = '',
  audioBase64 = null,
  mimeType = 'audio/webm',
  history = [],
  hoardings = [],
  activeTab = 'inventory'
}) => {
  const text = String(userText || '').trim();
  if (!text && !audioBase64) return { reply: "Haan ji, boliye main sun raha hoon." };

  const lower = text.toLowerCase();

  // 1. Instant response for creator identity
  if (lower.includes('kisne banaya') || lower.includes('who made you') || lower.includes('creator') || lower.includes('developer')) {
    return {
      reply: "Mujhe Scallar IT Solution ke developer Kamlesh Gupta ji ne banaya hai.",
      action: 'ANSWER_QUERY',
      actionPayload: { action: 'ANSWER_QUERY', speech: "Mujhe Scallar IT Solution ke developer Kamlesh Gupta ji ne banaya hai." },
      successCard: {
        title: "Developer Info",
        items: [
          { label: "Creator", value: "Kamlesh Gupta" },
          { label: "Company", value: "Scallar IT Solution" }
        ]
      }
    };
  }

  // 2. Greetings
  if (/^(hello|hi|namaste|hey|jarvis)\b/i.test(lower) && lower.length < 25) {
    return {
      reply: "Namaste! Main Jarvis hoon. Hoarding inventory, bookings ya campaigns ke liye batayein main kya karoon?",
      action: 'NONE',
      actionPayload: null,
      successCard: null
    };
  }

  // 3. Current Dashboard Context
  const totalCount = hoardings.length;
  const availCount = hoardings.filter(h => {
    const st = String(h.STATUS || h.Status || '').trim().toLowerCase();
    return st === 'available';
  }).length;
  const occCount = Math.max(0, totalCount - availCount);
  const cities = [...new Set(hoardings.map(h => h.City).filter(Boolean))].slice(0, 8);
  const sampleLocations = hoardings.slice(0, 10).map(h => h['Location '] || h.Location).filter(Boolean).slice(0, 6);

  // 4. Check Offline Local Matcher first for instant zero-latency text action dispatch
  if (text) {
    const offlineMatch = parseOfflineVoiceCommand(text, { activeTab });
    if (offlineMatch && offlineMatch.action) {
      let successCard = null;
      let reply = offlineMatch.speech || "Action execute kar diya hai.";
      if (offlineMatch.action === 'QUICK_BOOK') {
        successCard = {
          title: "Booking Form Opened!",
          items: [
            { label: "Client", value: offlineMatch.clientName || "Valued Client" },
            { label: "Site", value: offlineMatch.siteQuery || "Selected Hoarding" },
            { label: "Mode", value: offlineMatch.isOverride ? `Override (${offlineMatch.overrideMode})` : "Standard" }
          ]
        };
      } else if (offlineMatch.action === 'FILTER_INVENTORY') {
        const parts = [];
        if (offlineMatch.search && offlineMatch.search !== 'All') parts.push(offlineMatch.search);
        if (offlineMatch.dimensions) parts.push(offlineMatch.dimensions);
        if (offlineMatch.city) parts.push(offlineMatch.city);
        reply = `${parts.join(' ') || 'Inventory'} hoardings screen par filter kar diye hain.`;
        successCard = {
          title: "Inventory Filtered!",
          items: [
            { label: "Search", value: offlineMatch.search || "All" },
            { label: "Status", value: offlineMatch.status || "All" },
            { label: "Size", value: offlineMatch.dimensions || "All Sizes" }
          ]
        };
      } else if (offlineMatch.action === 'VIEW_DISPLACED') {
        successCard = {
          title: "Displaced Slots Loaded!",
          items: [
            { label: "Tab", value: "Clients & Booking" },
            { label: "Filter", value: "Overridden / Displaced" }
          ]
        };
      } else if (offlineMatch.action === 'RESET_FILTERS') {
        successCard = {
          title: "Filters Cleared",
          items: [
            { label: "Display", value: "All Hoardings" }
          ]
        };
      } else if (offlineMatch.action === 'SWITCH_TAB') {
        successCard = {
          title: "Tab Switched",
          items: [
            { label: "Current View", value: offlineMatch.tab }
          ]
        };
      } else if (offlineMatch.action === 'EXPORT_PPT') {
        successCard = {
          title: "PPT Proposal",
          items: [
            { label: "Status", value: "Exporting" }
          ]
        };
      } else if (offlineMatch.action === 'EXPORT_EXCEL') {
        successCard = {
          title: "Excel Export",
          items: [
            { label: "Status", value: "Downloading" }
          ]
        };
      }

      return {
        transcript: text,
        reply,
        action: offlineMatch.action,
        actionPayload: { ...offlineMatch, speech: reply },
        successCard
      };
    }
  }

  // 5. ⚡ Google Gemini 3.8 Flash (Text & Multimodal Audio)
  const historyText = history.slice(-6).map(h => `${h.role === 'user' ? 'User' : 'Jarvis'}: ${h.text || h.content}`).join('\n');
  const todayStr = new Date().toISOString().split('T')[0];

  const prompt = `You are Jarvis, the ultra-intelligent, energetic, and professional AI Voice Copilot for Heera Advertising (OOH Billboard Management).
Creator: If asked who made you, reply: "Mujhe Scallar IT Solution ke developer Kamlesh Gupta ji ne banaya hai."

DASHBOARD CONTEXT:
- Active Tab: ${activeTab}
- Total Hoardings: ${totalCount} (Available: ${availCount}, Occupied: ${occCount})
- Operating Cities: ${cities.join(', ') || 'Meerut, Delhi, Noida'}
- Sample Locations: ${sampleLocations.join(', ')}
- Today's Date: ${todayStr}

CONVERSATION HISTORY:
${historyText || 'No prior turns.'}

${audioBase64 ? 'USER SPOKE VIA MICROPHONE (Audio attached). Listen to what the user said, transcribe it into "transcript", formulate your friendly reply, and execute any requested dashboard action.' : `LATEST USER MESSAGE: "${text}"`}

RULES:
1. Speak in friendly, natural Hindi / Hinglish. Keep speech replies CONCISE (12-25 words), confident, and actionable.
2. If the user wants to execute an action (filter inventory, search dimensions like 40*10, switch tab, book a hoarding, see displaced bookings, export PPT), return the structured action and parameters.
Allowed actions:
- FILTER_INVENTORY: { search: string, city: string, locality: string, status: "Available"|"Booked"|"All", dimensions: string }
- RESET_FILTERS: {}
- SWITCH_TAB: { tab: "dashboard"|"inventory"|"clients"|"sheet-editor"|"staff-review"|"guide" }
- QUICK_BOOK: { siteQuery: string, clientName: string, startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", isOverride: boolean, overrideMode: "trim"|"replace" }
- VIEW_DISPLACED: {}
- EXPORT_PPT: {}
- EXPORT_EXCEL: {}
- NONE: {}
3. If the user is having a conversation or asking a question (e.g. rates, inventory status, GST, greeting), give a helpful conversational answer and set action to "NONE".

Return ONLY valid JSON matching this schema:
{
  "transcript": "What user said",
  "reply": "Conversational Hindi speech to say back to user",
  "action": "FILTER_INVENTORY" | "RESET_FILTERS" | "SWITCH_TAB" | "QUICK_BOOK" | "VIEW_DISPLACED" | "EXPORT_PPT" | "EXPORT_EXCEL" | "NONE",
  "actionPayload": {
    "action": "FILTER_INVENTORY" | "RESET_FILTERS" | "SWITCH_TAB" | "QUICK_BOOK" | "VIEW_DISPLACED" | "EXPORT_PPT" | "EXPORT_EXCEL" | "NONE",
    "search": "...",
    "city": "...",
    "locality": "...",
    "status": "Available" | "Occupied" | "All",
    "tab": "dashboard" | "inventory" | "clients" | "sheet-editor" | "guide",
    "clientName": "...",
    "siteQuery": "...",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "isOverride": false,
    "overrideMode": "trim" | "replace",
    "speech": "..."
  },
  "successCard": {
    "title": "Action Title",
    "items": [
      { "label": "Key", "value": "Val" }
    ]
  }
}`;

  // Try Google Gemini 3.8 Flash
  try {
    const geminiRes = await callGemini38Flash({
      prompt,
      audioBase64,
      mimeType,
      timeoutMs: 8000
    });

    if (geminiRes && (geminiRes.reply || geminiRes.action)) {
      const reply = geminiRes.reply || geminiRes.actionPayload?.speech || "Theek hai, action execute kar diya hai.";
      const action = geminiRes.action || 'NONE';
      const actionPayload = geminiRes.actionPayload
        ? { ...geminiRes.actionPayload, action, speech: reply }
        : null;

      return {
        transcript: geminiRes.transcript || text,
        reply,
        action,
        actionPayload,
        successCard: geminiRes.successCard || null,
        modelUsed: geminiRes.modelUsed || 'gemini-3.8-flash'
      };
    }
  } catch (err) {
    console.warn("Gemini 3.8 Flash chatWithJarvis notice:", err?.message);
  }

  // Fallback to Groq with ultra-fast 8b instant model
  const groqKey = getGroqApiKey();
  if (groqKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 500,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content;
        const parsed = safeJsonParse(content);
        if (parsed && (parsed.reply || parsed.action)) {
          return {
            transcript: parsed.transcript || text,
            reply: parsed.reply || parsed.actionPayload?.speech || "Theek hai, action execute ho gaya.",
            action: parsed.action || 'NONE',
            actionPayload: { ...parsed.actionPayload, action: parsed.action, speech: parsed.reply || parsed.actionPayload?.speech },
            successCard: parsed.successCard || null,
            modelUsed: 'llama-3.1-8b-instant'
          };
        }
      }
    } catch (gErr) {
      console.warn("Groq chatWithJarvis notice:", gErr?.message);
    }
  }

  // Conversational response fallback
  return {
    transcript: text,
    reply: `Maine suna: "${text}". Aap hoardings search, booking ya PPT export ke liye bol sakte hain.`,
    action: 'NONE',
    actionPayload: null,
    successCard: null,
    modelUsed: 'fallback'
  };
};

