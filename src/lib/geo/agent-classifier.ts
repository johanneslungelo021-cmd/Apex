/**
 * GEO Agent Classifier
 *
 * Classifies incoming HTTP user agents into four categories:
 * - human: browsers and unrecognised clients
 * - dataScraper: crawlers building AI training datasets
 * - searchCrawler: crawlers indexing content for AI search engines
 * - assistant: AI assistants fetching pages in response to user prompts
 *
 * Drives content-negotiation in middleware.ts and the Markdown shadow-route.
 *
 * @module lib/geo/agent-classifier
 */

export type AgentRole = 'human' | 'dataScraper' | 'searchCrawler' | 'assistant';

export interface ClassifiedAgent {
  role: AgentRole;
  name: string;
}

// ─── Known Agent Strings ──────────────────────────────────────────────────────

const DATA_SCRAPERS: readonly string[] = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'Bytespider',
  'CCBot',
  'FacebookBot',
  'Amazonbot',
  'Applebot-Extended',
  'cohere-training-data-crawler',
  'anthropic-ai',
  'omgili',
  'omgilibot',
  'PetalBot',
  'AdsBot',
];

const SEARCH_CRAWLERS: readonly string[] = [
  'PerplexityBot',
  'BingPreview',
  'YouBot',
  'BraveSoftware',
  'DuckDuckBot',
];

const ASSISTANTS: readonly string[] = [
  'ChatGPT-User',
  'Claude-User',
  'Claude-SearchBot',
  'Perplexity-User',
  'Gemini-Deep-Research',
  'DuckAssistBot',
  'meta-externalagent',
  'Operator',
];

// ─── Accept-Header Markdown Signals ──────────────────────────────────────────

const MARKDOWN_ACCEPT_TYPES = ['text/markdown', 'text/x-markdown'] as const;

// ─── Classifier ───────────────────────────────────────────────────────────────

/**
 * Classify a request's user agent and Accept header.
 *
 * @param userAgent - Value of the User-Agent header (may be empty string)
 * @param accept    - Value of the Accept header (may be empty string)
 * @returns         - Role classification and resolved agent name
 */
export function classifyAgent(
  userAgent: string,
  accept: string = ''
): ClassifiedAgent {
  const ua = userAgent ?? '';
  const acc = accept ?? '';

  for (const agent of ASSISTANTS) {
    if (ua.includes(agent)) return { role: 'assistant', name: agent };
  }
  for (const agent of SEARCH_CRAWLERS) {
    if (ua.includes(agent)) return { role: 'searchCrawler', name: agent };
  }
  for (const agent of DATA_SCRAPERS) {
    if (ua.includes(agent)) return { role: 'dataScraper', name: agent };
  }

  // Explicit Markdown Accept header — treat as machine client even if UA unknown
  if (MARKDOWN_ACCEPT_TYPES.some((t) => acc.includes(t))) {
    return { role: 'assistant', name: 'markdown-accept' };
  }

  return { role: 'human', name: 'browser' };
}

/**
 * Returns true when the agent should receive the Markdown shadow response.
 * Both AI assistants and search crawlers benefit from pre-rendered Markdown.
 */
export function wantsMarkdown(agent: ClassifiedAgent): boolean {
  return agent.role === 'assistant' || agent.role === 'searchCrawler';
}

/**
 * Returns true when the agent is a training-data scraper.
 * Used for differential crawl-delay handling in headers.
 */
export function isDataScraper(agent: ClassifiedAgent): boolean {
  return agent.role === 'dataScraper';
}
