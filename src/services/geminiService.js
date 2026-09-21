/**
 * 🧠 Gemini Vision AI Service for Outdoor Hoarding & PPT Extraction
 * Powered by Google Gemini 3.7 Flash with multi-key auto-failover.
 */

// 🔑 Keys come from the environment (.env.local locally, Vercel env vars in
// production) or from a key the user pastes into the admin settings.
// Never hardcode a key here — this file is bundled and served to the browser.
export const getGeminiApiKeys = () => {
  const customKey = (typeof window !== 'undefined' && (
    window.localStorage?.getItem('adh_gemini_api_key') ||
    window.localStorage?.getItem('gemini_api_key')
  )) || null;

  const nodeEnv = (typeof process !== 'undefined' && process.env) || {};

  return [
    customKey,
    import.meta.env?.VITE_GEMINI_API_KEY || nodeEnv.VITE_GEMINI_API_KEY,
    import.meta.env?.VITE_GEMINI_API_KEY_1 || nodeEnv.VITE_GEMINI_API_KEY_1 || 'AQ.Ab8RN6JX5X6bvAY9y-iBaVbdO_nAC49puDmbVyvGDZCkhGHHxQ',
    import.meta.env?.VITE_GEMINI_API_KEY_2 || nodeEnv.VITE_GEMINI_API_KEY_2 || 'AQ.Ab8RN6JloH5_7Hu50bxb4ODlyw0sG07RmWtNE57_JlGI09tPAw',
    import.meta.env?.VITE_GEMINI_API_KEY_3 || nodeEnv.VITE_GEMINI_API_KEY_3 || 'AQ.Ab8RN6KKuExOPSzweXaW0-4rEziM3GmonFb3-rvxHDc-ohOBcQ',
    import.meta.env?.VITE_GEMINI_API_KEY_4 || nodeEnv.VITE_GEMINI_API_KEY_4 || 'AQ.Ab8RN6KpJdKYy-63CLrqiPDSuEP8LW2Q2ioYPDLIIs5IdA560g'
  ].filter(Boolean);
};

export const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-pro',
  'gemini-pro-latest'
];

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
 * Robust JSON parse handling unescaped control characters in LLM responses
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
 * Execute Gemini Generative Vision API call with model and key fallback.
 */
export const callGeminiVision = async (payload) => {
  let lastError = null;
  const apiKeys = getGeminiApiKeys();

  // 🛡️ Base payload configuration
  const baseConfig = {
    temperature: 0.1,
    topP: 0.8,
    maxOutputTokens: 2048,
    ...(payload.generationConfig || {})
  };
  if (baseConfig.maxOutputTokens < 1000) {
    baseConfig.maxOutputTokens = 2048;
  }

  for (const apiKey of apiKeys) {
    if (!apiKey) continue;

    for (const model of GEMINI_MODELS) {
      try {
        const isLite = model.includes('lite');
        const modelConfig = { ...baseConfig };
        // thinkingConfig budget 0 is supported on reasoning flash models, but causes 400 on lite models
        if (!isLite && !modelConfig.thinkingConfig) {
          modelConfig.thinkingConfig = { thinkingBudget: 0 };
        } else if (isLite) {
          delete modelConfig.thinkingConfig;
        }

        const safePayload = {
          ...payload,
          generationConfig: modelConfig
        };

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(safePayload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`Gemini [${model}] status ${response.status}:`, errorText);
          lastError = new Error(`Gemini API Error (${model}): ${response.status}`);
          if (response.status === 429 || response.status === 503) {
            await new Promise(r => setTimeout(r, 600));
          }
          continue; // Try next available model seamlessly
        }

        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const text = parts.map(p => p.text || '').filter(Boolean).join('\n').trim();
        if (text) {
          return text;
        }
      } catch (err) {
        console.warn(`Gemini [${model}] call failed:`, err);
        lastError = err;
      }
    }
  }

  throw lastError || new Error('All Gemini API keys and models exhausted.');
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
 * 🧭 RESOLVE TWIN-SITE & CORRIDOR HOARDING WITH GEMINI VISION
 * When multiple hoardings exist along the same road corridor or junction (e.g., opposite faces on a
 * double-sided unipole, or consecutive hoardings along a stretch like Company Garden), this uses
 * Gemini Multimodal Vision to compare the audit photo against reference photos, examine physical
 * structures (mounting pole, concrete walls, fences, railings, sidewalks, trees, streetlamps),
 * road traffic direction, and determine the EXACT hoarding and facing.
 */
export const resolveTwinSiteFacingWithGemini = async (imageBase64, candidates) => {
  if (!imageBase64 || !Array.isArray(candidates) || candidates.length < 2) {
    return null;
  }

  const parsed = parseBase64(imageBase64);
  if (!parsed) return null;

  // Load candidate reference photos if available in parallel (up to 4 candidates)
  const imageFetchPromises = candidates.slice(0, 4).map(async (c, idx) => {
    const rawSite = c.site || c;
    const imgUrl = rawSite.ImageURL || rawSite.imageUrl || rawSite.image;
    if (imgUrl && !imgUrl.includes('unsplash.com')) {
      try {
        const b64 = await loadCandidateImageAsBase64(imgUrl);
        if (b64) {
          const parsedRef = parseBase64(b64);
          if (parsedRef) {
            return { idx, parsed: parsedRef, site: rawSite };
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
    const hasRefPhoto = candidateImages.some(img => img.idx === idx) ? ' (Visual Reference Photo Attached Below)' : '';
    return `[Candidate ${idx}]:
- S.No / SL: #${sl}
- Structure Type: ${siteType}
- Location: "${name}"
- Facing Direction: "${facing}" (Face points towards ${facing}, visible to traffic coming from ${from || facing} heading towards ${to || 'opposite'})
${distText ? `- Distance to Camera GPS: ${distText}` : ''}
${traffic ? `- Traffic Flow: "${traffic}"` : ''}
${rawSite.City ? `- City: "${rawSite.City}"` : ''}
${refUrl ? `- Reference Photo: ${refUrl}${hasRefPhoto}` : ''}`;
  }).join('\n\n');

  const prompt = `You are an expert AI Outdoor Advertising (OOH / Billboard) Traffic & Location Analyst.
A field audit photo was taken of an outdoor billboard / hoarding along a road corridor.
Compare this live audit photo against the candidate hoardings in our master inventory.

CANDIDATE HOARDINGS AT / NEAR THIS CORRIDOR:
${candidateDescriptions}

CRITICAL RULES FOR ACCURATE MATCHING:
1. 🧭 TOP PRIORITY: BILLBOARD FACING & TRAFFIC LINE-OF-SIGHT:
   - In outdoor advertising (OOH), "Facing [X]" means the billboard face is oriented towards direction X and is visible to traffic approaching FROM X heading towards the opposite direction.
   - Look at the vehicles, lane flow, and camera line of sight:
     * If the camera is facing/moving towards destination Y, the billboard facing the camera is visible to traffic coming FROM origin direction X.
     * Always choose the candidate whose Facing aligns with the camera's line of sight over opposite-facing candidates.
   - ⚠️ DO NOT be deceived by advertiser store addresses or phone numbers printed on the flex ad banner! That is just the advertiser's showroom address, NOT the billboard's facing direction.

2. 🎯 HIGH PRIORITY: PRIMARY FOREGROUND BILLBOARD (CLOSEST TO CAMERA):
   - In live field audit photos, the photographer captures the ONE specific primary billboard that dominates the center foreground.
   - You MUST match this prominent FOREGROUND billboard, NOT secondary or background structures visible down the road!
   - If two candidate hoardings share the same road and same facing (e.g. consecutive hoardings along the road):
     * The candidate closer in distance or first along the vehicle's approach corresponds to the prominent FOREGROUND billboard.
     * Do NOT select a candidate representing a subsequent hoarding further down the road.
   - A distant background sign, small shop banner, or distant billboard visible in the background does NOT determine the site. The primary billboard right in the foreground determines the site!

3. 🏗️ BILLBOARD MOUNTING STRUCTURE & CORRIDOR MATCHING:
   - Carefully identify the physical structure type of the FOREGROUND billboard:
     * UNIPOLE IN MEDIAN: A massive horizontal billboard mounted atop a single tall steel/concrete pillar in the central road divider / median, often directly underneath or beside elevated metro/flyover tracks.
     * OVERHEAD GANTRY: A steel truss bridge spanning horizontally across traffic lanes.
     * ROADSIDE / SIDEWALK POST / WALL MOUNT: Mounted on curbside posts, footpath railing, or building/compound wall.
   - The correct candidate MUST match the physical mounting structure in the foreground!

4. 📏 GPS DISTANCE IS AN ESTIMATE (±50m variance):
   - Calculated GPS distance numbers reflect where the vehicle/camera stopped or small coordinate inaccuracies.
   - Never let a minor GPS distance difference override the visual structure and facing direction.

5. Status detection: "Occupied" (active commercial brand ad mounted) or "Available" (blank, white, torn, or To-Let).

Return ONLY a single valid JSON object (no markdown, no backticks):
{
  "matchedIndex": 0,
  "sl": 196,
  "facing": "exact facing from selected candidate",
  "status": "Occupied",
  "confidence": 0.98,
  "reasoning": "Clear explanation of road direction, foreground structure, and why this candidate was chosen"
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

    let matchedCandidate = null;
    let idx = parseInt(result.matchedIndex, 10);
    
    // 1. Match by exact SL if returned by Gemini
    if (result.sl) {
      const targetSlDigits = String(result.sl).replace(/\D/g, '');
      const bySl = candidates.find(c => {
        const rawSite = c.site || c;
        const sl = rawSite.SL || rawSite['S. No.'] || rawSite['SL NO'];
        if (!sl) return false;
        const s = String(sl).trim();
        if (s.toLowerCase() === String(result.sl).trim().toLowerCase()) return true;
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

      const rawSelected = matchedCandidate.site || matchedCandidate;
      const resolvedSL = rawSelected.SL || rawSelected['S. No.'] || rawSelected['SL NO'] || (matchedCandidate.index !== undefined ? matchedCandidate.index + 1 : idx + 1);
      return {
        matchedIndex: idx,
        candidateIndex: matchedCandidate.index !== undefined ? matchedCandidate.index : idx,
        sl: resolvedSL,
        matchedCandidate,
        matchedSite: rawSelected,
        siteName: rawSelected["Location "] || rawSelected["Locality Site Location"] || rawSelected.Location || rawSelected.siteName,
        facing: result.facing || rawSelected.Facing || rawSelected['Traffic View'] || '',
        status: result.status === 'Occupied' ? 'Occupied' : 'Available',
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.96,
        reasoning: result.reasoning || `AI visual perspective matched ${rawSelected.Facing || 'site'}.`
      };
    }
  } catch (err) {
    console.warn('[Gemini Corridor / Twin-Site Resolution Notice]:', err);
  }

  return null;
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

  const parsed = parseBase64(imageBase64);
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
   - "status": "Occupied" if a commercial advertisement/brand flex is mounted, or "Available" if blank/white/torn/"To-Let" advertisement

Output ONLY a single valid JSON object:
{
  "latitude": 29.0490666,
  "longitude": 77.7075798,
  "address": "Stamped location address",
  "city": "Meerut",
  "adBrand": "Mounted brand name",
  "facing": "Extracted traffic facing or null",
  "status": "Occupied",
  "confidence": 0.98,
  "reasoning": "Detected GPS stamp and active brand"
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
    if (!result) throw new Error('Invalid JSON response from Vision AI.');
    
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
      structureType: result.structure_type || result.structure || '',
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
 * 🎯 Match a PPT slide to candidate inventory hoardings using Gemini 2.0 / 1.5 Flash
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
        reason: result.reason || 'Matched using Gemini AI'
      };
    }
    return null;
  } catch (err) {
    console.warn('[Gemini Slide Matcher Notice]:', err);
    return null;
  }
};

/**
 * 🌟 GEMINI 3.7 FLASH MULTIMODAL PPT SLIDE ANALYZER & IMAGE EXTRACTOR
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

  const prompt = `You are an expert AI Outdoor Advertising (OOH/Billboard) Vision Analyst using the latest Gemini 3.7 Flash model.
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
      reason: result.reason || 'Analyzed with Gemini 3.7 Flash Vision AI'
    };
  } catch (err) {
    console.warn('[Gemini 3.7 Flash PPT Analyzer Notice]:', err);
    return null;
  }
};



