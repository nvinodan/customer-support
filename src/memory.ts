import {
  BedrockAgentCoreClient,
  RetrieveMemoryRecordsCommand,
  BatchCreateMemoryRecordsCommand,
} from '@aws-sdk/client-bedrock-agentcore';

const MEMORY_ID = process.env.MEMORY_ID;
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

const memoryClient = MEMORY_ID
  ? new BedrockAgentCoreClient({ region: AWS_REGION })
  : null;

export async function retrieveMemories(query: string, namespace: string): Promise<string> {
  if (!memoryClient || !MEMORY_ID) return '';

  try {
    const response = await memoryClient.send(
      new RetrieveMemoryRecordsCommand({
        memoryId: MEMORY_ID,
        namespace,
        searchCriteria: { searchQuery: query, topK: 5 },
      })
    );

    const records = response.memoryRecordSummaries ?? [];
    if (!records.length) return '';

    return records
      .map(r => (r.content as { text?: string })?.text ?? '')
      .filter(Boolean)
      .join('\n');
  } catch (err) {
    console.error('Memory retrieval failed:', err);
    return '';
  }
}

export async function storeMemory(
  userMessage: string,
  agentResponse: string,
  namespace: string,
): Promise<void> {
  if (!memoryClient || !MEMORY_ID) return;

  const facts = [
    `User: ${userMessage.slice(0, 500)}`,
    `Agent: ${agentResponse.slice(0, 500)}`,
  ];

  try {
    await memoryClient.send(
      new BatchCreateMemoryRecordsCommand({
        memoryId: MEMORY_ID,
        records: facts.map((text, i) => ({
          requestIdentifier: `req-${Date.now()}-${i}`,
          namespaces: [namespace],
          content: { text },
          timestamp: new Date(),
        })),
      })
    );
  } catch (err) {
    console.error('Memory write failed:', err);
  }
}
