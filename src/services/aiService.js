
import Groq from "groq-sdk";

// Initialize Groq client
// Note: In Vite, env vars are exposed via import.meta.env.
// Ensure VITE_GROQ_API_KEY is set in your .env file.
const API_KEY = import.meta.env.VITE_GROQ_API_KEY;

let groq;

export const initializeAI = (apiKey) => {
    // Priority: Argument > Env Var
    const key = apiKey || API_KEY;
    if (key) {
        groq = new Groq({
            apiKey: key,
            dangerouslyAllowBrowser: true // Required for client-side API usage
        });
    } else {
        console.warn("AI Service: No API Key provided for Groq.");
    }
};

// Initialize on load if env var is present
if (API_KEY) initializeAI(API_KEY);

// Helper to load image
function dataUrlToImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
    });
}

// Helper to crop the bottom part of the image (GPS Stamp Area) - Multi-Crop Strategy
async function cropStampMulti(base64Image) {
    const img = await dataUrlToImage(base64Image);
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    const crops = [
        // Primary crop: Bottom 35% (Standard GPS Box)
        { x: 0.05, y: 0.60, w: 0.90, h: 0.35 },
        // Backup crop: Slightly taller (Bottom 40%) in case stamp is higher
        { x: 0.05, y: 0.55, w: 0.90, h: 0.40 }
    ];

    const out = [];

    for (const c of crops) {
        const sx = Math.floor(w * c.x);
        const sy = Math.floor(h * c.y);
        const sw = Math.floor(w * c.w);
        const sh = Math.floor(h * c.h);

        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

        out.push(canvas.toDataURL("image/jpeg", 0.95));
    }
    return out;
}

export const analyzeHoardingImage = async (base64Image, locationList) => {
    if (!groq) {
        if (API_KEY) initializeAI(API_KEY);
        else return { matchedLocation: null, status: "Error", confidence: 0, error: "Groq API Key missing" };
    }

    if (!locationList || locationList.length === 0) {
        return { matchedLocation: null, status: "Unknown", confidence: 0 };
    }

    // Minimized list context for speed
    const validLocations = locationList.filter(l => l && l["Locality Site Location"]);
    const locationsString = validLocations.map((l, index) => {
        return `${index}. Site: "${l["Locality Site Location"]}"`;
    }).join("\n");

    // 🔥 ULTRA-SHORT, HIGH-PERFORMANCE PROMPT
    const prompt = `
    You see CROPPED images of a GPS Location Stamp.
    Your task: Extract the address text and match it to the Master List.
    Ignore all ads/logos. Focus ONLY on location text.

    SYNONYMS: "Begumpul"="Begum Bridge", "Cantt"="Cantonment", "Chauraha"="Chowk".

    MASTER LIST:
    ${locationsString}

    RETURN STRICT JSON:
    {
        "detectedStampText": "string",
        "matchedIndex": integer,
        "matchedLocation": "string or null",
        "status": "Available" | "Occupied",
        "confidence": number,
        "reasoning": "string"
    }
    `;

    try {
        // ✂️ Get 2 optimised crops
        const crops = await cropStampMulti(base64Image);

        // Send both crops to Groq
        const content = [
            { type: "text", text: prompt },
            ...crops.map(url => ({ type: "image_url", image_url: { url } }))
        ];

        const response = await groq.chat.completions.create({
            model: "meta-llama/llama-4-maverick-17b-128e-instruct",
            messages: [{ role: "user", content }],
            response_format: { type: "json_object" },
            max_tokens: 512, // Reduced for speed
            temperature: 0.0, // Zero temp for max deterministic behavior
        });

        const text = response.choices[0].message.content;
        const aiResult = JSON.parse(text);

        // 🛡️ CODE-LEVEL VALIDATION: Cross-check AI's match against its own detected text
        if (aiResult.matchedLocation) {
            const stampText = (aiResult.detectedStampText || "").trim();

            // RULE 1: If AI matched something but has NO stamp text, reject it
            if (!stampText) {
                console.warn("🚫 REJECTED: AI matched '" + aiResult.matchedLocation + "' but no stamp text was detected. Forcing null.");
                aiResult.matchedLocation = null;
                aiResult.matchedIndex = -1;
                aiResult.confidence = 0;
                aiResult.reasoning = "Rejected: No readable stamp text found on image.";
            } else {
                // RULE 2: Verify keyword overlap between stamp text and matched location
                const stampLower = stampText.toLowerCase();
                const matchedLower = aiResult.matchedLocation.toLowerCase();

                const ignoreWords = new Set(['road', 'near', 'opposite', 'facing', 'fcng', 'uttar', 'pradesh', 'india', 'the', 'and', 'from', 'new', 'old', 'block', 'sector']);
                const getKeywords = (text) => text.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length >= 3 && !ignoreWords.has(w));

                const stampKeywords = getKeywords(stampLower);
                const matchKeywords = getKeywords(matchedLower);

                // At least ONE significant keyword from the matched location must appear in the stamp
                const hasOverlap = matchKeywords.some(mk => stampKeywords.some(sk => sk.includes(mk) || mk.includes(sk)));

                if (!hasOverlap) {
                    console.warn("🚫 CODE VALIDATION FAILED: AI matched '" + aiResult.matchedLocation + "' but stamp says '" + stampText + "'. No keyword overlap. Rejecting.");
                    aiResult.matchedLocation = null;
                    aiResult.matchedIndex = -1;
                    aiResult.confidence = 0;
                    aiResult.reasoning = "Code validation rejected: stamp text '" + stampText + "' has no keyword overlap with matched site '" + matchedLower + "'.";
                }
            }
        }

        return aiResult;
    } catch (error) {
        console.error("AI Analysis Error:", error);
        return {
            matchedIndex: -1,
            matchedLocation: null,
            status: "Error",
            confidence: 0,
            error: error.message || "Unknown AI Error"
        };
    }
};
