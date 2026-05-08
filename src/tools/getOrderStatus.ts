import { ZodTool, type JSONValue } from '@strands-agents/sdk';
import { z } from 'zod';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../dynamodb.js';

export const getOrderStatus = new ZodTool({
  name: 'getOrderStatus',
  description: 'Returns the current status, items, and delivery info for a given order ID.',
  inputSchema: z.object({
    orderId: z.string().describe('The order ID to look up (e.g. ORD-123)'),
  }),
  callback: async ({ orderId }) => {
    const { Item } = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { orderId } })
    );
    if (!Item) {
      return { error: `Order ${orderId} not found.` } as JSONValue;
    }
    return {
      orderId: Item.orderId,
      status: Item.status,
      items: Item.items,
      total: Item.total,
      estimatedDelivery: Item.estimatedDelivery,
    } as JSONValue;
  },
});
