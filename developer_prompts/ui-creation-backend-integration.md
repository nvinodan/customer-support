
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

**`ui/vite.config.ts`**
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
```

**`ui/src/hooks/useChat.ts`**

```ts
import { useState, useCallback } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text };
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', text: '' }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          const chunk: string = JSON.parse(payload);
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + chunk } : m))
          );
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, text: 'Sorry, something went wrong.' } : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  return { messages, loading, sendMessage };
}
```

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

**`ui/src/App.tsx`**
```tsx
import './index.css';
import { ChatWindow } from './components/ChatWindow';
export default function App() { return <ChatWindow />; }
```

**`ui/src/index.css`** — import Tailwind:
```css
@import "tailwindcss";
```

## Conventions
- No `any` types anywhere
- Frontend state only in hooks
- No Redux or Zustand
