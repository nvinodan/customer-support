import { Agent } from '@strands-agents/sdk';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getOrderStatus } from './tools/getOrderStatus.js';
import { refundAgentTool } from './subagents/refundAgent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptPath = existsSync(join(__dirname, 'prompts/prompt.md'))
  ? join(__dirname, 'prompts/prompt.md')
  : join(__dirname, '../src/prompts/prompt.md');
const systemPrompt = readFileSync(promptPath, 'utf-8');

export const agent = new Agent({
  systemPrompt,
  tools: [getOrderStatus, refundAgentTool],
  name: 'Customer Support Agent',
});
