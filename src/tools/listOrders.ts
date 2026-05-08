import { ZodTool, type JSONValue } from '@strands-agents/sdk';
import { z } from 'zod';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../dynamodb.js';

export const listOrders = new ZodTool({
  name: 'listOrders',
  description: 'Returns a list of all orders with their ID, status, total, and estimated delivery date.',
  inputSchema: z.object({}),
  callback: async () => {
    const { Items = [] } = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'orderId, #s, #t, estimatedDelivery',
        ExpressionAttributeNames: { '#s': 'status', '#t': 'total' },
      })
    );
    return Items.map((item) => ({
      orderId: item.orderId,
      status: item.status,
      total: item.total,
      estimatedDelivery: item.estimatedDelivery,
    })) as JSONValue;
  },
});
