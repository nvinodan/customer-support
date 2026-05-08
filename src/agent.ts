import { Agent } from '@strands-agents/sdk';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getOrderStatus } from './tools/getOrderStatus.js';
import { searchNews } from './tools/searchNews.js';
import { refundAgentTool } from './subagents/refundAgent.js';

const __src_dir = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url));

const promptCandidates = [
  join(__src_dir, 'prompts/prompt.md'),
  join(__src_dir, '../src/prompts/prompt.md'),
  join(process.cwd(), 'prompts/prompt.md'),
];
const promptPath = promptCandidates.find(existsSync) ?? promptCandidates[0];
const systemPrompt = readFileSync(promptPath, 'utf-8');

export const agent = new Agent({
  systemPrompt,
  tools: [getOrderStatus, searchNews, refundAgentTool],
  name: 'Customer Support Agent',
});
