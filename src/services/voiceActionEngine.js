/**
 * 🎙️ AI Voice Action Engine ("Jarvis" Dashboard Controller)
 * Interprets natural Hindi, Hinglish, and English voice commands
 * and maps them to structured dashboard automation actions.
 * 
 * Powered by Google Gemini 2.0/Flash with automatic fallback to Groq Llama 3.3.
 */

import { callGeminiVision, safeJsonParse } from './geminiService.js';
import { getGroqApiKey } from './groqService.js';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * 📅 Formats date helper for relative dates (e.g. today, tomorrow, next month)
 */
export const resolveRelativeDates = (startPhrase, endPhrase) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const toYmd = (date) => {
    const yStr = date.getFullYear();
    const mStr = String(date.getMonth() + 1).padStart(2, '0');
    const dStr = String(date.getDate()).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
  };

  let startDate = toYmd(now);
  // Default end date is 30 days from start
  const defaultEnd = new Date(now);
  defaultEnd.setDate(defaultEnd.getDate() + 30);
  let endDate = toYmd(defaultEnd);

  // If specific YYYY-MM-DD provided in phrase
  const dateRegex = /\b(202[4-9]-\d{2}-\d{2})\b/;
  const startMatch = String(startPhrase || '').match(dateRegex);
  if (startMatch) startDate = startMatch[1];

  const endMatch = String(endPhrase || '').match(dateRegex);
  if (endMatch) endDate = endMatch[1];

  return { startDate, endDate };
};

/**
 * ⚡ Offline Local Pattern Matcher (Ensures instant execution even without API keys or internet)
 */
export const parseOfflineVoiceCommand = (rawText = '', context = {}) => {
  const text = String(rawText || '').trim().toLowerCase();
  if (!text) return null;

  // 1. Reset Filters
  if (text.includes('reset') || text.includes('saaf karo') || text.includes('clear filter') || text.includes('hatao filter')) {
    return {
      action: 'RESET_FILTERS',
      speech: 'Filters reset kar diye hain, sabhi hoardings dikh rahe hain.'
    };
  }

  // 2. Export Commands (check before tab keywords like "campaign")
  if (text.includes('ppt') || text.includes('powerpoint') || text.includes('proposal') || (text.includes('download') && text.includes('ppt'))) {
    return {
      action: 'EXPORT_PPT',
      speech: 'Campaign PPT proposal export shuru kar diya hai.'
    };
  }
  if (text.includes('excel') || text.includes('sheet download') || text.includes('csv')) {
    return {
      action: 'EXPORT_EXCEL',
      speech: 'Excel sheet export shuru kar diya hai.'
    };
  }

  // 3. Booking Commands (match booking verb with word boundary so "bookings" doesn't falsely trigger)
  const isBookCmd = /\b(book|reserve|allot|kardo\s+book|booking\s+karo)\b/i.test(text);
  if (isBookCmd) {
    let clientName = 'Valued Client';
    const hindiClientMatch = text.match(/([a-zA-Z0-9\s]+?)\s+(?:ke\s+liye|ko|ka\s+booking)\b/i);
    const engClientMatch = text.match(/(?:for|client|party)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:at|on|site|from)|$)/i);
    if (hindiClientMatch && hindiClientMatch[1]) {
      clientName = hindiClientMatch[1].trim();
    } else if (engClientMatch && engClientMatch[1]) {
      clientName = engClientMatch[1].trim();
    }

    let siteQuery = '';
    const siteMatch = text.match(/(?:at|pe|par|site|hoarding)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:for|liye|book|from|se)|$)/i);
    if (siteMatch && siteMatch[1]) {
      siteQuery = siteMatch[1].trim();
    }

    const { startDate, endDate } = resolveRelativeDates();

    return {
      action: 'QUICK_BOOK',
      siteQuery: siteQuery || text,
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

  // 5. Tab Switches
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
  if (text.includes('analytics') || text.includes('report') || text.includes('stat') || text.includes('graph')) {
    return {
      action: 'SWITCH_TAB',
      tab: 'analytics',
      speech: 'Analytics report open kar diya hai.'
    };
  }
  if (text.includes('guide') || text.includes('help') || text.includes('madad')) {
    return {
      action: 'SWITCH_TAB',
      tab: 'guide',
      speech: 'System guide open kar diya hai.'
    };
  }

  // 6. Filtering & Searching Inventory
  let status = 'All';
  if (text.includes('available') || text.includes('khali') || text.includes('free')) status = 'Available';
  if (text.includes('booked') || text.includes('bhari') || text.includes('occupied')) status = 'Booked';

  // Dimension extraction like 40x10, 40*10, 20x10
  const dimMatch = text.match(/\b(\d{1,3}\s*[*xX×]\s*\d{1,3})\b/);
  const dimensions = dimMatch ? dimMatch[1].replace(/\s+/g, '') : null;

  // City extraction
  let city = null;
  const knownCities = ['meerut', 'delhi', 'noida', 'ghaziabad', 'hapur', 'muzaffarnagar', 'modinagar', 'dehradun'];
  for (const c of knownCities) {
    if (text.includes(c)) {
      city = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }

  // Media type extraction
  let media = null;
  if (text.includes('unipole')) media = 'Unipole';
  if (text.includes('gantry')) media = 'Gantry';
  if (text.includes('billboard') || text.includes('hoarding')) media = 'Billboard';

  const isSearchCmd = text.includes('dikhao') || text.includes('search') || text.includes('filter') ||
                      text.includes('show') || text.includes('dikhayein') || text.includes('dhoondo') ||
                      Boolean(dimensions) || Boolean(city) || status !== 'All' || Boolean(media);

  if (isSearchCmd) {
    const rawSearch = siteQueryExtract(text);
    return {
      action: 'FILTER_INVENTORY',
      search: rawSearch || dimensions || text,
      city,
      dimensions,
      status,
      media,
      speech: `Aapke filter ke mutabik hoardings screen par dikha diye hain.`
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
 * 🧠 Primary Voice Action Interpreter using Gemini AI & Groq Fallback
 */
export const interpretVoiceCommand = async (rawVoiceText, context = {}) => {
  const userText = String(rawVoiceText || '').trim();
  if (!userText) return null;

  const todayStr = new Date().toISOString().split('T')[0];

  const prompt = `You are Jarvis, the Autonomous AI Voice Copilot for an Outdoor Billboard (OOH) Advertising Dashboard.
The user speaks to you in Hindi, Hinglish, or English.
Today's Date: "${todayStr}".

Analyze the user's spoken command and generate an executable JSON action for the dashboard.

Context:
- Total Hoardings: ${context.totalSites || 300}
- Current Active Tab: "${context.activeTab || 'inventory'}"
- Known Cities: Meerut, Delhi, Noida, Ghaziabad, Hapur, Muzaffarnagar, Dehradun

Action Schemas:
1. FILTER_INVENTORY:
   { "action": "FILTER_INVENTORY", "search": "Begum Bridge", "city": "Meerut", "area": "Shastri Nagar", "dimensions": "40x10", "status": "Available" | "Booked" | "All", "media": "Unipole", "speech": "Spoken Hindi feedback" }
2. RESET_FILTERS:
   { "action": "RESET_FILTERS", "speech": "Saare filters reset kar diye hain." }
3. SWITCH_TAB:
   { "action": "SWITCH_TAB", "tab": "inventory" | "clients" | "analytics" | "guide", "speech": "Spoken feedback" }
4. QUICK_BOOK:
   { "action": "QUICK_BOOK", "siteQuery": "Begum Bridge", "clientName": "Tata Motors", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "isOverride": true|false, "overrideMode": "trim" | "replace" | "force", "speech": "Spoken feedback" }
5. EDIT_SLOT:
   { "action": "EDIT_SLOT", "siteQuery": "...", "clientName": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "speech": "Spoken feedback" }
6. SHIFT_SLOT:
   { "action": "SHIFT_SLOT", "clientName": "...", "fromSiteQuery": "...", "toSiteQuery": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "speech": "Spoken feedback" }
7. UNDO_OVERRIDE:
   { "action": "UNDO_OVERRIDE", "siteQuery": "...", "clientName": "...", "speech": "Spoken feedback" }
8. VIEW_DISPLACED:
   { "action": "VIEW_DISPLACED", "speech": "Overridden aur displaced bookings filter kar di hain." }
9. EXPORT_PPT:
   { "action": "EXPORT_PPT", "speech": "Campaign PPT proposal export shuru kar diya hai." }
10. EXPORT_EXCEL:
   { "action": "EXPORT_EXCEL", "speech": "Excel sheet export kar di hai." }
11. ANSWER_QUERY:
   { "action": "ANSWER_QUERY", "answer": "Detailed answer", "speech": "Short spoken answer in Hindi" }

User Spoken Command:
"""${userText}"""

RULES:
- Return ONLY a valid JSON object matching one of the schemas above.
- The "speech" field MUST be friendly conversational Hindi (Devanagari or Hinglish Latin), concise (10-15 words).
- If relative dates are mentioned (e.g. "next month", "15 days", "agle mahine"), calculate the exact YYYY-MM-DD dates starting from today (${todayStr}).`;

  // 1. Try Google Gemini first with fast voice timeout
  try {
    const payload = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 600
      }
    };

    const rawResponse = await Promise.race([
      callGeminiVision(payload),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini voice timeout')), 2500))
    ]);
    if (rawResponse) {
      const parsed = safeJsonParse(rawResponse);
      if (parsed && parsed.action) {
        return parsed;
      }
    }
  } catch (geminiErr) {
    console.warn('Gemini voice interpreter error, falling back to Groq/offline:', geminiErr?.message);
  }

  // 2. Try Groq Llama 3.3 Fallback
  const groqKey = getGroqApiKey();
  if (groqKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 500
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content;
        const parsed = safeJsonParse(content);
        if (parsed && parsed.action) {
          return parsed;
        }
      }
    } catch (groqErr) {
      console.warn('Groq voice interpreter fallback error:', groqErr?.message);
    }
  }

  // 3. Fallback to Local Offline Pattern Matcher
  return parseOfflineVoiceCommand(userText, context);
};

/**
 * 💬 Conversational Dialogue Engine ("Jarvis") with Turn Memory & Real-Time Action Dispatch
 * Powers full two-way natural Hindi / Hinglish / English voice calls.
 */
export const chatWithJarvis = async ({
  userText = '',
  history = [],
  hoardings = [],
  activeTab = 'inventory'
}) => {
  const text = String(userText || '').trim();
  if (!text) return { reply: "Haan ji, boliye main sun raha hoon." };

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
  if (/^(hello|hi|namaste|hey|jarvis|monika)\b/i.test(lower) && lower.length < 25) {
    return {
      reply: "Namaste! Main Jarvis hoon. Hoarding inventory, bookings ya campaigns ke liye batayein main kya karoon?",
      action: 'NONE',
      actionPayload: null,
      successCard: null
    };
  }

  // 3. Current Dashboard Context
  const totalCount = hoardings.length;
  const availCount = hoardings.filter(h => String(h.STATUS || '').toLowerCase() === 'available').length;
  const occCount = hoardings.filter(h => String(h.STATUS || '').toLowerCase() === 'occupied' || String(h.STATUS || '').toLowerCase() === 'booked').length;
  const cities = [...new Set(hoardings.map(h => h.City).filter(Boolean))].slice(0, 8);
  const sampleLocations = hoardings.slice(0, 10).map(h => h['Location '] || h.Location).filter(Boolean).slice(0, 6);

  // 4. Check Offline Local Matcher first for instant zero-latency action dispatch
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
      reply,
      action: offlineMatch.action,
      actionPayload: { ...offlineMatch, speech: reply },
      successCard
    };
  }

  // 5. Try conversational AI with Gemini or Groq
  const historyText = history.slice(-6).map(h => `${h.role === 'user' ? 'User' : 'Jarvis'}: ${h.text || h.content}`).join('\n');
  const todayStr = new Date().toISOString().split('T')[0];

  const prompt = `You are Jarvis, an ultra-intelligent, energetic, and professional AI Copilot for Heera Advertising (OOH Billboard Management).
Creator: If asked who made you, reply: "Mujhe Scallar IT Solution ke developer Kamlesh Gupta ji ne banaya hai."

DASHBOARD CONTEXT:
- Active Tab: ${activeTab}
- Total Hoardings: ${totalCount} (Available: ${availCount}, Occupied: ${occCount})
- Operating Cities: ${cities.join(', ') || 'Meerut, Delhi, Noida'}
- Sample Locations: ${sampleLocations.join(', ')}
- Today's Date: ${todayStr}

CONVERSATION HISTORY:
${historyText || 'No prior turns.'}

LATEST USER MESSAGE: "${text}"

RULES:
1. Speak in friendly, natural Hindi / Hinglish. Keep speech replies CONCISE (12-25 words), confident, and actionable.
2. If the user wants to execute an action (filter inventory, search dimensions like 40*10, switch tab, book a hoarding, see displaced bookings, export PPT), return the structured action and parameters.
3. If the user is having a conversation or asking a question (e.g. rates, inventory status, GST, greeting), give a helpful conversational answer and set action to "NONE".

Return ONLY valid JSON matching this schema:
{
  "reply": "Conversational Hindi speech to say back to user",
  "action": "FILTER_INVENTORY" | "RESET_FILTERS" | "SWITCH_TAB" | "QUICK_BOOK" | "VIEW_DISPLACED" | "EXPORT_PPT" | "EXPORT_EXCEL" | "NONE",
  "actionPayload": {
    "action": "FILTER_INVENTORY" | "...",
    "search": "...",
    "city": "...",
    "status": "Available" | "Occupied" | "All",
    "tab": "inventory" | "clients" | "sheet-editor" | "analytics" | "guide",
    "clientName": "...",
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

  // Try Gemini with fast voice timeout
  try {
    const geminiPayload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 600 }
    };
    const rawRes = await Promise.race([
      callGeminiVision(geminiPayload),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini voice timeout')), 2500))
    ]);
    if (rawRes) {
      const parsed = safeJsonParse(rawRes);
      if (parsed && (parsed.reply || parsed.action)) {
        return {
          reply: parsed.reply || parsed.actionPayload?.speech || "Theek hai, action execute kar diya hai.",
          action: parsed.action || 'NONE',
          actionPayload: { ...parsed.actionPayload, action: parsed.action, speech: parsed.reply || parsed.actionPayload?.speech },
          successCard: parsed.successCard || null
        };
      }
    }
  } catch (err) {
    console.warn("Gemini chatWithJarvis error, trying Groq/offline:", err?.message);
  }

  // Try Groq with fast timeout
  const groqKey = getGroqApiKey();
  if (groqKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 500
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
            reply: parsed.reply || parsed.actionPayload?.speech || "Theek hai, action execute ho gaya.",
            action: parsed.action || 'NONE',
            actionPayload: { ...parsed.actionPayload, action: parsed.action, speech: parsed.reply || parsed.actionPayload?.speech },
            successCard: parsed.successCard || null
          };
        }
      }
    } catch (gErr) {
      console.warn("Groq chatWithJarvis error:", gErr?.message);
    }
  }

  // Conversational response fallback
  return {
    reply: `Maine suna: "${text}". Aap hoardings search, booking ya PPT export ke liye bol sakte hain.`,
    action: 'NONE',
    actionPayload: null,
    successCard: null
  };
};

