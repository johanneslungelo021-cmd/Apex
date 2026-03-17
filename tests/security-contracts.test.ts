// tests/security-contracts.test.ts
import { describe, expect, it } from '@jest/globals';
import { APP_VERSION } from '../src/lib/version';
import {
  buildScoutContextMessage,
  estimateOutputTokensFromText,
} from '../src/lib/ai-agent/contracts';
import { parseNdjsonBuffer } from '../src/lib/streaming/ndjson';

describe('security and protocol contracts', () => {
  it('estimates tokens from actual text length, not frame count', () => {
    expect(estimateOutputTokensFromText('1234')).toBe(1);
    expect(estimateOutputTokensFromText('12345678')).toBe(2);
    expect(estimateOutputTokensFromText('')).toBe(0);
  });

  it('parses ndjson stream events with type and data', () => {
    const payload =
      JSON.stringify({ type: 'opportunities', data: [] }) + '\n' +
      JSON.stringify({ type: 'chunk', data: 'hello' }) + '\n' +
      JSON.stringify({ type: 'error', data: 'boom' }) + '\n';

    const { events, remainder } = parseNdjsonBuffer('', payload);

    expect(remainder).toBe('');
    expect(events.map((e) => e.type)).toEqual([
      'opportunities',
      'chunk',
      'error',
    ]);
  });

  it('scout context uses user role to treat external data as untrusted', () => {
    const ctx = buildScoutContextMessage('Opportunity A — https://example.com');
    expect(ctx).not.toBeNull();
    expect(ctx?.role).toBe('user');
    expect(ctx?.content.includes('untrusted reference data')).toBe(true);
  });

  it('uses one shared app version constant', () => {
    expect(APP_VERSION).toBe('4.0.0-pillar4');
  });
});
