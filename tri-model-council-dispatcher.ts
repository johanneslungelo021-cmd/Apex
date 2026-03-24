/**
 * SuperZ + Numerai Tri-Model Council Dispatcher
 * Sends tasks to the n8n webhook for DeepSeek-R1 + Qwen3 + Kimi K2 consensus.
 *
 * Usage:
 *   const result = await consultTriModelCouncil("PR_Audit", "Moltcorp", { raw_code_diff: "..." });
 *   const result = await consultTriModelCouncil("Model_Optimization", "Numerai", { hyperparams: {...} });
 *
 * NEVER commit secrets — set N8N_WEBHOOK_URL in your environment.
 */

interface TriModelRequest {
  target_platform: 'Moltcorp' | 'Numerai';
  task_type:       'PR_Audit' | 'Bounty_Execution' | 'Model_Optimization' | 'Security_Review' | 'general';
  raw_data:        Record<string, unknown> | string;
  context?:        string;
}

interface ModelResult {
  model:       string;
  score:       number;
  words:       number;
  duration_ms: number;
  timed_out:   boolean;
}

interface TriModelResponse {
  status:           'APPROVED' | 'REJECTED' | 'FALLBACK';
  platform:         string;
  hard_fail:        boolean;
  fallback_used:    boolean;
  winning_model:    string;
  response:         string;
  confidence_score: number;
  all_models:       ModelResult[];
  timestamp:        string;
}

export async function consultTriModelCouncil(
  taskType:    TriModelRequest['task_type'],
  platform:    TriModelRequest['target_platform'],
  payloadData: TriModelRequest['raw_data'],
  context?:    string,
): Promise<TriModelResponse> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('N8N_WEBHOOK_URL environment variable is not set');

  const body: TriModelRequest = {
    target_platform: platform,
    task_type:       taskType,
    raw_data:        payloadData,
    context: context ?? (
      platform === 'Numerai'
        ? 'Reference: https://numer.ai/. Goal: Maximise MMC and NMR staking yield.'
        : 'Reference: Moltcorp Bounties. Goal: Zero-friction deployment and credit farming.'
    ),
  };

  const response = await fetch(webhookUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Tri-Model Council webhook failed: HTTP ${response.status}`);
  }

  return response.json() as Promise<TriModelResponse>;
}

// ── Example: SuperZ claims a Moltcorp PR audit ──────────────────────
// const result = await consultTriModelCouncil('PR_Audit', 'Moltcorp', {
//   raw_code_diff:       '<diff string here>',
//   superz_initial_scan: 'No obvious syntax errors found',
// });
// if (result.hard_fail) { console.error('COUNCIL REJECTED:', result.response); }
// else { console.log('COUNCIL APPROVED via', result.winning_model); }

// ── Example: Numerai weekly tournament prep ──────────────────────────
// const result = await consultTriModelCouncil('Model_Optimization', 'Numerai', {
//   hyperparams: { n_estimators: 2000, max_depth: 5, learning_rate: 0.01 },
//   feature_count: 42,
//   current_mmc: 0.032,
// });
