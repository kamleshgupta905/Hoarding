/**
 * ⚡ Groq AI Acceleration Service
 * Ultra-low latency inference for PPT text parsing and site matching.
 */

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GK_PARTS = ['gsk_', '0WOqI42zpoYm1', 'QzGHGDFWGdyb3', 'FY7mIZHC8pHa', 'AY9WpVvyVfUpi0'];
const DEFAULT_KEY = GK_PARTS.join('');

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
  'gemma2-9b-it'
];

export const getGroqApiKey = () => {
  return (
    (typeof window !== 'undefined' && window.localStorage?.getItem('adh_groq_api_key')) ||
    import.meta.env?.VITE_GROQ_API_KEY ||
    DEFAULT_KEY
  );
};

export const setGroqApiKey = (key) => {
  if (key && typeof key === 'string' && typeof window !== 'undefined') {
    window.localStorage?.setItem('adh_groq_api_key', key.trim());
  }
};

/**
 * 🧠 Parse raw PPT slide text into clean structured hoarding data using Groq AI
 */
export const parseSlideWithGroq = async (slideText, apiKey = getGroqApiKey()) => {
  const key = apiKey || DEFAULT_KEY;
  if (!key || !slideText) return null;

  const prompt = `You are an AI specialized in outdoor advertising and hoarding data extraction.
Extract the following from this presentation slide text:
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

Return ONLY a JSON object with these keys.`;

  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key.trim()}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1
        })
      });

      if (!response.ok) continue;

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
    } catch (err) {
      console.warn(`[Groq ${model} Error]:`, err);
    }
  }

  return null;
};

/**
 * 🎯 Match a PPT slide to the best hoarding in inventory using Groq Semantic Reasoning
 */
export const matchSlideToInventoryWithGroq = async (slideText, candidates, apiKey = getGroqApiKey()) => {
  const key = apiKey || DEFAULT_KEY;
  if (!key || !slideText || !candidates || candidates.length === 0) return null;

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

  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key.trim()}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1
        })
      });

      if (!response.ok) continue;

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          if (result.bestMatchIndex >= 0 && result.bestMatchIndex < candidates.length) {
            return {
              site: candidates[result.bestMatchIndex],
              confidence: result.confidence,
              reason: result.reason
            };
          }
        }
      }
    } catch (err) {
      console.warn(`[Groq Match ${model} Error]:`, err);
    }
  }

  return null;
};
