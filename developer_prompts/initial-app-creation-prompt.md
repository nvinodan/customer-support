Create a customer support agent for an e-commerce store using Strands Agents SDK.
This is a backend Node.js project with TypeScript.

The customer support agent will answer queries on orders.

## Project structure
Refer to CLAUDE.md for the full project structure. 

## Tech stack
- @strands-agents/sdk
- Model: Claude Sonnet 4 via Amazon Bedrock (anthropic.claude-sonnet-4-5)
- Region from process.env.AWS_REGION
- Zod for tool input schemas
- tsx to run TypeScript directly

## Business Logic
- Customer asks about an order → agent calls getOrderStatus tool
- If status is "in_transit" or "delivered" → agent replies directly
- If status is "delayed" or "lost" → agent delegates to the refund sub-agent
- The refund sub-agent is wired using Strands' `agent` function so the orchestrator can invoke it as a tool (agent-as-tool pattern)
- Refund sub-agent calls initiateRefund tool and confirms a 3–5 business day timeline

## Mock data
- Mock order data lives in src/data/orders.json
- getOrderStatus reads from this file at runtime
- Mark the read call with // TODO: replace with real API call

## Sub-agent: doc-writer
- Location: .claude/agents/doc-writer.md
- Purpose: documents any file under src/
- Output format: JSDoc comments on all exported functions, plus a brief top-of-file summary comment explaining the module's role
- Should not modify logic, only add or update comments

## Conventions
- No `any` types
- System prompt loaded from src/prompt.md at runtime
- CLAUDE.md contains developer instructions only, not the runtime prompt
- Each tool file exports exactly one typed function
- Mock data marked with // TODO: replace with real API call

## Run command
npx tsx src/index.ts