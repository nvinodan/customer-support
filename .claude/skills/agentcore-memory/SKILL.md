---
name: agentcore-memory
description: Integrate AWS Bedrock AgentCore Memory as the persistent memory layer for a Strands TypeScript runtime agent.
---

# Skill: agentcore-memory

Integrate AWS Bedrock AgentCore Memory as the persistent memory layer for a Strands TypeScript runtime agent. AgentCore Memory replaces the Strands `SessionManager` by storing semantically searchable facts rather than raw conversation snapshots.

## When to use this skill

Invoke `/agentcore-memory` when the user asks to:
- Persist user preferences, facts, or context across agent sessions
- Give the agent memory that works across different sessions (not just within one)
- Replace or skip the Strands `SessionManager` in favour of AWS-managed memory
- Integrate AgentCore Memory tightly with the runtime `/invocations` endpoint

---

## How it works in the runtime

AgentCore Memory is wired into the `/invocations` request lifecycle — **not** as an agent tool the LLM decides to call, but as infrastructure the runtime controls:

```
POST /invocations
  │
  ├── 1. Parse prompt from body
  ├── 2. Retrieve relevant memories  ← RetrieveMemoryRecordsCommand
  ├── 3. Augment system prompt with memories
  ├── 4. agent.invoke(augmentedPrompt)
  ├── 5. Extract facts from turn        ← BatchCreateMemoryRecordsCommand
  └── 6. Return response
```

The memory is namespaced by session or user ID so each user gets their own memory space.

---

## Required imports

```typescript
import {
  BedrockAgentCoreClient,
  RetrieveMemoryRecordsCommand,
  BatchCreateMemoryRecordsCommand,
} from '@aws-sdk/client-bedrock-agentcore'
```

No extra packages — already in `@aws-sdk/client-bedrock-agentcore`.

---

## Memory client setup

```typescript
const memoryClient = new BedrockAgentCoreClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
})

const MEMORY_ID = process.env.MEMORY_ID!   // AgentCore Memory resource ID
```

---

## Step 1 — Retrieve memories before invocation

```typescript
async function retrieveMemories(query: string, namespace: string): Promise<string> {
  const response = await memoryClient.send(
    new RetrieveMemoryRecordsCommand({
      memoryId: MEMORY_ID,
      namespace,                         // scope to this session/user
      searchCriteria: {
        searchQuery: query,
        topK: 5,
      },
    })
  )

  const records = response.memoryRecordSummaries ?? []
  if (!records.length) return ''

  return records
    .map(r => (r.content as { text?: string })?.text ?? '')
    .filter(Boolean)
    .join('\n')
}
```

---

## Step 2 — Write new memories after invocation

Extract facts from the conversation turn and store them back into AgentCore Memory.

```typescript
async function storeMemory(
  facts: string[],
  namespace: string,
  memoryStrategyId?: string,
): Promise<void> {
  if (!facts.length) return

  const records = facts.map((text, i) => ({
    requestIdentifier: `req-${Date.now()}-${i}`,
    namespaces: [namespace],
    content: { text },
    timestamp: new Date(),
    ...(memoryStrategyId ? { memoryStrategyId } : {}),
  }))

  await memoryClient.send(
    new BatchCreateMemoryRecordsCommand({
      memoryId: MEMORY_ID,
      records,
    })
  )
}
```

---

## Full `/invocations` endpoint with AgentCore Memory

```typescript
import { z } from 'zod'
import * as strands from '@strands-agents/sdk'
import express from 'express'
import {
  BedrockAgentCoreClient,
  RetrieveMemoryRecordsCommand,
  BatchCreateMemoryRecordsCommand,
} from '@aws-sdk/client-bedrock-agentcore'

const PORT = process.env.PORT || 8080
const MEMORY_ID = process.env.MEMORY_ID!

const memoryClient = new BedrockAgentCoreClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
})

const agent = new strands.Agent({
  model: new strands.BedrockModel({ region: process.env.AWS_REGION ?? 'us-east-1' }),
  tools: [],
  // No sessionManager — AgentCore Memory handles persistence
})

function parseInvocationPayload(body: Buffer): string {
  if (!body?.length) return ''
  const text = new TextDecoder().decode(body).trim()
  if (!text) return ''
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      const prompt = parsed.prompt
      if (typeof prompt === 'string') return prompt
      if (prompt != null) return String(prompt)
    } catch {}
  }
  return text
}

function agentOutputToString(output: unknown): string {
  if (typeof output === 'string') return output
  try { return JSON.stringify(output) } catch { return String(output) }
}

async function retrieveMemories(query: string, namespace: string): Promise<string> {
  const response = await memoryClient.send(
    new RetrieveMemoryRecordsCommand({
      memoryId: MEMORY_ID,
      namespace,
      searchCriteria: { searchQuery: query, topK: 5 },
    })
  )
  return (response.memoryRecordSummaries ?? [])
    .map(r => (r.content as { text?: string })?.text ?? '')
    .filter(Boolean)
    .join('\n')
}

async function storeMemory(facts: string[], namespace: string): Promise<void> {
  if (!facts.length) return
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
  )
}

const app = express()

app.get('/ping', (_, res) =>
  res.json({ status: 'Healthy', time_of_last_update: Math.floor(Date.now() / 1000) })
)

app.post('/invocations', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const prompt = parseInvocationPayload(req.body as Buffer)

    // Namespace by session ID so each user/session has isolated memory
    const namespace = (req.headers['x-amzn-agentcore-session-id'] as string) ?? 'default'

    // 1. Retrieve relevant memories and inject as context
    const memories = await retrieveMemories(prompt, namespace)
    const augmentedPrompt = memories
      ? `Relevant context from previous interactions:\n${memories}\n\nCurrent request: ${prompt}`
      : prompt

    // 2. Invoke the agent with memory-augmented prompt
    const result = await agent.invoke(augmentedPrompt)
    const responseText = agentOutputToString(result)

    // 3. Extract and store key facts from this turn (fire-and-forget)
    const factsToStore = extractFacts(prompt, responseText)
    storeMemory(factsToStore, namespace).catch(err =>
      console.error('Memory write failed:', err)
    )

    return res.status(200).json({ response: responseText, status: 'success' })
  } catch (err) {
    console.error('Invocation error:', err)
    return res.status(500).json({
      status: 'error',
      response: err instanceof Error ? err.message : 'Internal server error',
    })
  }
})

app.listen(Number(PORT), '0.0.0.0', () =>
  console.log(`AgentCore runtime listening on port ${PORT}`)
)

// Replace with LLM-based extraction for production
function extractFacts(prompt: string, response: string): string[] {
  return [`User asked: ${prompt.slice(0, 200)}`, `Agent replied: ${response.slice(0, 200)}`]
}
```

---

## `BatchCreateMemoryRecordsCommand` — full input shape

```typescript
{
  memoryId: string,                      // required: AgentCore Memory resource ID
  records: Array<{
    requestIdentifier: string,           // required: unique ID per record in batch
    namespaces: string[],                // required: e.g. ['session-abc', 'user-123']
    content: { text: string },           // required: the fact to store
    timestamp: Date,                     // required: when this fact was observed
    memoryStrategyId?: string,           // optional: which extraction strategy to use
    metadata?: Record<string, {          // optional: filterable metadata
      stringValue?: string,
      numberValue?: number,
      dateTimeValue?: Date,
      stringListValue?: string[],
    }>,
  }>,
  clientToken?: string,                  // optional: idempotency key
}
```

---

## `RetrieveMemoryRecordsCommand` — full input shape

```typescript
{
  memoryId: string,                      // required
  namespace?: string,                    // filter to a prefix namespace
  namespacePath?: string,                // hierarchical namespace filter
  searchCriteria: {
    searchQuery: string,                 // required: semantic search text
    topK?: number,                       // default 5
    memoryStrategyId?: string,           // filter by strategy
    metadataFilters?: MemoryMetadataFilterExpression[],
  },
  maxResults?: number,                   // pagination, default 20
  nextToken?: string,                    // pagination cursor
}
```

---

## Namespace strategy

Use namespaces to isolate memory per user, session, or topic:

| Namespace value | Scope |
|---|---|
| `session-{sessionId}` | Isolated per AgentCore session |
| `user-{userId}` | Shared across all sessions for one user |
| `user-{userId}/project-{id}` | Per-user, per-project |

The `x-amzn-agentcore-session-id` header from AgentCore is the natural key for session-scoped memory.

---

## Production: LLM-based fact extraction

Rather than naively storing prompt + response, use a small extraction call to distill key facts:

```typescript
async function extractFacts(prompt: string, response: string): Promise<string[]> {
  const extractor = new strands.Agent({
    model: new strands.BedrockModel({ region: 'us-east-1' }),
    systemPrompt: 'Extract 1-3 concise facts worth remembering from this conversation. ' +
      'Return one fact per line. Only include facts about the user, their preferences, ' +
      'or important context. Output nothing else.',
    tools: [],
  })
  const raw = agentOutputToString(await extractor.invoke(
    `User: ${prompt}\nAssistant: ${response}`
  ))
  return raw.split('\n').map(l => l.trim()).filter(Boolean)
}
```

---

## Required environment variables

| Variable | Purpose |
|---|---|
| `MEMORY_ID` | AgentCore Memory resource ID |
| `AWS_REGION` | AWS region, fallback `us-east-1` |

---

## Required IAM permissions

Add to `BedrockAgentCoreRuntimeRole`:

```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock-agentcore:RetrieveMemoryRecords",
    "bedrock-agentcore:BatchCreateMemoryRecords",
    "bedrock-agentcore:GetMemoryRecord",
    "bedrock-agentcore:StartMemoryExtractionJob"
  ],
  "Resource": "arn:aws:bedrock-agentcore:*:*:memory/*"
}
```

---

## Checklist

- [ ] `MEMORY_ID` env var set to AgentCore Memory resource ID
- [ ] Namespace sourced from `x-amzn-agentcore-session-id` header (not hardcoded)
- [ ] `retrieveMemories()` called before `agent.invoke()`, result injected into prompt
- [ ] `storeMemory()` called after `agent.invoke()` (fire-and-forget with error logging)
- [ ] No `sessionManager` in `strands.Agent` config — AgentCore Memory replaces it
- [ ] IAM role has `RetrieveMemoryRecords` and `BatchCreateMemoryRecords` permissions
- [ ] Memory write errors do not fail the HTTP response (catch separately)
- [ ] In production: fact extraction uses an LLM call rather than raw prompt/response slicing
