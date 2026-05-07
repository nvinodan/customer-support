import express from 'express';
import { agent } from './agent.js';
import { ModelStreamUpdateEvent } from '@strands-agents/sdk';
import { retrieveMemories, storeMemory } from './memory.js';
import { setWorkloadToken } from './tools/searchNews.js';

const PORT = process.env.PORT || 8080;

function parseInvocationPayload(body: Buffer): { prompt: string; sessionId: string } {
  if (!body?.length) return { prompt: '', sessionId: 'default' };
  const text = new TextDecoder().decode(body).trim();
  if (!text) return { prompt: '', sessionId: 'default' };
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const prompt = typeof parsed.prompt === 'string' ? parsed.prompt : (parsed.prompt != null ? String(parsed.prompt) : text);
      const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId : 'default';
      return { prompt, sessionId };
    } catch { /* treat as plain text */ }
  }
  return { prompt: text, sessionId: 'default' };
}

const app = express();

app.get('/ping', (_, res) =>
  res.json({ status: 'Healthy', time_of_last_update: Math.floor(Date.now() / 1000) })
);

app.post('/invocations', express.raw({ type: '*/*' }), async (req, res) => {
  const { prompt, sessionId: payloadSessionId } = parseInvocationPayload(req.body as Buffer);
  if (!prompt) {
    res.status(400).json({ status: 'error', response: 'Empty prompt' });
    return;
  }

  const sessionId = (req.headers['x-amzn-agentcore-session-id'] as string) ?? payloadSessionId;

  const workloadToken = req.headers['x-amzn-bedrock-agentcore-workload-access-token'] as string | undefined;
  console.log(`[runtime] Workload token header present: ${!!workloadToken}`);
  console.log(`[runtime] Request headers: ${Object.keys(req.headers).filter(h => h.startsWith('x-amzn')).join(', ')}`);
  if (workloadToken) {
    setWorkloadToken(workloadToken);
  }

  const memories = await retrieveMemories(prompt, sessionId);
  const augmentedPrompt = memories
    ? `Previous conversation context:\n${memories}\n\nUser: ${prompt}`
    : prompt;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let fullResponse = '';

  try {
    for await (const event of agent.stream(augmentedPrompt)) {
      if (event instanceof ModelStreamUpdateEvent) {
        const inner = event.event;
        if (inner.type === 'modelContentBlockDeltaEvent' && inner.delta.type === 'textDelta') {
          fullResponse += inner.delta.text;
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

  storeMemory(prompt, fullResponse, sessionId).catch(() => {});
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`AgentCore runtime listening on 0.0.0.0:${PORT}`);
});
