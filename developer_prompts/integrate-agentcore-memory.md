# Integrate AgentCore Memory with the Runtime

## Goal

Give the agent memory within a single chat session so it maintains conversational context across multiple turns in the same session window.

---

## Context

The agent is deployed as an AgentCore runtime. Each invocation is stateless — the agent doesn't know what the user said earlier in the same conversation. The UI maintains a chat window, but the backend treats every message as independent.

AgentCore Memory can store and retrieve facts scoped to a session, giving the agent continuity within a conversation.

Use the `/agentcore-memory` skill for the SDK commands, input shapes, and integration pattern.

---

## What Needs to Happen

### 1. Update `deploy.sh` to Create Memory

Add steps to the existing deploy script that:
- Create an AgentCore Memory resource in the AWS account
- Attach memory IAM permissions to the runtime execution role
- Create/Update the runtime with the `MEMORY_ID` environment variable
- Handle idempotency (no-op if memory already exists)

### 2. Store Each Turn in Session Memory

After the agent responds, store the user's message and the agent's reply into AgentCore Memory, namespaced to the current session ID. Keep it simple — store the raw exchange, not extracted facts.

### 3. Retrieve Session Context Before Each Invocation

Before invoking the agent, retrieve recent memories for the current session and inject them as conversational context so the agent knows what was discussed earlier in this chat window.

### 4. Namespace by Session Only

Scope all memory to the session ID from the request. No cross-session or user-level memory — each chat window is self-contained.

---

## What NOT to Change

- The agent's tools and sub-agent logic
- The system prompt content
- The AgentCore contract (`/ping`, `/invocations` format)
- Streaming behavior

---

## Definition of Done

- `deploy.sh` creates the memory resource and configures the runtime
- The agent remembers what was said earlier in the same chat session
- Each session's memory is isolated — no bleed between different chat windows
- Memory write failures do not break the response
- If memory is unavailable, the agent still works (just without prior context)
