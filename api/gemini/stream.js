import {
  buildGenerateConfig,
  createGeminiClient,
  getServerGeminiKeys,
  normalizeContents,
  resolveModelList,
} from '../_shared.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKeys = getServerGeminiKeys();
  if (apiKeys.length === 0) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    return;
  }

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
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

  let lastError = null;
  for (const apiKey of apiKeys) {
    const ai = createGeminiClient(apiKey);
    for (const model of models) {
      try {
        const config = buildGenerateConfig(body, model);
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: Object.keys(config).length > 0 ? config : undefined,
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
      }
    }
  }

  const message = lastError?.message || 'Streaming request failed.';
  res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  res.end();
}
