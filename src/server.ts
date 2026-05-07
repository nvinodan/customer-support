import express from 'express';
import cors from 'cors';
import { agent } from './agent.ts';
import { ModelStreamUpdateEvent } from '@strands-agents/sdk';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { message } = req.body as { message?: string };
  if (!message || message.trim() === '') {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    for await (const event of agent.stream(message)) {
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

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
