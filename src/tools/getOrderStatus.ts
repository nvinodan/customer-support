import { ZodTool } from '@strands-agents/sdk';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

type OrderStatus = {
  orderId: string;
  status: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  estimatedDelivery: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
// TODO: replace with real API call
const orders: Record<string, OrderStatus> = JSON.parse(
  readFileSync(join(__dirname, '../data/orders.json'), 'utf-8')
);

export const getOrderStatus = new ZodTool({
  name: 'getOrderStatus',
  description: 'Returns the current status, items, and delivery info for a given order ID.',
  inputSchema: z.object({
    orderId: z.string().describe('The order ID to look up (e.g. ORD-123)'),
  }),
  callback: async ({ orderId }) => {
    const order = orders[orderId];
    if (!order) {
      return { error: `Order ${orderId} not found.` };
    }
    return order;
  },
});
