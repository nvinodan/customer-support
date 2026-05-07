import { ZodTool } from '@strands-agents/sdk';
import { z } from 'zod';

// TODO: replace with real API call
const processRefund = (orderId: string, amount: number) => ({
  refundId: `REF-${Date.now()}`,
  orderId,
  status: 'Approved',
  amount,
  timeline: '3-5 business days',
});

// Order totals needed to calculate refund amount
const orderTotals: Record<string, number> = {
  'ORD-456': 168.99,
};

export const initiateRefund = new ZodTool({
  name: 'initiateRefund',
  description: 'Processes a refund for a given order ID and returns a confirmation.',
  inputSchema: z.object({
    orderId: z.string().describe('The order ID to refund'),
    reason: z.string().describe('The reason the customer is requesting a refund'),
  }),
  callback: async ({ orderId, reason }) => {
    const amount = orderTotals[orderId];
    if (!amount) {
      return { error: `Order ${orderId} is not eligible for a refund or was not found.` };
    }
    console.log(`Processing refund for ${orderId}: "${reason}"`);
    return processRefund(orderId, amount);
  },
});
