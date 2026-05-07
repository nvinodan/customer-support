import { ZodTool } from '@strands-agents/sdk';
import { z } from 'zod';

type OrderStatus = {
  orderId: string;
  status: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  estimatedDelivery: string;
};

// TODO: replace with real API call
const mockOrders: Record<string, OrderStatus> = {
  'ORD-123': {
    orderId: 'ORD-123',
    status: 'Shipped',
    items: [{ name: 'Wireless Headphones', quantity: 1, price: 89.99 }],
    total: 89.99,
    estimatedDelivery: '2026-05-09',
  },
  'ORD-456': {
    orderId: 'ORD-456',
    status: 'Delivered',
    items: [
      { name: 'Mechanical Keyboard', quantity: 1, price: 149.00 },
      { name: 'Mouse Pad', quantity: 1, price: 19.99 },
    ],
    total: 168.99,
    estimatedDelivery: '2026-05-03',
  },
};

export const getOrderStatus = new ZodTool({
  name: 'getOrderStatus',
  description: 'Returns the current status, items, and delivery info for a given order ID.',
  inputSchema: z.object({
    orderId: z.string().describe('The order ID to look up (e.g. ORD-123)'),
  }),
  callback: async ({ orderId }) => {
    const order = mockOrders[orderId];
    if (!order) {
      return { error: `Order ${orderId} not found.` };
    }
    return order;
  },
});
