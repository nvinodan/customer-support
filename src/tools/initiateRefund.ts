import { ZodTool, type JSONValue } from '@strands-agents/sdk';
import { z } from 'zod';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../dynamodb.js';

export const initiateRefund = new ZodTool({
  name: 'initiateRefund',
  description: 'Processes a refund for a given order ID and returns a confirmation.',
  inputSchema: z.object({
    orderId: z.string().describe('The order ID to refund'),
    reason: z.string().describe('The reason the customer is requesting a refund'),
  }),
  callback: async ({ orderId, reason }) => {
    const { Item } = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { orderId } })
    );
    if (!Item || Item.status !== 'Delivered') {
      return { error: `Order ${orderId} is not eligible for a refund or was not found.` } as JSONValue;
    }

    const refundId = `REF-${Date.now()}`;
    console.log(`Processing refund for ${orderId}: "${reason}"`);

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { orderId },
        UpdateExpression: 'SET #s = :status, refundId = :refundId, refundReason = :reason',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':status': 'Refunded',
          ':refundId': refundId,
          ':reason': reason,
        },
      })
    );

    return {
      refundId,
      orderId,
      status: 'Approved',
      amount: Item.total,
      timeline: '3-5 business days',
    } as JSONValue;
  },
});
