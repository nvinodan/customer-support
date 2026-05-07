import express from 'express';
import cors from 'cors';
import { agent } from './agent.js';
import { ModelStreamUpdateEvent } from '@strands-agents/sdk';
import { retrieveMemories, storeMemory } from './memory.js';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body as { message?: string; sessionId?: string };
  if (!message || message.trim() === '') {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const resolvedSessionId = sessionId ?? 'default';

  const memories = await retrieveMemories(message, resolvedSessionId);
  const augmentedPrompt = memories
    ? `Previous conversation context:\n${memories}\n\nUser: ${message}`
    : message;

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

  storeMemory(message, fullResponse, resolvedSessionId).catch(() => {});
});

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
