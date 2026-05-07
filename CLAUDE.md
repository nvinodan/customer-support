# customer-support-agent

A customer support agent on AWS Bedrock (Strands Agents SDK) with a React streaming chat UI.

## Stack
- **Backend**: TypeScript, tsx, Express, cors, dotenv, `@strands-agents/sdk`, Zod
- **Frontend**: React + Vite + Tailwind CSS (`ui/`), native `fetch` with `ReadableStream`

## Run

```bash
# Backend
cp .env.example .env  # fill in AWS creds
npx tsx src/server.ts  # port 3001

# Frontend
cd ui && npm install && npm run dev  # port 5173
```

## Structure

```
src/
  index.ts          — CLI entry point (do not modify)
  server.ts         — Express server, POST /api/chat (SSE)
  agent.ts          — orchestrator agent
  prompts/prompt.md — system prompt (loaded at runtime)
  tools/
    getOrderStatus.ts   — mock order lookup
    initiateRefund.ts   — mock refund processor
  subagents/
    refundAgent.ts  — refund specialist sub-agent
ui/
  vite.config.ts    — proxies /api → API_URL
  .env.example      — API_URL=http://localhost:3001
  src/
    App.tsx
    components/ChatWindow.tsx
    components/Message.tsx
    hooks/useChat.ts
```

## API

`POST /api/chat` — `{ message: string }` → SSE stream of JSON-encoded text chunks, terminated by `data: [DONE]`

Each SSE line: `data: "chunk"\n\n`

## Conventions
- No `any` types
- System prompt from file, not hardcoded
- Tool files export one `ZodTool`; mock data stays in the file with `// TODO: replace with real API call`
- Frontend state in hooks only; no Redux/Zustand
