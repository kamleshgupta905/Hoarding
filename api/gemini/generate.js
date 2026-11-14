import {
  buildGenerateConfig,
  createGeminiClient,
  extractRetryableStatus,
  getServerGeminiKeys,
  normalizeContents,
  resolveModelList,
  runWithRetries,
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
  let lastError = null;
  let lastStatus = 500;

  for (const apiKey of apiKeys) {
    const ai = createGeminiClient(apiKey);
    for (const model of models) {
      try {
        const config = buildGenerateConfig(body, model);
        const response = await runWithRetries(() =>
          ai.models.generateContent({
            model,
            contents,
            config: Object.keys(config).length > 0 ? config : undefined,
          })
        );
        const text = (response.text || '').trim();
        if (text) {
          res.status(200).json({ text, model });
          return;
        }
        lastError = new Error(`Empty response returned by ${model}`);
      } catch (err) {
        lastError = err;
        lastStatus = extractRetryableStatus(err);
      }
    }
  }

  const message = lastError?.message || 'All Gemini models failed to respond.';
  res.status(lastStatus >= 400 && lastStatus < 600 ? lastStatus : 500).json({ error: message });
}
