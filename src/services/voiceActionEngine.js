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

  return {
    action: 'FILTER_INVENTORY',
    search: dimensions ? dimensions : (siteQueryExtract(text) || text),
    city,
    dimensions,
    status,
    media,
    speech: `Aapke filter ke mutabik hoardings screen par dikha diye hain.`
  };
};

const siteQueryExtract = (text) => {
  const stopwords = ['dikhao', 'filter', 'karo', 'mujhe', 'chahiye', 'wale', 'wali', 'show', 'all', 'available', 'khali', 'sites', 'hoardings', 'search'];
  let clean = text;
  stopwords.forEach(w => {
    clean = clean.replace(new RegExp(`\\b${w}\\b`, 'gi'), '');
  });
  return clean.trim();
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

  // 1. Try Google Gemini first
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

    const rawResponse = await callGeminiVision(payload);
    if (rawResponse) {
      const parsed = safeJsonParse(rawResponse);
      if (parsed && parsed.action) {
        return parsed;
      }
    }
  } catch (geminiErr) {
    console.warn('Gemini voice interpreter error, falling back to Groq:', geminiErr?.message);
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
