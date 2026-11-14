import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const SERVER_GEMINI_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];

const DEPRECATED_OR_ALIASES = {
  'gemini-flash-latest': 'gemini-4-hydrogen',
  'gemini-flash-lite-latest': 'gemini-3.1-flash-lite',
  'gemini-3.8-flash': 'gemini-4-hydrogen',
  'gemini-3.7-flash': 'gemini-4-hydrogen',
  'gemini-3.6-flash': 'gemini-4-hydrogen',
  'gemini-3.5-flash': 'gemini-4-hydrogen',
  'gemini-3.5-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-3-flash-preview': 'gemini-4-hydrogen',
  'gemini-3.1-pro-preview': 'gemini-4-argon',
};

export function getServerGeminiKeys() {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.VITE_GEMINI_API_KEY,
    process.env.VITE_GEMINI_API_KEY_1,
    process.env.VITE_GEMINI_API_KEY_2,
    process.env.VITE_GEMINI_API_KEY_3,
    process.env.VITE_GEMINI_API_KEY_4,
  ];
  return Array.from(new Set(candidates.map((k) => String(k || '').trim()).filter(Boolean)));
}

export function createGeminiClient(apiKey) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizePart(part) {
  if (typeof part === 'string') return { text: part };
  if (!part || typeof part !== 'object') return {};
  const inlineRaw = part.inlineData || part.inline_data;
  if (inlineRaw && typeof inlineRaw === 'object') {
    return {
      inlineData: {
        mimeType: String(inlineRaw.mimeType || inlineRaw.mime_type || 'image/jpeg'),
        data: String(inlineRaw.data || ''),
      },
    };
  }
  return part;
}

export function normalizeContents(input) {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    return input.map((item) => {
      if (item && typeof item === 'object' && Array.isArray(item.parts)) {
        return { ...item, parts: item.parts.map(normalizePart) };
      }
      return normalizePart(item);
    });
  }
  if (input && typeof input === 'object' && Array.isArray(input.parts)) {
    return { ...input, parts: input.parts.map(normalizePart) };
  }
  return input;
}

export function buildGenerateConfig(body, model) {
  const rawCfg = (body.config || body.generationConfig || {});
  const config = {};

  if (typeof rawCfg.systemInstruction === 'string' && rawCfg.systemInstruction.trim()) {
    config.systemInstruction = rawCfg.systemInstruction;
  } else if (typeof body.systemInstruction === 'string' && body.systemInstruction.trim()) {
    config.systemInstruction = body.systemInstruction;
  }

  if (rawCfg.responseMimeType) config.responseMimeType = rawCfg.responseMimeType;
  if (rawCfg.responseSchema) config.responseSchema = rawCfg.responseSchema;
  if (typeof rawCfg.seed === 'number') config.seed = rawCfg.seed;

  const isGemini4 = model.startsWith('gemini-4-');
  const isLite = model.includes('lite');

  if (!isGemini4) {
    if (typeof rawCfg.maxOutputTokens === 'number') {
      config.maxOutputTokens = rawCfg.maxOutputTokens;
    }
  } else {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }

  if (isLite) {
    delete config.thinkingConfig;
  }

  return config;
}

export function resolveModelList(requestedModel) {
  if (typeof requestedModel === 'string' && requestedModel.trim()) {
    const mapped = DEPRECATED_OR_ALIASES[requestedModel.trim()] || requestedModel.trim();
    return Array.from(new Set([mapped, ...SERVER_GEMINI_MODELS]));
  }
  return [...SERVER_GEMINI_MODELS];
}

export function extractRetryableStatus(err) {
  if (typeof err?.status === 'number') return err.status;
  if (typeof err?.code === 'number') return err.code;
  const msg = String(err?.message || '');
  const match = msg.match(/\b(400|401|403|404|429|500|503)\b/);
  return match ? Number(match[1]) : 500;
}

export async function runWithRetries(fn, maxAttempts = 2) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = extractRetryableStatus(err);
      if ((status === 429 || status === 503) && attempt + 1 < maxAttempts) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
