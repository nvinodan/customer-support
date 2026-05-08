
# Build Prompt: Customer Support Agent UI

I have an existing TypeScript backend for a customer support agent built with the Strands Agents SDK on AWS Bedrock. I need you to add an Express HTTP server and a React chat frontend that streams agent responses.

## What already exists (do not modify)

- `src/index.ts` — CLI entry point
- `src/agent.ts` — exports `agent` (a Strands agent instance)
- `src/prompts/prompt.md` — system prompt
- `src/tools/getOrderStatus.ts`, `src/tools/initiateRefund.ts` — Zod tools
- `src/subagents/refundAgent.ts` — sub-agent

## What to build

### 1. `src/server.ts` — Express SSE server

- Import Express, cors, the agent, and `ModelStreamUpdateEvent` from `@strands-agents/sdk`
- `app.use(cors())` and `app.use(express.json())`
- `POST /api/chat`: accepts `{ message: string }`, validates it's non-empty (400 if not), sets SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`)
- Iterate `agent.stream(message)` with `for await`. For each `ModelStreamUpdateEvent` where `event.type === 'modelContentBlockDeltaEvent'` and `delta.type === 'textDelta'`, write `data: ${JSON.stringify(delta.text)}\n\n`
- After the loop write `data: [DONE]\n\n` and call `res.end()`. On error, write a JSON-encoded error string then `[DONE]`
- Listen on `process.env.PORT ?? 3001`

Install: `npm install express cors` and `npm install -D @types/express @types/cors`

### 2. Frontend — `ui/` (Vite + React + TypeScript + Tailwind)

Scaffold:
```bash
npm create vite@latest ui -- --template react-ts
cd ui && npm install
npm install @tailwindcss/vite tailwindcss
```

**`ui/vite.config.ts`** — add the Tailwind plugin and a dev-server proxy so `/api` requests forward to `http://localhost:3001`

**`ui/src/index.css`** — import Tailwind

**`ui/src/App.tsx`** — render `<ChatWindow />` as the sole root component

**`ui/src/hooks/useChat.ts`**

Export a `useChat` hook that manages a list of `Message` objects (`id`, `role: 'user' | 'assistant'`, `text`) and a `loading` boolean. `sendMessage(text)` should:
1. Append the user message and an empty assistant message immediately
2. `POST /api/chat` with `{ message: text }`
3. Read the SSE `ReadableStream` line-by-line; for each `data:` line that isn't `[DONE]`, JSON-parse the chunk and append it to the assistant message's text
4. Set `loading` to false when the stream ends or on error; on error, replace the assistant message with a fallback string

**`ui/src/components/Message.tsx`**

Render a single message bubble:
- User messages: right-aligned, indigo background, white text, `rounded-tr-sm`
- Assistant messages: left-aligned, white background with border/shadow, `rounded-tl-sm`, with a small `CS` avatar circle
- When `message.text` is empty (streaming not started), show three animated bounce dots as a typing indicator
- `whitespace-pre-wrap break-words` on the bubble

**`ui/src/components/ChatWindow.tsx`**

Full-height flex column layout (`h-full`):
1. **Header** — white bar with a `CS` avatar and "Customer Support / Online" label
2. **Message list** — `flex-1 overflow-y-auto`, auto-scrolls to bottom on new messages (`useRef` + `scrollIntoView`)
3. **Empty state** — centered icon, greeting text, and two quick-reply suggestion buttons (`"Where is my order ORD-001?"`, `"I want to refund order ORD-456"`)
4. **Input bar** — `<form>` pinned at bottom; `<textarea>` (single row, max-height 8rem, Enter submits, Shift+Enter newline) + icon send button; both disabled while `loading`

## Conventions
- No `any` types anywhere
- Frontend state only in hooks
- No Redux or Zustand
