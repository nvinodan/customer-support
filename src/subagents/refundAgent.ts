import { Agent, ZodTool } from '@strands-agents/sdk';
import { z } from 'zod';
import { initiateRefund } from '../tools/initiateRefund.js';

const refundAgent = new Agent({
  model: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
  systemPrompt: `You are a refund specialist. Your only job is to process refund requests using the initiateRefund tool.
Always use the initiateRefund tool to process the request — never approve or deny refunds without calling the tool.`,
  tools: [initiateRefund],
  name: 'Refund Specialist',
  // Suppress printing so the orchestrator's printer controls the output
  printer: false,
});

// Agent-as-tool: exposes the refund agent as a tool the orchestrator can call
export const refundAgentTool = new ZodTool({
  name: 'refund_specialist',
  description:
    'Delegates a refund request to the refund specialist agent. Use this when the customer wants a refund or return.',
  inputSchema: z.object({
    request: z.string().describe('Full description of the refund request, including the order ID and reason'),
  }),
  callback: async ({ request }) => {
    const result = await refundAgent.invoke(request);
    return result.toString();
  },
});
