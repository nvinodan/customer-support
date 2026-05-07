import express from 'express';
import { agent } from './agent.js';
import { ModelStreamUpdateEvent } from '@strands-agents/sdk';

const PORT = process.env.PORT || 8080;

function parseInvocationPayload(body: Buffer): string {
  if (!body?.length) return '';
  const text = new TextDecoder().decode(body).trim();
  if (!text) return '';
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const prompt = parsed.prompt;
      if (typeof prompt === 'string') return prompt;
      if (prompt != null) return String(prompt);
    } catch { /* treat as plain text */ }
  }
  return text;
}

const app = express();

app.get('/ping', (_, res) =>
  res.json({ status: 'Healthy', time_of_last_update: Math.floor(Date.now() / 1000) })
);

app.post('/invocations', express.raw({ type: '*/*' }), async (req, res) => {
  const prompt = parseInvocationPayload(req.body as Buffer);
  if (!prompt) {
    res.status(400).json({ status: 'error', response: 'Empty prompt' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    for await (const event of agent.stream(prompt)) {
      if (event instanceof ModelStreamUpdateEvent) {
        const inner = event.event;
        if (inner.type === 'modelContentBlockDeltaEvent' && inner.delta.type === 'textDelta') {
          res.write(`data: ${JSON.stringify(inner.delta.text)}\n\n`);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.write(`data: ${JSON.stringify(`Error: ${msg}`)}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`AgentCore runtime listening on 0.0.0.0:${PORT}`);
});
