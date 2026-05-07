import { Agent } from '@strands-agents/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getOrderStatus } from './tools/getOrderStatus.ts';
import { refundAgentTool } from './subagents/refundAgent.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Loaded at runtime so the prompt can be edited without recompiling
const systemPrompt = readFileSync(join(__dirname, 'prompts/prompt.md'), 'utf-8');

export const agent = new Agent({
  systemPrompt,
  tools: [getOrderStatus, refundAgentTool],
  name: 'Customer Support Agent',
});
