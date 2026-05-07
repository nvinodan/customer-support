# customer-support-agent

## What this project does
A customer support agent backend built with Claude on AWS Bedrock via the Strands Agents SDK.
It handles order queries and delegates refunds to a specialist sub-agent using the agent-as-tool pattern.

## Tech stack
- TypeScript, tsx
- @strands-agents/sdk
- Zod for tool input schemas

## How to run
```
npx tsx src/index.ts
```

Requires AWS credentials configured in the environment and `AWS_REGION` set (defaults to `us-west-2`).

## Project structure
- `src/index.ts` — entry point, runs two test queries
- `src/agent.ts` — orchestrator agent, loads system prompt from src/prompt.md
- `src/prompts/prompt.md` — runtime system prompt (loaded at runtime, not hardcoded)
- `src/tools/getOrderStatus.ts` — returns order details by order ID
- `src/tools/initiateRefund.ts` — processes a refund and returns confirmation

## When adding a new tool
1. Create the file in `src/tools/` — export one `ZodTool` instance named after the file
2. Import and add it to the `tools` array in `src/agent.ts`
3. Update `src/prompt.md` to describe the new tool's purpose

## When adding a new sub-agent
1. Create the file in `src/subagents/` — export one `Agent` instance
2. Pass `agent.asTool()` into the `tools` array in `src/agent.ts`
3. Update `src/prompt.md` to describe when to delegate to this sub-agent

## Code conventions
- No `any` types
- System prompt loaded from `src/prompt.md` at runtime — not hardcoded in agent.ts
- Each tool file exports one typed `ZodTool` instance named after the file
- Mock data stays in the tool file, marked with `// TODO: replace with real API call`
- Comments explain WHY, not WHAT
