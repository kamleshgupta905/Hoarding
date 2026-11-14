import { postDirect } from './secureApi.js';

/**
 * Gemini Vision & Multimodal Analysis Client Service
 * All Gemini requests are executed server-side via /api/gemini/generate and /api/gemini/stream.
 */

export const GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-4-hydrogen'
];

const resolveGeminiEndpoint = (routePath) => {
  if (typeof window === 'undefined') return routePath;
  const protocol = window.location?.protocol || '';
  if (protocol === 'http:' || protocol === 'https:') {
    return routePath;
  }
  const configuredBase = import.meta.env?.VITE_SERVER_URL || 'https://hoarding-hd9a.vercel.app';
  return `${configuredBase.replace(/\/+$/, '')}${routePath}`;
};

/**
 * Strips data URL prefix to extract raw base64 and mime type.
 */
export const parseBase64 = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return { mimeType: 'image/jpeg', base64: dataUrl };
};

/**
 * Robust JSON parse handling unescaped control characters in model responses
 */
export const safeJsonParse = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleanJson = rawText.replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    // eslint-disable-next-line no-control-regex
    const sanitized = jsonMatch[0].replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => {
      if (c === '\n') return '\\n';
      if (c === '\r') return '\\r';
      if (c === '\t') return '\\t';
      return '';
    });
    try {
      return JSON.parse(sanitized);
    } catch {
      return null;
    }
  }
};

/**
 * Execute Gemini Vision API call through the application server (/api/gemini/generate).
 */
export const callGeminiVision = async (payload) => {
  const endpoint = resolveGeminiEndpoint('/api/gemini/generate');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  let serverError = null;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: payload?.model || GEMINI_MODELS[0],
        contents: payload?.contents,
        config: payload?.config || payload?.generationConfig
      }),
      signal: controller.signal
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (!response.ok) {
        const msg = data?.error || `Server Gemini request failed (${response.status})`;
        if (response.status >= 400 && response.status < 500 && response.status !== 404) {
          throw Object.assign(new Error(msg), { isClientRequestError: true });
        }
        throw new Error(msg);
      }
      if (data?.text && String(data.text).trim()) {
        return String(data.text).trim();
      }
      throw new Error('Empty response returned from Gemini server endpoint.');
    }

    if (!response.ok) {
      serverError = new Error(`Server Gemini endpoint returned ${response.status}`);
    } else {
      serverError = new Error('Server Gemini endpoint returned non-JSON response (static host rewrite).');
    }
  } catch (err) {
    serverError = err;
    if (err?.isClientRequestError) {
      throw err;
    }
  } finally {
    clearTimeout(timeoutId);
  }

  // Fallback to Apps Script backend proxy when running on static host (e.g. Vercel without env) / file:// / offline
  try {
    const proxyRes = await postDirect({
      action: 'geminiVision',
      payload,
      model: 'gemini-2.5-flash'
    }, 20000);

    if (proxyRes && proxyRes.success && proxyRes.text) {
      const parsedData = typeof proxyRes.text === 'string' ? JSON.parse(proxyRes.text) : proxyRes.text;
      const parts = parsedData?.candidates?.[0]?.content?.parts || [];
      const text = parts.map(p => p.text || '').filter(Boolean).join('\n').trim();
      if (text) return text;
    }
  } catch (proxyErr) {
    console.warn('[Gemini Backend Proxy Notice]:', proxyErr.message || proxyErr);
  }

  throw serverError || new Error('Gemini service failed to respond.');
};

/**
 * Execute streaming Gemini request via server SSE endpoint (/api/gemini/stream).
 */
export const callGeminiStream = async (payload, onChunk) => {
  const endpoint = resolveGeminiEndpoint('/api/gemini/stream');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: payload?.model || GEMINI_MODELS[0],
      contents: payload?.contents,
      config: payload?.config || payload?.generationConfig
    })
  });

  if (!response.ok || !response.body) {
    const errBody = await response.text().catch(() => '');
    throw new Error(errBody || `Gemini stream request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      if (dataStr === '[DONE]') return fullText;
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) {
          fullText += parsed.text;
          if (typeof onChunk === 'function') onChunk(parsed.text, fullText);
        }
      } catch (e) {
        if (e?.message && !/JSON/i.test(e.message)) throw e;
      }
    }
  }

  return fullText;
};

/**
 * 🎯 GEOFENCED 50M HOARDING MATCHING
 * Given a captured photo and a small list of candidate hoardings within 50m-75m,
 * uses Gemini Vision to determine the exact hoarding, facing direction, and Occupied/Available status.
 */
export const matchGeofencedHoardingWithGemini = async (imageBase64, candidates) => {
  if (!imageBase64 || !Array.isArray(candidates) || candidates.length === 0) {
    return {
      matchedSiteName: null,
      matchedIndex: -1,
      status: 'Available',
      confidence: 0,
      reasoning: 'No candidates provided for geofenced matching.'
    };
  }

  const parsed = parseBase64(imageBase64);
  if (!parsed) {
    throw new Error('Invalid image base64 data.');
  }

  // Format candidate list concisely for the prompt
  const candidateListText = candidates.map((c, index) => {
    const name = c["Location "] || c["Locality Site Location"] || c.Location || c.siteName || `Site #${index}`;
    const area = c.Area || c.Locality || '';
    const city = c.City || '';
    const traffic = [c["Traffic From"], c["Traffic To"]].filter(Boolean).join(' to ');
    const media = c["Media Format (Front Lit / Back Lit / Non Lit)"] || c.Media || '';
    const dist = typeof c.distanceM === 'number' ? ` (~${Math.round(c.distanceM)}m away)` : '';
    return `[Index ${index}]: Location: "${name}", Area: "${area}", City: "${city}", Traffic/Facing: "${traffic}", Media: "${media}"${dist}`;
  }).join('\n');

  const prompt = `
You are an expert AI Vision Analyst for outdoor billboard advertising.
A field staff just took a live photo of a billboard at a verified GPS location.
Below is the list of known hoarding sites within a 50-meter radius of this exact GPS coordinate:

CANDIDATE HOARDING SITES (Within 50m):
${candidateListText}

TASK:
1. Inspect the uploaded billboard photo carefully.
2. Read any visible text, GPS stamps at the bottom, road signs, shop signs, traffic direction, or billboard structure.
3. Compare with the Candidate Hoarding Sites list above to determine which candidate (by Index) is the best match.
4. Detect the Billboard Status:
   - "Occupied" if an active commercial advertisement/brand flex is mounted.
   - "Available" if the billboard is blank, white, torn, has a "To-Let" / "For Booking" sign, or has no brand ad.
5. Return ONLY a JSON object with this exact schema (no markdown formatting, no code block backticks):
{
  "matchedIndex": 0,
  "matchedSiteName": "Exact Location Name from candidate list",
  "status": "Occupied",
  "confidence": 0.95,
  "reasoning": "Brief explanation of match (e.g. Matched Begum Bridge facing traffic toward Metro Plaza)"
}
If NONE of the candidate sites match at all, return "matchedIndex": -1.
`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: parsed.mimeType,
              data: parsed.base64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 500
    }
  };

  try {
    const rawResponse = await callGeminiVision(payload);
    const cleanJson = rawResponse.replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Gemini response did not contain valid JSON.');
    }
    const result = JSON.parse(jsonMatch[0]);
    const idx = parseInt(result.matchedIndex, 10);
    const matchedCandidate = (!isNaN(idx) && idx >= 0 && idx < candidates.length) ? candidates[idx] : null;

    return {
      matchedIndex: matchedCandidate ? idx : -1,
      matchedSiteName: matchedCandidate ? (matchedCandidate["Location "] || matchedCandidate["Locality Site Location"] || matchedCandidate.Location || matchedCandidate.siteName) : (result.matchedSiteName || null),
      matchedHoarding: matchedCandidate,
      status: result.status === 'Occupied' ? 'Occupied' : 'Available',
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.85,
      reasoning: result.reasoning || 'Matched using Smart Vision AI + 50m GPS Geofence.'
    };
  } catch (error) {
    console.error('matchGeofencedHoardingWithAI error:', error);
    // If AI fails, fallback to closest candidate if within 35m
    if (candidates.length === 1 && (candidates[0].distanceM === undefined || candidates[0].distanceM <= 35)) {
      const best = candidates[0];
      return {
        matchedIndex: 0,
        matchedSiteName: best["Location "] || best["Locality Site Location"] || best.Location || best.siteName,
        matchedHoarding: best,
        status: 'Available',
        confidence: 0.75,
        reasoning: 'Direct GPS match within 35m (AI fallback).'
      };
    }
    return {
      matchedIndex: -1,
      matchedSiteName: null,
      matchedHoarding: null,
      status: 'Review',
      confidence: 0,
      error: error.message
    };
  }
};

/**
 * 🧭 RESOLVE TWIN-SITE FACING WITH GEMINI VISION
 * When multiple hoardings share the same GPS coordinates (e.g., a double-sided unipole
 * with one face towards City and the opposite face towards Highway), this uses Gemini Vision
 * to analyze camera perspective, road traffic flow, and background landmarks to automatically
 * determine the exact facing without manual selection.
 */
/**
 * Helper to fetch and convert candidate image URL to base64 for Gemini Vision comparison
 */
export const loadCandidateImageAsBase64 = async (url) => {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:image/')) return url;
  if (url.includes('unsplash.com')) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (typeof Buffer !== 'undefined') {
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      return `data:${contentType};base64,${base64}`;
    }
    const blob = new Blob([arrayBuffer], { type: contentType });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

/**
 * Compact image downscaler for multimodal Gemini Vision requests.
 * Keeps requests well below serverless 4.5MB body limits and speeds up inference.
 */
const downscaleDataUrlForVision = (dataUrl, maxDim = 800, quality = 0.72) => new Promise((resolve) => {
  if (!dataUrl || typeof dataUrl !== 'string' || typeof window === 'undefined' || typeof document === 'undefined' || typeof Image === 'undefined') {
    resolve(dataUrl);
    return;
  }
  const img = new Image();
  img.onload = () => {
    try {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (!w || !h || (w <= maxDim && h <= maxDim && dataUrl.length < 180000)) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality) || dataUrl);
    } catch {
      resolve(dataUrl);
    }
  };
  img.onerror = () => resolve(dataUrl);
  img.src = dataUrl;
});

/**
 * Zero-dependency spatial luminance + edge-gradient similarity (top 78% of frame to ignore GPS stamp bar).
 * Inspired by pixel/grid structural comparison libraries for fast visual similarity hints across adjacent poles.
 */
const computeStructuralGridSimilarity = (urlA, urlB) => new Promise((resolve) => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !urlA || !urlB) {
    resolve(null);
    return;
  }
  const loadGrid = (src) => new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const S = 16;
        const c = document.createElement('canvas');
        c.width = S;
        c.height = S;
        const ctx = c.getContext('2d');
        const cropH = Math.max(1, Math.round((img.naturalHeight || img.height) * 0.78));
        ctx.drawImage(img, 0, 0, img.naturalWidth || img.width, cropH, 0, 0, S, S);
        const { data } = ctx.getImageData(0, 0, S, S);
        const vec = [];
        for (let i = 0; i < data.length; i += 4) {
          const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
          vec.push(lum);
        }
        // Zero-mean unit-variance normalization for lighting invariance
        const mean = vec.reduce((a, b) => a + b, 0) / vec.length;
        let norm = 0;
        const normVec = vec.map(v => {
          const d = v - mean;
          norm += d * d;
          return d;
        });
        const denom = Math.sqrt(norm) || 1;
        res(normVec.map(v => v / denom));
      } catch {
        res(null);
      }
    };
    img.onerror = () => res(null);
    img.src = src;
  });

  Promise.all([loadGrid(urlA), loadGrid(urlB)]).then(([vA, vB]) => {
    if (!vA || !vB || vA.length !== vB.length) {
      resolve(null);
      return;
    }
    let dot = 0;
    for (let i = 0; i < vA.length; i++) dot += vA[i] * vB[i];
    const pct = Math.max(0, Math.min(100, Math.round(((dot + 1) / 2) * 100)));
    resolve(pct);
  }).catch(() => resolve(null));
});

/**
 * 🧭 RESOLVE TWIN-SITE & CORRIDOR HOARDING WITH GEMINI VISION
 * When multiple hoardings exist along the same road corridor or junction (within ~280m — e.g.,
 * opposite faces on a double-sided unipole, rooftop billboards above buildings, or consecutive poles),
 * compares the audit photo against reference photos, mounting structure (Billboard vs Unipole vs Gantry),
 * directional bearing, and surrounding landmarks to determine the exact hoarding and facing.
 */
export const resolveTwinSiteFacingWithGemini = async (imageBase64, candidates, options = {}) => {
  if (!imageBase64 || !Array.isArray(candidates) || candidates.length < 2) {
    return null;
  }

  const compactLiveB64 = await downscaleDataUrlForVision(imageBase64, 900, 0.75);
  const parsed = parseBase64(compactLiveB64);
  if (!parsed) return null;

  // Pick up to 10 candidates for reference image attachment (covering all distinct structure/facing + closest row poles within 280m)
  const attachTargets = [];
  const seenAttachIdx = new Set();
  const seenTypeFacing = new Set();
  for (let i = 0; i < candidates.length && attachTargets.length < 10; i++) {
    const raw = candidates[i].site || candidates[i];
    const mType = String(candidates[i].mediaType || raw['Type of Site (Unipole/Billboard)'] || raw.Media || '').toLowerCase();
    const fac = String(candidates[i].facing || raw.Facing || '').toLowerCase();
    const key = `${mType}|${fac}`;
    if (!seenTypeFacing.has(key)) {
      seenTypeFacing.add(key);
      attachTargets.push(i);
      seenAttachIdx.add(i);
    }
  }
  for (let i = 0; i < candidates.length && attachTargets.length < 10; i++) {
    if (!seenAttachIdx.has(i)) {
      attachTargets.push(i);
      seenAttachIdx.add(i);
    }
  }

  const imageFetchPromises = attachTargets.map(async (idx) => {
    const c = candidates[idx];
    const rawSite = c.site || c;
    const imgUrl = rawSite.ImageURL || rawSite.imageUrl || rawSite.image;
    if (imgUrl && !imgUrl.includes('unsplash.com')) {
      try {
        const b64 = await loadCandidateImageAsBase64(imgUrl);
        if (b64) {
          const compactRef = await downscaleDataUrlForVision(b64, 512, 0.65);
          const parsedRef = parseBase64(compactRef);
          if (parsedRef) {
            const simPct = await computeStructuralGridSimilarity(compactLiveB64, compactRef);
            return { idx, parsed: parsedRef, site: rawSite, simPct };
          }
        }
      } catch {}
    }
    return null;
  });
  const fetched = await Promise.all(imageFetchPromises);
  const candidateImages = fetched.filter(Boolean);

  const candidateDescriptions = candidates.map((c, idx) => {
    const rawSite = c.site || c;
    const sl = rawSite.SL || rawSite['S. No.'] || rawSite['SL NO'] || (c.index !== undefined ? c.index + 1 : idx + 1);
    const name = rawSite["Location "] || rawSite["Locality Site Location"] || rawSite.Location || rawSite.siteName || `Site #${idx}`;
    const facing = rawSite.Facing || rawSite['Traffic View'] || rawSite.facing || 'N/A';
    const from = rawSite['Traffic From'] || rawSite.from || '';
    const to = rawSite['Traffic To'] || rawSite.to || '';
    const traffic = from && to ? `Traffic from ${from} towards ${to}` : (from || to || '');
    const siteType = rawSite['Type of Site (Unipole/Billboard)'] || rawSite['Type of Site (Unipole/ Billboard)'] || rawSite['Type of Site'] || rawSite['Media'] || rawSite.Type || 'Unipole';
    const refUrl = rawSite.ImageURL && !rawSite.ImageURL.includes('unsplash.com') ? rawSite.ImageURL : '';
    const distText = c.distanceM !== undefined ? `~${c.distanceM}m (GPS estimate)` : '';
    const attachedRef = candidateImages.find(img => img.idx === idx);
    const hasRefPhoto = attachedRef
      ? ` (Reference Photo Attached Below${attachedRef.simPct != null ? ` • Structural Grid Similarity: ${attachedRef.simPct}%` : ''})`
      : '';
    const bearingInfo = c.cameraBearing ? ` | Bearing from Camera GPS: ${c.cameraBearing.degrees}° (${c.cameraBearing.cardinal})` : '';
    const compassNote = c.compassDiffDeg != null ? ` | Compass Alignment Δ: ${Math.round(c.compassDiffDeg)}°` : '';
    const landmarks = rawSite.Visual_Landmarks || rawSite['Visual Landmarks'] || rawSite.Structure_Notes || rawSite['Structure Notes'] || '';
    return `[Candidate ${idx}]:
- S.No / SL: #${sl}
- Structure Type: ${siteType}
- Location: "${name}"
${landmarks ? `- Physical Structure & Visual Landmarks: "${landmarks}"\n` : ''}- Facing Direction: "${facing}" (Face points towards ${facing}, visible to traffic coming from ${from || facing} heading towards ${to || 'opposite'})${bearingInfo}${compassNote}
${distText ? `- Distance to Camera GPS: ${distText}` : ''}
${traffic ? `- Traffic Flow: "${traffic}"` : ''}
${rawSite.City ? `- City: "${rawSite.City}"` : ''}
${refUrl ? `- Reference Photo: ${refUrl}${hasRefPhoto}` : ''}`;
  }).join('\n\n');

  const rowFocusNote = options?.rowVerification
    ? '\n⚠️ ROW / ADJACENT RE-VERIFICATION MODE: Multiple hoardings stand in a close row here. Examine exact left/right buildings, shop signs, gates, trees, divider railings, and pole count from the road intersection across ALL attached reference photos so the exact pole/billboard in the row is chosen!'
    : '';

  const prompt = `You are an expert AI Outdoor Advertising (OOH / Billboard) Traffic & Location Analyst.
A field audit photo was taken of an outdoor billboard / hoarding along a road corridor.
Compare this live audit photo against the candidate hoardings in our master inventory.${rowFocusNote}

CANDIDATE HOARDINGS AT / NEAR THIS CORRIDOR:
${candidateDescriptions}

CRITICAL RULES FOR ACCURATE MATCHING:
1. 📸 DIRECT VISUAL REFERENCE MATCH (ABSOLUTE HIGHEST PRIORITY):
   - We have attached REFERENCE PHOTOS for candidates where available below.
   - CAREFULLY COMPARE the live audit photo against each candidate's reference photo.
   - If the live audit photo shows the SAME building/rooftop/shopfronts, identical road view, identical gates/statues/flyover walls/trees, or is clearly the SAME physical structure as Candidate [X]'s reference photo:
     YOU MUST SELECT THAT CANDIDATE!
   - ⚠️ NEVER let GPS distance difference (e.g., 17m vs 103m or 24m vs 250m) override an obvious visual/structural match! Photographers often shoot zoomed photos or stand up to 280m down the road / across an intersection.

2. 🏗️ STRUCTURE TYPE & PHYSICAL CIVIL LANDMARKS:
   - Check the physical mounting structure in the live audit photo:
     * ROOFTOP BILLBOARD vs STREET UNIPOLE vs OVERHEAD GANTRY:
       A "Billboard" (rooftop/wall structure) sits ON TOP OF or ON THE FACADE OF a building/complex (with I-beam frame on a roof).
       A "Unipole" stands on a SINGLE central vertical steel pillar/column in the median divider or sidewalk.
       A "Gantry" is an overhead steel bridge/truss structure spanning ACROSS traffic lanes.
       ⚠️ STRICT RULE: If the photo shows a Rooftop Billboard mounted atop a building, select a "Billboard" candidate even if a "Unipole" is closer in meters! If it shows a street Unipole, NEVER select a Billboard or Gantry!
     * ELEVATED METRO VIADUCT TRACKS & PILLARS: Is the billboard directly under elevated metro viaduct track pillars? Match the candidate whose Physical Structure & Visual Landmarks mentions metro viaduct pillars!
     * FLYOVER RAMPS, RETAINING WALLS, STATUES & GATES: Match specific gates (e.g. "Meerut College Gate" vs "Alexander Club"), statues, flyover retaining walls, railings, shops (e.g. "Ganga Plaza", "GD Goenka").

3. 🧭 BILLBOARD FACING & TRAFFIC LINE-OF-SIGHT:
   - "Facing [X]" means the billboard face points towards X and is directly visible to traffic traveling from X.
   - Always choose the candidate whose Facing aligns with the camera's line of sight over opposite-facing candidates.

4. Status detection: "Occupied" (active commercial brand ad mounted) or "Available" (blank, white, torn, or To-Let).

5. 🎯 MULTI-HOARDING ADJACENT CLUSTER DETECTION (1, 2, or 3 HOARDINGS):
   - In outdoor advertising, candidate hoardings along a road corridor often stand adjacent to each other in sequence (e.g. 2 or 3 unipoles along the road).
   - Check if this photo captures a WIDE / CORRIDOR SHOT showing MULTIPLE adjacent hoardings (2 or 3 hoardings visible together in frame), OR a SOLO shot (only 1 hoarding visible).
   - If 3 adjacent hoardings are visible in the photo, list all 3 candidate indices in "matchedIndices" and set "visibleCount": 3.
   - If 2 adjacent hoardings are visible in the photo, list the 2 candidate indices in "matchedIndices" and set "visibleCount": 2.
   - If only 1 hoarding is visible (solo close-up or only 1 in frame), list that single candidate index in "matchedIndices" and set "visibleCount": 1.
   - "matchedIndex" and "sl" must ALWAYS be set to the primary / closest / central hoarding in the photo.

6. 🚫 NO HOARDING VISIBLE (INDOOR / IRRELEVANT PHOTO CHECK):
   - If this photograph does NOT clearly depict an outdoor advertising hoarding, unipole, billboard, or gantry (e.g. photo taken indoors, in a room, shows a bedsheet, cloth, carpet, ceiling, wall, floor, furniture, person, or darkness):
   - You MUST set: "isHoardingPhoto": false, "matchedIndex": -1, "sl": null, "confidence": 0, "reasoning": "No outdoor hoarding structure visible in photo (indoor/irrelevant image)."

Return ONLY a single valid JSON object (no markdown, no backticks):
{
  "isHoardingPhoto": true,
  "matchedIndex": 0,
  "sl": 183,
  "visibleCount": 1,
  "matchedIndices": [0],
  "matchedSLs": [183],
  "facing": "exact facing from selected candidate",
  "status": "Occupied",
  "confidence": 0.99,
  "reasoning": "Clear explanation of matched physical structure, reference photo comparison, visible adjacent count, and road landmarks"
}`;

  const parts = [
    { text: prompt },
    {
      inline_data: {
        mime_type: parsed.mimeType,
        data: parsed.base64
      }
    }
  ];

  for (const item of candidateImages) {
    const sl = item.site.SL || item.site['S. No.'] || item.site['SL NO'] || (item.idx + 1);
    parts.push({
      text: `REFERENCE PHOTO FOR CANDIDATE ${item.idx} (Hoarding SL #${sl} - Location: "${item.site.Location || ''}" - Facing: "${item.site.Facing || ''}"):`
    });
    parts.push({
      inline_data: {
        mime_type: item.parsed.mimeType,
        data: item.parsed.base64
      }
    });
  }

  const payload = {
    contents: [
      {
        parts
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 1000,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  try {
    const rawResponse = await callGeminiVision(payload);
    const result = safeJsonParse(rawResponse);
    if (!result) return null;

    if (result.isHoardingPhoto === false || result.matchedIndex === -1 || result.confidence === 0) {
      return {
        matchedSite: null,
        isHoardingPhoto: false,
        confidence: 0,
        reasoning: result.reasoning || 'No outdoor billboard structure detected in photo.'
      };
    }

    let matchedCandidate = null;
    let idx = parseInt(result.matchedIndex, 10);
    
    // 1. Match by exact SL if returned by Gemini
    const returnedSL = result.sl || result.matchedSL || result.targetSL || result.matched_sl;
    if (returnedSL) {
      const targetSlDigits = String(returnedSL).replace(/\D/g, '');
      const bySl = candidates.find(c => {
        const rawSite = c.site || c;
        const sl = rawSite.SL || rawSite['S. No.'] || rawSite['SL NO'];
        if (!sl) return false;
        const s = String(sl).trim();
        if (s.toLowerCase() === String(returnedSL).trim().toLowerCase()) return true;
        const digits = s.replace(/\D/g, '');
        return targetSlDigits && digits && digits === targetSlDigits;
      });
      if (bySl) {
        matchedCandidate = bySl;
        idx = candidates.indexOf(bySl);
      }
    }

    // 2. Match by matchedIndex
    if (!matchedCandidate && !isNaN(idx) && idx >= 0 && idx < candidates.length) {
      matchedCandidate = candidates[idx];
    }

    if (matchedCandidate) {
      const normFacingStr = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const facingTokensMatch = (a, b) => {
        const na = normFacingStr(a);
        const nb = normFacingStr(b);
        if (!na || !nb) return false;
        if (na === nb) return true;
        const ta = na.split(' ').filter(t => t.length >= 3);
        const tb = nb.split(' ').filter(t => t.length >= 3);
        if (!ta.length || !tb.length) return false;
        return ta.some(t => tb.includes(t));
      };

      // 🛡️ Facing-Candidate Alignment Guard:
      // If Gemini detected a clear facing string that disagrees with matchedCandidate's Facing,
      // check if another twin candidate at the SAME location matches that exact facing cleanly.
      let rawSelected = matchedCandidate.site || matchedCandidate;
      let candidateFacing = rawSelected.Facing || rawSelected['Traffic View'] || matchedCandidate.facing || '';
      if (result.facing && candidateFacing && !facingTokensMatch(candidateFacing, result.facing)) {
        const selLoc = normFacingStr(rawSelected["Location "] || rawSelected["Locality Site Location"] || rawSelected.Location || matchedCandidate.siteName);
        const exactTwin = candidates.find(c => {
          if (c === matchedCandidate) return false;
          const cs = c.site || c;
          const cLoc = normFacingStr(cs["Location "] || cs["Locality Site Location"] || cs.Location || c.siteName);
          const cFac = cs.Facing || cs['Traffic View'] || c.facing || '';
          return cLoc === selLoc && cFac && facingTokensMatch(cFac, result.facing);
        });
        if (exactTwin) {
          matchedCandidate = exactTwin;
          idx = candidates.indexOf(exactTwin);
          rawSelected = matchedCandidate.site || matchedCandidate;
          candidateFacing = rawSelected.Facing || rawSelected['Traffic View'] || matchedCandidate.facing || '';
        }
      }

      const resolvedSL = rawSelected.SL || rawSelected['S. No.'] || rawSelected['SL NO'] || '';
      const resolvedFacing = candidateFacing || result.facing || '';

      // 🎯 Build multi-hoarding cluster matches (for 1, 2, or 3 adjacent hoardings)
      const rawIndices = Array.isArray(result.matchedIndices) && result.matchedIndices.length > 0
        ? result.matchedIndices
        : [idx];
      const clusterMatches = [];
      const seenKeys = new Set();

      // Primary site always at index 0
      const primaryKey = `${matchedCandidate.index !== undefined ? matchedCandidate.index : idx}_${String(resolvedSL).trim()}`;
      clusterMatches.push({
        index: matchedCandidate.index !== undefined ? matchedCandidate.index : idx,
        candidateIndex: matchedCandidate.index !== undefined ? matchedCandidate.index : idx,
        sl: resolvedSL,
        siteId: rawSelected._SiteID || rawSelected.UniqueID || rawSelected['Unique ID'] || matchedCandidate.siteId || '',
        site: rawSelected,
        siteName: rawSelected["Location "] || rawSelected["Locality Site Location"] || rawSelected.Location || rawSelected.siteName,
        siteCoord: matchedCandidate.siteCoord,
        distanceM: matchedCandidate.distanceM,
        facing: resolvedFacing,
        status: result.status === 'Occupied' ? 'Occupied' : 'Available',
        mediaType: matchedCandidate.mediaType || rawSelected.Media || 'Unipole'
      });
      seenKeys.add(primaryKey);

      // Additional adjacent companion hoardings visible in the same frame
      for (const mIdx of rawIndices) {
        const cand = candidates[mIdx] || candidates.find(c => c.index === mIdx);
        if (cand && cand !== matchedCandidate) {
          const candSite = cand.site || cand;
          const candSL = candSite.SL || candSite['S. No.'] || candSite['SL NO'] || '';
          const cKey = `${cand.index !== undefined ? cand.index : mIdx}_${String(candSL).trim()}`;
          if (!seenKeys.has(cKey)) {
            seenKeys.add(cKey);
            clusterMatches.push({
              index: cand.index !== undefined ? cand.index : mIdx,
              candidateIndex: cand.index !== undefined ? cand.index : mIdx,
              sl: candSL,
              siteId: candSite._SiteID || candSite.UniqueID || candSite['Unique ID'] || cand.siteId || '',
              site: candSite,
              siteName: candSite["Location "] || candSite["Locality Site Location"] || candSite.Location || candSite.siteName,
              siteCoord: cand.siteCoord,
              distanceM: cand.distanceM,
              facing: candSite.Facing || candSite['Traffic View'] || cand.facing || '',
              status: result.status === 'Occupied' ? 'Occupied' : 'Available',
              mediaType: cand.mediaType || candSite.Media || 'Unipole'
            });
          }
        }
      }

      // Also support matching by matchedSLs array if provided by model
      if (Array.isArray(result.matchedSLs)) {
        for (const sVal of result.matchedSLs) {
          const sDigits = String(sVal).replace(/\D/g, '');
          const bySl = candidates.find(c => {
            const rawSite = c.site || c;
            const sl = rawSite.SL || rawSite['S. No.'] || rawSite['SL NO'];
            if (!sl) return false;
            const s = String(sl).trim();
            if (s.toLowerCase() === String(sVal).trim().toLowerCase()) return true;
            return sDigits && s.replace(/\D/g, '') === sDigits;
          });
          if (bySl && bySl !== matchedCandidate) {
            const candSite = bySl.site || bySl;
            const candSL = candSite.SL || candSite['S. No.'] || candSite['SL NO'] || '';
            const bySlIdx = bySl.index !== undefined ? bySl.index : candidates.indexOf(bySl);
            const cKey = `${bySlIdx}_${String(candSL).trim()}`;
            if (!seenKeys.has(cKey)) {
              seenKeys.add(cKey);
              clusterMatches.push({
                index: bySlIdx,
                candidateIndex: bySlIdx,
                sl: candSL,
                siteId: candSite._SiteID || candSite.UniqueID || candSite['Unique ID'] || bySl.siteId || '',
                site: candSite,
                siteName: candSite["Location "] || candSite["Locality Site Location"] || candSite.Location || candSite.siteName,
                siteCoord: bySl.siteCoord,
                distanceM: bySl.distanceM,
                facing: candSite.Facing || candSite['Traffic View'] || bySl.facing || '',
                status: result.status === 'Occupied' ? 'Occupied' : 'Available',
                mediaType: bySl.mediaType || candSite.Media || 'Unipole'
              });
            }
          }
        }
      }

      const visibleCount = Math.max(
        typeof result.visibleCount === 'number' ? result.visibleCount : 1,
        clusterMatches.length
      );

      return {
        matchedIndex: idx,
        candidateIndex: matchedCandidate.index !== undefined ? matchedCandidate.index : idx,
        sl: resolvedSL,
        matchedCandidate,
        matchedSite: rawSelected,
        siteName: rawSelected["Location "] || rawSelected["Locality Site Location"] || rawSelected.Location || rawSelected.siteName,
        facing: resolvedFacing,
        status: result.status === 'Occupied' ? 'Occupied' : 'Available',
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.96,
        reasoning: result.reasoning || `AI visual perspective matched ${resolvedFacing || 'site'}.`,
        clusterMatches,
        visibleCount
      };
    }
  } catch (err) {
    console.warn('[Gemini Corridor / Twin-Site Resolution Notice]:', err);
  }

  return null;
};

/**
 * 🏛️ GENERATE VISUAL LANDMARK FINGERPRINT WITH GEMINI
 * Generates a permanent, 1-line physical structure & civil landmark description for a hoarding site.
 * This description anchors the hoarding to permanent civil infrastructure (metro tracks/pillars,
 * flyover ramps/retaining walls, overhead gantries vs central median unipoles, staircases, road curvature)
 * so that future daily uploads match the exact pole regardless of changes in advertiser flex banners.
 *
 * CRITICAL: NEVER include brand names, advertiser names, products, or temporary slogans.
 */
export const generateVisualLandmarksWithGemini = async (imageBase64, siteInfo = {}) => {
  if (!imageBase64) return '';

  let pureBase64 = imageBase64;
  let mimeType = 'image/jpeg';

  if (typeof imageBase64 === 'string' && (imageBase64.startsWith('http://') || imageBase64.startsWith('https://'))) {
    try {
      const resp = await fetch(imageBase64);
      if (resp.ok) {
        const blob = await resp.blob();
        mimeType = blob.type || 'image/jpeg';
        if (typeof FileReader !== 'undefined') {
          pureBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result;
              resolve(typeof res === 'string' ? (res.split(',')[1] || '') : '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      }
    } catch (e) {
      console.warn('[Gemini Landmark Image Fetch Failed]:', e);
    }
  }

  const parsed = parseBase64(pureBase64);
  if (!parsed) return '';
  if (mimeType && mimeType !== 'image/jpeg') parsed.mimeType = mimeType;

  const siteName = siteInfo['Locality Site Location'] || siteInfo['Location '] || siteInfo.Location || siteInfo.siteName || '';
  const facing = siteInfo.Facing || siteInfo['Traffic View'] || siteInfo.facing || '';
  const media = siteInfo['Type of Site (Unipole/Billboard)'] || siteInfo['Type of Site (Unipole/ Billboard)'] || siteInfo.Media || siteInfo.Type || 'Unipole';

  const prompt = `You are a chief structural engineer and master Out-of-Home (OOH) media surveyor.
Conduct a comprehensive, highly precise physical and civil engineering audit of this billboard/hoarding site.
Site Metadata: Media Type: "${media}", Location: "${siteName}", Facing: "${facing}".

Write a comprehensive, rich, detailed physical landmark fingerprint (approx 50-75 words).
MANDATORY STRUCTURAL & CIVIL DETAILS TO IDENTIFY:
1. Exact Mounting & Structural Architecture: (e.g. Single vertical cylindrical steel unipole pillar with cross-braced ladder frame, roadside cantilever, dual-pillar gantry spanning traffic lanes, ground-level plinth footing, rooftop I-beam chassis, etc.)
2. Roadway & Traffic Grade: (e.g. Center concrete median divider, paved sidewalk curb, multi-lane divided asphalt carriage-way, T-junction corner, roundabout turning radius, flyover entry/exit ramp, elevated rail/metro corridor alignment)
3. Permanent Civil & Environmental Anchors: (e.g. Elevated concrete metro viaduct pillars, flyover retaining walls, high-tension electrical transmission poles with cross-arms, traffic signal junction, municipal stormwater drain culvert, pedestrian footbridge stairs, permanent multi-story commercial masonry facades)
4. Orientation & Elevation: Line of sight facing traffic approaching from ${facing || siteName}, elevation height above street grade, clear unobstructed visibility corridor.

STRICT RESTRICTION:
🚫 NEVER mention any commercial brand names, advertiser names, products, or temporary slogans (e.g., NO brand names like Samsung, Kalyan, Jewellery, etc.). Focus strictly on unchangeable civil engineering and infrastructure features.

Output format: Return ONLY the continuous detailed descriptive paragraph (no bullet points, no markdown bolding, no quotes).`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: parsed.mimeType,
              data: parsed.base64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  try {
    const rawResponse = await callGeminiVision(payload);
    if (!rawResponse || typeof rawResponse !== 'string') return '';
    // Clean up response: remove backticks, quotes, markdown, newlines
    let cleaned = rawResponse.replace(/```json|```/gi, '').replace(/^["']|["']$/g, '').trim();
    // In case Gemini returns a JSON object like {"landmark": "..."}
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      try {
        const parsedJson = JSON.parse(cleaned);
        cleaned = parsedJson.landmark || parsedJson.description || parsedJson.visualLandmarks || Object.values(parsedJson)[0] || '';
      } catch {}
    }
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
  } catch (err) {
    console.warn('[Gemini Visual Landmark Fingerprint Notice]:', err);
    return '';
  }
};

/**
 * 📸 DAILY PROOF OF EXECUTION MATCHING (GPS Stamp + Visual Intelligence)
 * Inspects raw site image, reads printed GPS stamps/coordinates watermark,
 * analyzes billboard environment, and matches with the master inventory.
 */
export const matchDailyExecutionProofWithAI = async (imageBase64, inventoryList) => {
  if (!imageBase64 || !Array.isArray(inventoryList) || inventoryList.length === 0) {
    return {
      matchedLocation: null,
      matchedIndex: -1,
      status: 'Available',
      confidence: 0,
      reasoning: 'No inventory sites provided.'
    };
  }

  const compactProofB64 = await downscaleDataUrlForVision(imageBase64, 1024, 0.8);
  const parsed = parseBase64(compactProofB64);
  if (!parsed) throw new Error('Invalid image data.');

  const prompt = `You are an expert Billboard & Hoarding Proof of Execution Analyzer.
Carefully examine this photograph of an outdoor billboard / hoarding.

LOOK CLOSELY FOR CAMERA WATERMARKS & GPS OVERLAYS:
Most inspection photos contain an on-screen camera stamp or watermark (such as "GPS Camera - PinPoint", "GPS Map Camera", "NoteCam", "Timestamp Camera") in the corners or along the bottom.
These badges can be translucent dark boxes, black rectangles, or white text overlays showing:
- Latitude & Longitude (e.g. "Lat 29.007513 Long 77.7058257" or "Lat 28.9912734 Long 77.7162097")
- Street / Compound / Landmark address (e.g. "Alexander Club, Court Compound, Lalkurti Bazaar", "Block F, Sector 2, Shastri Nagar", "Low Floor Bus Station, NH 58, Modipuram", "Lekha Nagar, Rakshapuram")
- City name (e.g. "Meerut")

CRITICAL LOCATION EXTRACTION RULES:
1. ⚠️ DO NOT use the advertiser's store/showroom address printed on the flex ad itself (e.g. "205, Begum Bridge Road"). That is just the advertiser's shop address!
2. ALWAYS extract the real geographical address from the camera's GPS watermark overlay badge.
3. Look in all four corners and bottom half for the GPS camera badge.
4. Extract:
   - "latitude": numeric decimal degrees (e.g. 29.0490666) if stamped on the image, or null
   - "longitude": numeric decimal degrees (e.g. 77.7075798) if stamped on the image, or null
   - "address": exact stamped location text, landmark, or street from the camera watermark
   - "city": city name (e.g. "Meerut")
   - "adBrand": brand name displayed on the billboard advertisement (e.g. "SENCO Gold & Diamonds")
   - "facing": traffic direction or facing (e.g. "Begum Bridge", "Modipuram", "CCS Park", "Tej Garhi") if evident, or null
   - "structureType": physical mounting structure: "Unipole" (single central pillar in median/sidewalk) | "Gantry" (overhead steel bridge spanning across road lanes) | "Curbside" | "Cantilever"
   - "visualLandmarks": key civil infrastructure visible in photo (e.g. "Unipole under elevated metro viaduct pillars", "curbside pole next to flyover ramp and staircase", "overhead road gantry spanning roadway")
   - "status": "Occupied" if a commercial advertisement/brand flex is mounted, or "Available" if blank/white/torn/"To-Let" advertisement

Output ONLY a single valid JSON object:
{
  "latitude": 29.0490666,
  "longitude": 77.7075798,
  "address": "Stamped location address",
  "city": "Meerut",
  "adBrand": "Mounted brand name",
  "facing": "Extracted traffic facing or null",
  "structureType": "Unipole",
  "visualLandmarks": "Central median unipole situated directly beneath elevated metro viaduct track pillars",
  "status": "Occupied",
  "confidence": 0.98,
  "reasoning": "Detected GPS stamp, Unipole under metro track pillars, and active brand"
}
If no GPS coordinates are stamped on the image, set "latitude": null, "longitude": null.`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: parsed.mimeType,
              data: parsed.base64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  try {
    const rawResponse = await callGeminiVision(payload);
    const result = safeJsonParse(rawResponse);
    if (!result) throw new Error('Invalid JSON response from image analysis.');
    
    const rawLat = result.latitude != null ? result.latitude : (result.gps_watermark?.latitude != null ? result.gps_watermark.latitude : (result.gps?.lat != null ? result.gps.lat : null));
    const rawLng = result.longitude != null ? result.longitude : (result.gps_watermark?.longitude != null ? result.gps_watermark.longitude : (result.gps?.lng != null ? result.gps.lng : null));

    let lat = rawLat != null ? parseFloat(rawLat) : null;
    let lng = rawLng != null ? parseFloat(rawLng) : null;
    if (lat !== null && lng !== null && (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0))) {
      lat = null;
      lng = null;
    }

    const gpsCoord = (lat !== null && lng !== null) ? { lat, lng } : null;
    const address = result.address || result.watermark_address || result.gps_watermark?.address || result.location || '';
    const facing = result.facing || result.facing_and_traffic || result.camera_road_view || '';

    return {
      gpsCoord,
      gpsStampDetected: gpsCoord ? `${gpsCoord.lat.toFixed(6)}, ${gpsCoord.lng.toFixed(6)}` : null,
      address,
      facing,
      city: result.city || result.gps_watermark?.city || '',
      adBrand: result.adBrand || result.brand || '',
      structureType: result.structureType || result.structure_type || result.structure || '',
      visualLandmarks: result.visualLandmarks || result.visual_landmarks || result.landmarks || '',
      status: result.status === 'Occupied' ? 'Occupied' : 'Available',
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.95,
      reasoning: result.reasoning || (gpsCoord ? `GPS detected: ${gpsCoord.lat}, ${gpsCoord.lng}` : (address ? `Address detected: ${address}` : 'Landmarks detected')),
      matchedIndex: -1,
      matchedSiteName: null
    };
  } catch (err) {
    console.warn('matchDailyExecutionProofWithAI notice:', err);
    throw err;
  }
};

/**
 * 📊 GEMINI DOCUMENT & PPT DATA EXTRACTOR
 * Extracts structured outdoor media site entries from messy PPT slide texts or Excel tables.
 */
export const extractSitesFromRawDataWithGemini = async (rawText) => {
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 10) return [];
  
  const prompt = `
You are an expert Outdoor Media Advertising (OOH) Data Assistant.
Extract structured billboard/hoarding site records from the following raw document or slide text.

RAW INPUT TEXT:
${rawText.slice(0, 4000)}

TASK:
Extract all hoarding/billboard sites into a clean JSON array of objects.
Each object must have these exact fields:
- "Location ": string (Full descriptive landmark & road name, e.g. "Begum Bridge facing Delhi Road")
- "City": string (e.g. "Meerut", "Noida", "Delhi")
- "Area": string (Locality or neighborhood name)
- "Width": number or string (Width in feet)
- "Height": number or string (Height in feet)
- "Media Format": string ("Front Lit", "Back Lit", or "Non Lit")
- "Type": string ("Unipole", "Billboard", "Gantry", "BQS")
- "Avg Monthly Cost (INR)": number (Rental price per month if mentioned, else 0)
- "STATUS": string ("Available" or "Occupied")

Return ONLY the raw JSON array (no markdown code blocks, no backticks, no commentary).
`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 1500
    }
  };

  try {
    const rawResponse = await callGeminiVision(payload);
    const cleanJson = rawResponse.replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  } catch (e) {
    console.warn('extractSitesFromRawDataWithGemini notice:', e);
    return [];
  }
};

/**
 * 🎯 Match a PPT slide to candidate inventory hoardings using Gemini
 */
export const matchSlideToInventoryWithGemini = async (slideText, candidates, imageBase64 = null) => {
  if (!candidates || candidates.length === 0) return null;

  const candidateList = candidates.map((c, i) => ({
    index: i,
    siteId: c._SiteID,
    location: c.Location || c['Location '] || c['Locality Site Location'],
    facing: c.Facing || c['Traffic View'],
    from: c['Traffic From'],
    to: c['Traffic To'],
    lat: c.Latitude || c['Lat.'],
    lng: c.Longitude || c['Long.'],
    city: c.City,
    area: c.Area || c.Locality,
    size: `${c.Width || ''}x${c.Height || ''}`
  }));

  const prompt = `You are an expert AI Outdoor Advertising matching engine.
Match the outdoor hoarding billboard described in the PPT Slide to the best candidate from the inventory database.

PPT Slide Information:
Text: """${slideText || '(No slide text, compare visually if image provided)'}"""

Candidate Inventory Sites:
${JSON.stringify(candidateList, null, 2)}

TASK:
1. Carefully compare location landmarks, road names, facing direction, GPS coordinates, traffic from/to, and dimensions.
2. Return ONLY a valid JSON object (no markdown, no backticks):
{
  "bestMatchIndex": number (0 to ${candidates.length - 1}, or -1 if no candidate matches),
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reason": "Brief reason for match"
}`;

  const parts = [{ text: prompt }];

  if (imageBase64) {
    const parsed = parseBase64(imageBase64);
    if (parsed) {
      parts.push({
        inline_data: {
          mime_type: parsed.mimeType,
          data: parsed.base64
        }
      });
    }
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 400
    }
  };

  try {
    const rawResponse = await callGeminiVision(payload);
    const cleanJson = rawResponse.replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const result = JSON.parse(jsonMatch[0]);
    const idx = parseInt(result.bestMatchIndex, 10);
    if (!isNaN(idx) && idx >= 0 && idx < candidates.length) {
      return {
        site: candidates[idx],
        confidence: result.confidence || 'HIGH',
        reason: result.reason || 'Matched via slide & inventory analysis'
      };
    }
    return null;
  } catch (err) {
    console.warn('[Gemini Slide Matcher Notice]:', err);
    return null;
  }
};

/**
 * 🌟 MULTIMODAL PPT SLIDE ANALYZER & IMAGE EXTRACTOR
 * Analyzes a PPT slide's extracted image and text, identifies the billboard/hoarding,
 * reads visual landmarks, road signs, GPS watermarks, and matches with master inventory.
 */
export const analyzePptSlideWithGeminiVision = async (imageBase64, slideText = '', candidates = []) => {
  if (!imageBase64 && !slideText) return null;

  const candidateSummary = (candidates || []).slice(0, 40).map((c, i) => {
    const id = c._SiteID || c.UniqueID || `Site_${i}`;
    const loc = c.Location || c['Location '] || c['Locality Site Location'] || '';
    const city = c.City || '';
    const area = c.Area || c.Locality || '';
    const facing = c.Facing || c['Traffic View'] || '';
    const traffic = [c['Traffic From'], c['Traffic To']].filter(Boolean).join(' to ');
    const lat = c.Latitude || c['Lat.'] || '';
    const lng = c.Longitude || c['Long.'] || '';
    const size = (c.Width && c.Height) ? `${c.Width}x${c.Height}` : '';
    return `[Index ${i} - ID: ${id}]: "${loc}" | City: "${city}" | Area: "${area}" | Facing: "${facing || traffic}" | Size: "${size}" | GPS: ${lat},${lng}`;
  }).join('\n');

  const prompt = `You are an expert Outdoor Advertising (OOH/Billboard) Vision Analyst.
Analyze this billboard / hoarding presentation slide image and text.

SLIDE TEXT (if any):
"""${slideText || '(No text on slide, inspect visual billboard image)'}"""

CANDIDATE HOARDINGS IN MASTER INVENTORY:
${candidateSummary || '(No inventory candidates provided)'}

YOUR TASKS:
1. 📸 IMAGE & VISUAL ANALYSIS:
   - Determine if this image shows a billboard/hoarding, unipole, gantry, bridge panel, or outdoor advertisement.
   - Read all printed text inside the slide or on the billboard itself (brand name, road name, landmark, area, city, contact info, GPS watermark).
2. 📍 LOCATION & METADATA EXTRACTION:
   - Location / Landmark name: (e.g., "Begum Bridge facing Delhi Road")
   - City: (e.g., "Meerut", "Delhi", "Noida")
   - Locality / Area: (e.g., "Civil Lines", "Modipuram", "Abu Lane")
   - Traffic / Facing Direction: (e.g., "Facing Delhi Road", "Towards Clock Tower")
   - Dimensions / Size: (e.g., "20x10", "40x20")
   - Media Type: ("Unipole", "Billboard", "Gantry", "BQS", "Bridge Panel")
   - Status: ("Occupied" if active commercial brand ad is mounted, "Available" if blank/white/torn/To-Let)
   - GPS Stamp: (Any latitude/longitude coordinates visible on watermark or slide text)
3. 🎯 INVENTORY MATCHING:
   - Compare with the candidate list above.
   - Determine the best matching candidate by Index (0, 1, 2, ...).
   - If a candidate matches, return its index and confidence ("HIGH", "MEDIUM", "LOW"). If none match, return -1.

RETURN ONLY VALID JSON (no markdown formatting, no backticks):
{
  "isHoardingPhoto": true,
  "bestMatchIndex": 0,
  "confidence": "HIGH",
  "locationName": "Begum Bridge facing Delhi Road",
  "city": "Meerut",
  "area": "Begum Bridge",
  "facing": "Facing Delhi Road",
  "size": "20x10",
  "mediaType": "Unipole",
  "status": "Occupied",
  "gpsStamp": "28.9845, 77.7064",
  "reason": "Clear match with Begum Bridge hoarding facing Delhi Road"
}`;

  const parts = [{ text: prompt }];

  if (imageBase64) {
    const parsed = parseBase64(imageBase64);
    if (parsed) {
      parts.push({
        inline_data: {
          mime_type: parsed.mimeType,
          data: parsed.base64
        }
      });
    }
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 600
    }
  };

  try {
    const rawResponse = await callGeminiVision(payload);
    const cleanJson = rawResponse.replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const result = JSON.parse(jsonMatch[0]);
    const idx = parseInt(result.bestMatchIndex, 10);
    const matchedSite = (!isNaN(idx) && idx >= 0 && idx < (candidates || []).length) ? candidates[idx] : null;

    return {
      matchedSite,
      bestMatchIndex: matchedSite ? idx : -1,
      confidence: result.confidence || (matchedSite ? 'HIGH' : 'LOW'),
      isHoardingPhoto: result.isHoardingPhoto !== false,
      locationName: result.locationName || (matchedSite ? (matchedSite['Location '] || matchedSite['Locality Site Location'] || matchedSite.Location) : ''),
      city: result.city || matchedSite?.City || '',
      area: result.area || matchedSite?.Area || matchedSite?.Locality || '',
      facing: result.facing || matchedSite?.Facing || '',
      size: result.size || (matchedSite?.Width && matchedSite?.Height ? `${matchedSite.Width}x${matchedSite.Height}` : ''),
      mediaType: result.mediaType || matchedSite?.Media || 'Billboard',
      status: result.status === 'Occupied' ? 'Occupied' : 'Available',
      gpsStamp: result.gpsStamp || null,
      reason: result.reason || 'Matched via slide visual & text analysis'
    };
  } catch (err) {
    console.warn('[Gemini 3.7 Flash PPT Analyzer Notice]:', err);
    return null;
  }
};



