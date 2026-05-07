import express from 'express';
import cors from 'cors';
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';

const AGENT_RUNTIME_ARN = process.env.AGENT_RUNTIME_ARN;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const PORT = process.env.PORT || 3001;

if (!AGENT_RUNTIME_ARN) {
  console.error('AGENT_RUNTIME_ARN environment variable is required');
  process.exit(1);
}

const client = new BedrockAgentCoreClient({ region: AWS_REGION });

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
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: AGENT_RUNTIME_ARN,
      runtimeSessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
      qualifier: 'DEFAULT',
      payload: new TextEncoder().encode(JSON.stringify({ prompt: message })),
    });

    const response = await client.send(command);
    const stream = response.response;

    if (!stream) {
      res.write(`data: ${JSON.stringify('Error: No response stream')}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const raw = await stream.transformToString();

    const lines = raw.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      res.write(`${line}\n\n`);
      if (line === 'data: [DONE]') break;
    }

    if (!raw.includes('data: [DONE]')) {
      res.write('data: [DONE]\n\n');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.write(`data: ${JSON.stringify(`Error: ${msg}`)}\n\n`);
    res.write('data: [DONE]\n\n');
  }

  res.end();
});

app.listen(Number(PORT), () => {
  console.log(`Proxy server listening on http://localhost:${PORT}`);
});
