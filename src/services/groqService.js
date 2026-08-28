/**
 * ⚡ Groq AI Acceleration Service
 * Ultra-low latency LLM inference (500+ tokens/sec) for PPT text parsing and site matching.
 */

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

export const getGroqApiKey = () => {
  return (
    import.meta.env?.VITE_GROQ_API_KEY ||
    localStorage.getItem('adh_groq_api_key') ||
    sessionStorage.getItem('adh_groq_api_key') ||
    ''
  );
};

export const setGroqApiKey = (key) => {
  if (key && typeof key === 'string') {
    localStorage.setItem('adh_groq_api_key', key.trim());
  }
};

/**
 * 🧠 Parse raw PPT slide text into clean structured hoarding data using Groq Llama-3
 */
export const parseSlideWithGroq = async (slideText, apiKey = getGroqApiKey()) => {
  if (!apiKey || !slideText) return null;

  try {
    const prompt = `You are an AI assistant specialized in outdoor advertising and hoardings data extraction.
Extract the following information from this presentation slide text:
1. "latitude": number or null (e.g. 28.998107)
2. "longitude": number or null (e.g. 77.705821)
3. "city": string (e.g. "Meerut")
4. "location": string (the exact landmark/junction/building, e.g. "Begum Bridge Metro Station")
5. "facing": string (e.g. "Modipuram", "Zero Mile", "Delhi Road")
6. "mediaType": string (e.g. "Unipole", "Billboard", "Gantry")
7. "width": number or null (in ft)
8. "height": number or null (in ft)

Slide Text:
"""
${slideText}
"""

Return ONLY a valid JSON object with these keys. No other text or markdown fences.`;

    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      console.warn(`[Groq API Error] ${response.status}: ${await response.text()}`);
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content) {
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('[Groq Parsing Failed]:', err);
  }
  return null;
};

/**
 * 🎯 Match a PPT slide to the best hoarding in inventory using Groq Semantic Reasoning
 */
export const matchSlideToInventoryWithGroq = async (slideText, candidates, apiKey = getGroqApiKey()) => {
  if (!apiKey || !slideText || !candidates || candidates.length === 0) return null;

  try {
    const prompt = `Match the outdoor hoarding described in the PPT Slide to the best candidate from the inventory database.

PPT Slide Text:
"""
${slideText}
"""

Candidate Inventory Sites:
${JSON.stringify(candidates.map((c, i) => ({
  index: i,
  siteId: c._SiteID,
  location: c.Location || c['Location '] || c['Locality Site Location'],
  facing: c.Facing,
  lat: c.Latitude || c['Lat.'],
  lng: c.Longitude || c['Long.'],
  city: c.City
})), null, 2)}

Return a JSON object:
{
  "bestMatchIndex": number (or -1 if none match),
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reason": "short explanation"
}`;

    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content) {
      const result = JSON.parse(content);
      if (result.bestMatchIndex >= 0 && result.bestMatchIndex < candidates.length) {
        return {
          site: candidates[result.bestMatchIndex],
          confidence: result.confidence,
          reason: result.reason
        };
      }
    }
  } catch (err) {
    console.warn('[Groq Matching Error]:', err);
  }
  return null;
};
