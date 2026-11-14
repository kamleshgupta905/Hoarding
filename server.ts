import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const SERVER_GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;

const DEPRECATED_OR_ALIASES: Record<string, string> = {
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

function getServerGeminiKeys(): string[] {
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

function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizePart(part: unknown): Record<string, unknown> {
  if (typeof part === 'string') {
    return { text: part };
  }
  if (!part || typeof part !== 'object') {
    return {};
  }
  const p = part as Record<string, unknown>;
  const inlineRaw = (p.inlineData || p.inline_data) as Record<string, unknown> | undefined;
  if (inlineRaw && typeof inlineRaw === 'object') {
    return {
      inlineData: {
        mimeType: String(inlineRaw.mimeType || inlineRaw.mime_type || 'image/jpeg'),
        data: String(inlineRaw.data || ''),
      },
    };
  }
  return p;
}

function normalizeContents(input: unknown) {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    return input.map((item) => {
      if (item && typeof item === 'object' && Array.isArray((item as Record<string, unknown>).parts)) {
        const obj = item as Record<string, unknown>;
        return {
          ...obj,
          parts: (obj.parts as unknown[]).map(normalizePart),
        };
      }
      return normalizePart(item);
    });
  }
  if (input && typeof input === 'object' && Array.isArray((input as Record<string, unknown>).parts)) {
    const obj = input as Record<string, unknown>;
    return {
      ...obj,
      parts: (obj.parts as unknown[]).map(normalizePart),
    };
  }
  return input;
}

function buildGenerateConfig(body: Record<string, unknown>, model: string) {
  const rawCfg = (body.config || body.generationConfig || {}) as Record<string, unknown>;
  const config: Record<string, unknown> = {};

  if (typeof rawCfg.systemInstruction === 'string' && rawCfg.systemInstruction.trim()) {
    config.systemInstruction = rawCfg.systemInstruction;
  } else if (typeof body.systemInstruction === 'string' && body.systemInstruction.trim()) {
    config.systemInstruction = body.systemInstruction;
  }

  if (rawCfg.responseMimeType) {
    config.responseMimeType = rawCfg.responseMimeType;
  }
  if (rawCfg.responseSchema) {
    config.responseSchema = rawCfg.responseSchema;
  }
  if (typeof rawCfg.seed === 'number') {
    config.seed = rawCfg.seed;
  }

  const isGemini4 = model.startsWith('gemini-4-');
  const isLite = model.includes('lite');

  if (!isGemini4) {
    if (typeof rawCfg.maxOutputTokens === 'number') {
      config.maxOutputTokens = rawCfg.maxOutputTokens;
    }
  } else {
    // Gemini 4 models support thinkingLevel; avoid deprecated temperature/topP/topK/thinkingBudget
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }

  if (isLite) {
    delete config.thinkingConfig;
  }

  return config;
}

function resolveModelList(requestedModel: unknown): string[] {
  if (typeof requestedModel === 'string' && requestedModel.trim()) {
    const mapped = DEPRECATED_OR_ALIASES[requestedModel.trim()] || requestedModel.trim();
    return Array.from(new Set([mapped, ...SERVER_GEMINI_MODELS]));
  }
  return [...SERVER_GEMINI_MODELS];
}

function extractRetryableStatus(err: unknown): number {
  const e = err as { status?: number; code?: number; message?: string } | undefined;
  if (typeof e?.status === 'number') return e.status;
  if (typeof e?.code === 'number') return e.code;
  const msg = String(e?.message || '');
  const match = msg.match(/\b(400|401|403|404|429|500|503)\b/);
  return match ? Number(match[1]) : 500;
}

async function runWithRetries<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastErr: unknown;
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, geminiConfigured: getServerGeminiKeys().length > 0 });
  });

  app.post('/api/gemini/generate', async (req, res) => {
    const apiKeys = getServerGeminiKeys();
    if (apiKeys.length === 0) {
      res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const rawContents = body.contents ?? (body.parts ? { parts: body.parts } : body.prompt);
    if (!rawContents) {
      res.status(400).json({ error: 'Request must include contents, parts, or prompt.' });
      return;
    }

    const contents = normalizeContents(rawContents);
    const models = resolveModelList(body.model);
    let lastError: unknown = null;
    let lastStatus = 500;

    for (const apiKey of apiKeys) {
      const ai = createGeminiClient(apiKey);
      for (const model of models) {
        try {
          const config = buildGenerateConfig(body, model);
          const response = await runWithRetries(() =>
            ai.models.generateContent({
              model,
              contents: contents as never,
              config: Object.keys(config).length > 0 ? (config as never) : undefined,
            })
          );
          const text = (response.text || '').trim();
          if (text) {
            res.json({ text, model });
            return;
          }
          lastError = new Error(`Empty response returned by ${model}`);
        } catch (err) {
          lastError = err;
          lastStatus = extractRetryableStatus(err);
          console.warn(`[Gemini Server /generate ${model}] error (${lastStatus}):`, (err as Error)?.message || err);
        }
      }
    }

    const message = (lastError as Error)?.message || 'All Gemini models failed to respond.';
    res.status(lastStatus >= 400 && lastStatus < 600 ? lastStatus : 500).json({ error: message });
  });

  app.post('/api/gemini/stream', async (req, res) => {
    const apiKeys = getServerGeminiKeys();
    if (apiKeys.length === 0) {
      res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const rawContents = body.contents ?? (body.parts ? { parts: body.parts } : body.prompt);
    if (!rawContents) {
      res.status(400).json({ error: 'Request must include contents, parts, or prompt.' });
      return;
    }

    const contents = normalizeContents(rawContents);
    const models = resolveModelList(body.model);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let lastError: unknown = null;
    for (const apiKey of apiKeys) {
      const ai = createGeminiClient(apiKey);
      for (const model of models) {
        try {
          const config = buildGenerateConfig(body, model);
          const stream = await ai.models.generateContentStream({
            model,
            contents: contents as never,
            config: Object.keys(config).length > 0 ? (config as never) : undefined,
          });
          for await (const chunk of stream) {
            const text = chunk.text || '';
            if (text) {
              res.write(`data: ${JSON.stringify({ text, model })}\n\n`);
            }
          }
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        } catch (err) {
          lastError = err;
          console.warn(`[Gemini Server /stream ${model}] error:`, (err as Error)?.message || err);
        }
      }
    }

    const message = (lastError as Error)?.message || 'Streaming request failed.';
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  });

  const distDir = path.resolve(__dirname, 'dist');
  const isProd =
    process.env.NODE_ENV === 'production' ||
    (process.env.npm_lifecycle_event === 'start' && fs.existsSync(path.join(distDir, 'index.html')));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
