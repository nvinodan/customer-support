# customer-support-agent

A customer support agent on AWS Bedrock (Strands Agents SDK) with a React streaming chat UI, deployable as an AgentCore runtime.

## Stack
- **Runtime**: TypeScript, Express, `@strands-agents/sdk`, Zod — AgentCore direct code deploy (NODE_22)
- **Proxy**: TypeScript, Express, `@aws-sdk/client-bedrock-agentcore` — bridges UI to AgentCore
- **Frontend**: React + Vite + Tailwind CSS (`ui/`), native `fetch` with `ReadableStream`

## Run

```bash
# Local development (direct, no AgentCore)
npx tsx src/server.ts  # port 3001

# AgentCore runtime (local testing)
npx tsx src/runtime.ts  # port 8080

# Proxy server (connects UI to deployed AgentCore)
AGENT_RUNTIME_ARN=arn:... npx tsx src/proxy.ts  # port 3001

# Frontend
cd ui && npm install && npm run dev  # port 5173

# CLI
npx tsx src/index.ts
```

## Deploy

```bash
AWS_ACCOUNT_ID=123456789012 ./deploy.sh
```

## Structure

```
src/
  index.ts          — CLI entry point (do not modify)
  server.ts         — Express server, POST /api/chat (SSE) — local dev only
  runtime.ts        — AgentCore runtime (/ping + /invocations, streams SSE)
  proxy.ts          — Proxy server: UI → AgentCore SDK → runtime
  agent.ts          — orchestrator agent
  memory.ts         — AgentCore Memory retrieve/store (graceful no-op if MEMORY_ID unset)
  prompts/prompt.md — system prompt (loaded at runtime)
  tools/
    getOrderStatus.ts   — order lookup (DynamoDB)
    listOrders.ts       — list all orders (DynamoDB)
    initiateRefund.ts   — refund processor (DynamoDB)
  subagents/
    refundAgent.ts  — refund specialist sub-agent
ui/
  vite.config.ts    — proxies /api → localhost:3001
  src/
    App.tsx
    components/ChatWindow.tsx
    components/Message.tsx
    hooks/useChat.ts
deploy.sh           — Build, package ZIP, upload to S3, create/update runtime
tsconfig.build.json — Compilation config
scripts/
  setup-dynamodb.ts — Create and seed the DynamoDB orders table (idempotent)
```

## API

### UI endpoint (server.ts or proxy.ts)
`POST /api/chat` — `{ message: string, sessionId?: string }` → SSE stream of JSON-encoded text chunks, terminated by `data: [DONE]`

### AgentCore contract (runtime.ts)
- `GET /ping` → `{ status: "Healthy", time_of_last_update: <unix> }`
- `POST /invocations` (raw body) → SSE stream, same format as `/api/chat`

## Environment Variables

| Variable | Used by | Description |
|---|---|---|
| `AWS_REGION` | runtime, proxy, deploy | AWS region (default: us-east-1) |
| `AGENT_RUNTIME_ARN` | proxy | ARN of the deployed AgentCore runtime |
| `AWS_ACCOUNT_ID` | deploy | AWS account for S3/AgentCore |
| `PORT` | runtime, proxy | Listen port (runtime: 8080, proxy: 3001) |
| `MEMORY_ID` | runtime, server | AgentCore Memory resource ID (optional — memory disabled if unset) |
| `ORDERS_TABLE` | runtime, server | DynamoDB table name (default: customer_support_orders) |

## Data Setup

```bash
# Create and seed the DynamoDB orders table (idempotent, safe to re-run)
npx tsx scripts/setup-dynamodb.ts
```

## Conventions
- No `any` types
- System prompt from file, not hardcoded
- Tool files export one `ZodTool`; data backed by DynamoDB (`ORDERS_TABLE`)
- Frontend state in hooks only; no Redux/Zustand
