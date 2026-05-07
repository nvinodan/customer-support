import { ZodTool } from '@strands-agents/sdk';
import { z } from 'zod';
import {
  BedrockAgentCoreClient,
  GetResourceApiKeyCommand,
  GetWorkloadAccessTokenCommand,
} from '@aws-sdk/client-bedrock-agentcore';

const CREDENTIAL_PROVIDER_NAME = process.env.CREDENTIAL_PROVIDER_NAME;
const WORKLOAD_NAME = process.env.WORKLOAD_NAME;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

const identityClient = CREDENTIAL_PROVIDER_NAME
  ? new BedrockAgentCoreClient({ region: AWS_REGION })
  : null;

let currentWorkloadToken = '';

export function setWorkloadToken(token: string): void {
  currentWorkloadToken = token;
}

type TavilyResult = { title: string; url: string; content: string };
type TavilyResponse = { answer?: string; results: TavilyResult[] };

async function resolveWorkloadToken(): Promise<string | null> {
  if (currentWorkloadToken) return currentWorkloadToken;

  if (!identityClient || !WORKLOAD_NAME) return null;

  const response = await identityClient.send(
    new GetWorkloadAccessTokenCommand({ workloadName: WORKLOAD_NAME })
  );
  const token = response.workloadAccessToken ?? null;
  if (token) currentWorkloadToken = token;
  return token;
}

async function getTavilyApiKey(): Promise<string | null> {
  // Local dev: use direct API key env var
  if (TAVILY_API_KEY) return TAVILY_API_KEY;

  // Production: retrieve from AgentCore Identity
  if (!identityClient || !CREDENTIAL_PROVIDER_NAME) return null;

  const token = await resolveWorkloadToken();
  if (!token) return null;

  const response = await identityClient.send(
    new GetResourceApiKeyCommand({
      workloadIdentityToken: token,
      resourceCredentialProviderName: CREDENTIAL_PROVIDER_NAME,
    })
  );
  return response.apiKey ?? null;
}

export const searchNews = new ZodTool({
  name: 'searchNews',
  description:
    'Searches current news for shipping-related events (weather disruptions, port closures, carrier delays) that could affect order delivery.',
  inputSchema: z.object({
    query: z.string().describe('Search query about shipping events (e.g. "shipping delays US east coast")'),
  }),
  callback: async ({ query }) => {
    let apiKey: string | null;
    try {
      apiKey = await getTavilyApiKey();
    } catch (err) {
      console.error('[searchNews] Failed to retrieve API key:', err);
      return { result: 'Unable to search news — identity service unavailable.' };
    }

    if (!apiKey) {
      console.log('[searchNews] Skipped — credential provider not configured or no workload token');
      return { result: 'Unable to search news — credential provider not configured.' };
    }

    try {
      const resp = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: 'basic',
          max_results: 5,
          include_answer: true,
        }),
      });

      if (!resp.ok) {
        console.error(`[searchNews] Tavily API returned ${resp.status}`);
        return { result: 'Unable to search news — search service error.' };
      }

      const data = (await resp.json()) as TavilyResponse;

      const summary = data.answer ? `Summary: ${data.answer}\n\n` : '';
      const articles = data.results
        .map(r => `- ${r.title}: ${r.content.slice(0, 200)}`)
        .join('\n');

      return { result: `${summary}${articles || 'No relevant results found.'}` };
    } catch (err) {
      console.error('[searchNews] Tavily request failed:', err);
      return { result: 'Unable to search news — request failed.' };
    }
  },
});
