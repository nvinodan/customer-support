import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.ORDERS_TABLE || 'customer_support_orders';
const REGION = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

const SEED_ORDERS = [
  {
    orderId: 'ORD-123',
    status: 'Shipped',
    items: [{ name: 'Wireless Headphones', quantity: 1, price: 89.99 }],
    total: 89.99,
    estimatedDelivery: '2026-05-09',
  },
  {
    orderId: 'ORD-456',
    status: 'Delivered',
    items: [
      { name: 'Mechanical Keyboard', quantity: 1, price: 149.0 },
      { name: 'Mouse Pad', quantity: 1, price: 19.99 },
    ],
    total: 168.99,
    estimatedDelivery: '2026-05-03',
  },
  {
    orderId: 'ORD-789',
    status: 'Processing',
    items: [
      { name: 'USB-C Hub', quantity: 2, price: 34.99 },
      { name: 'HDMI Cable', quantity: 1, price: 12.99 },
    ],
    total: 82.97,
    estimatedDelivery: '2026-05-14',
  },
  {
    orderId: 'ORD-1001',
    status: 'Delivered',
    items: [{ name: '27" 4K Monitor', quantity: 1, price: 449.0 }],
    total: 449.0,
    estimatedDelivery: '2026-04-28',
  },
  {
    orderId: 'ORD-1002',
    status: 'Shipped',
    items: [
      { name: 'Standing Desk Frame', quantity: 1, price: 299.0 },
      { name: 'Desk Mat XL', quantity: 1, price: 39.99 },
    ],
    total: 338.99,
    estimatedDelivery: '2026-05-11',
  },
  {
    orderId: 'ORD-1003',
    status: 'Delivered',
    items: [
      { name: 'Webcam HD Pro', quantity: 1, price: 79.99 },
      { name: 'Ring Light', quantity: 1, price: 24.99 },
      { name: 'Tripod Mount', quantity: 1, price: 15.99 },
    ],
    total: 120.97,
    estimatedDelivery: '2026-04-30',
  },
  {
    orderId: 'ORD-1004',
    status: 'Cancelled',
    items: [{ name: 'Ergonomic Chair', quantity: 1, price: 599.0 }],
    total: 599.0,
    estimatedDelivery: '2026-05-15',
  },
  {
    orderId: 'ORD-1005',
    status: 'Delivered',
    items: [
      { name: 'Noise Cancelling Earbuds', quantity: 1, price: 129.99 },
      { name: 'Carrying Case', quantity: 1, price: 19.99 },
    ],
    total: 149.98,
    estimatedDelivery: '2026-05-01',
  },
  {
    orderId: 'ORD-1006',
    status: 'Processing',
    items: [{ name: 'Mechanical Numpad', quantity: 1, price: 59.99 }],
    total: 59.99,
    estimatedDelivery: '2026-05-16',
  },
  {
    orderId: 'ORD-1007',
    status: 'Shipped',
    items: [
      { name: 'Laptop Stand', quantity: 1, price: 49.99 },
      { name: 'Wireless Charger', quantity: 2, price: 29.99 },
    ],
    total: 109.97,
    estimatedDelivery: '2026-05-12',
  },
];

async function tableExists(): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ResourceNotFoundException') {
      return false;
    }
    throw err;
  }
}

async function createTable(): Promise<void> {
  console.log(`Creating table "${TABLE_NAME}"...`);
  await client.send(
    new CreateTableCommand({
      TableName: TABLE_NAME,
      KeySchema: [{ AttributeName: 'orderId', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'orderId', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST',
    })
  );
  console.log('Table created. Waiting for it to become active...');
  let active = false;
  while (!active) {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    if (Table?.TableStatus === 'ACTIVE') {
      active = true;
    } else {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log('Table is active.');
}

async function seedData(): Promise<void> {
  console.log('Seeding sample orders...');
  for (const order of SEED_ORDERS) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: order }));
    console.log(`  Put ${order.orderId}`);
  }
  console.log('Seeding complete.');
}

async function main(): Promise<void> {
  if (await tableExists()) {
    console.log(`Table "${TABLE_NAME}" already exists.`);
  } else {
    await createTable();
  }
  await seedData();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
