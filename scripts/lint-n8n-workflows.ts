#!/usr/bin/env bun
/**
 * n8n Workflow JSON Linter
 *
 * Validates n8n workflow JSON files for:
 * - Valid JSON syntax
 * - Required nodes present
 * - Embedding dimensions hardcoded to 768
 * - No hardcoded fallback URLs
 * - Proper credential references
 * - Model ID consistency
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

interface ValidationResult {
  file: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

interface N8nNode {
  id: string;
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
}

interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  _validation?: {
    embeddingDimension?: number;
    ollamaBaseUrl?: string;
    notes?: string[];
  };
}

const EXPECTED_EMBEDDING_DIM = 768;
const ALLOWED_OLLAMA_URLS = [
  'http://localhost:11434',
  'http://host.docker.internal:11434',
  'http://127.0.0.1:11434',
];

const REQUIRED_MODEL_IDS = ['deepseek-v3.2', 'qwen3.5:397b', 'kimi-k2'];
const DEPRECATED_MODEL_IDS = ['qwen3', 'qwen2.5', 'deepseek-v3']; // Without proper version suffix

function lintWorkflow(filePath: string): ValidationResult {
  const result: ValidationResult = {
    file: basename(filePath),
    passed: true,
    errors: [],
    warnings: [],
  };

  // Check file exists
  if (!existsSync(filePath)) {
    result.passed = false;
    result.errors.push(`File does not exist: ${filePath}`);
    return result;
  }

  // Parse JSON
  let workflow: N8nWorkflow;
  try {
    const content = readFileSync(filePath, 'utf-8');
    workflow = JSON.parse(content);
  } catch (e) {
    result.passed = false;
    result.errors.push(`Invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}`);
    return result;
  }

  // Check for nodes
  if (!workflow.nodes || workflow.nodes.length === 0) {
    result.passed = false;
    result.errors.push('No nodes defined in workflow');
    return result;
  }

  // Check for connections
  if (!workflow.connections || Object.keys(workflow.connections).length === 0) {
    result.passed = false;
    result.errors.push('No connections defined in workflow');
  }

  // Check embedding dimension
  const jsonStr = JSON.stringify(workflow);
  if (jsonStr.includes('vector(768)') || jsonStr.includes('"embeddingDimension": 768')) {
    // Good - 768 dimension found
  } else if (jsonStr.includes('vector(') && !jsonStr.includes('vector(768)')) {
    result.passed = false;
    result.errors.push(`Wrong embedding dimension - expected ${EXPECTED_EMBEDDING_DIM}`);
  }

  // Check for hardcoded api.ollama.com
  if (jsonStr.includes('api.ollama.com') && !jsonStr.includes('$env.OLLAMA_BASE_URL')) {
    result.passed = false;
    result.errors.push('Hardcoded api.ollama.com URL - should use OLLAMA_BASE_URL environment variable');
  }

  // Check model IDs
  for (const deprecated of DEPRECATED_MODEL_IDS) {
    if (jsonStr.includes(`"${deprecated}"`) || jsonStr.includes(`'${deprecated}'`)) {
      result.warnings.push(`Deprecated model ID "${deprecated}" found - verify correct version`);
    }
  }

  // Check for required nodes
  const nodeTypes = workflow.nodes.map(n => n.type);
  const hasWebhook = nodeTypes.some(t => t.includes('webhook'));
  const hasResponse = nodeTypes.some(t => t.includes('respondToWebhook') || t.includes('httpResponse'));

  if (!hasWebhook) {
    result.warnings.push('No webhook node found - workflow may not be triggerable');
  }

  if (!hasResponse) {
    result.warnings.push('No response node found - workflow may not return results');
  }

  // Check for proper credential usage
  const nodesWithUrls = workflow.nodes.filter(n =>
    n.parameters?.url && typeof n.parameters.url === 'string'
  );

  for (const node of nodesWithUrls) {
    const url = node.parameters!.url as string;
    if (url.includes('supabase') && !url.includes('$env.SUPABASE_URL')) {
      result.warnings.push(`Node "${node.name}" has hardcoded Supabase URL`);
    }
  }

  // Check for embedding validation code
  const codeNodes = workflow.nodes.filter(n => n.type.includes('code'));
  let hasEmbeddingValidation = false;

  for (const node of codeNodes) {
    const code = node.parameters?.jsCode as string || '';
    if (code.includes('embedding.length !== 768') || code.includes('768 dimensions')) {
      hasEmbeddingValidation = true;
      break;
    }
  }

  if (!hasEmbeddingValidation && jsonStr.includes('embedding')) {
    result.warnings.push('No 768-dim embedding validation found in code nodes');
  }

  // Check for console.error in fallback logic
  let hasFallbackLogging = false;
  for (const node of codeNodes) {
    const code = node.parameters?.jsCode as string || '';
    if (code.includes('console.error') && (code.includes('fallback') || code.includes('timed out'))) {
      hasFallbackLogging = true;
      break;
    }
  }

  if (!hasFallbackLogging) {
    result.warnings.push('No console.error logging for fallback scenarios - errors may be swallowed silently');
  }

  return result;
}

function main() {
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('  n8n Workflow JSON Linter');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('');

  const projectRoot = process.cwd();
  const files = readdirSync(projectRoot).filter(f => f.startsWith('n8n_') && f.endsWith('.json'));

  if (files.length === 0) {
    console.log('⚠️  No n8n workflow files found (n8n_*.json)');
    process.exit(0);
  }

  console.log(`Found ${files.length} workflow file(s) to lint:\n`);

  let totalErrors = 0;
  let totalWarnings = 0;
  const results: ValidationResult[] = [];

  for (const file of files) {
    const filePath = join(projectRoot, file);
    const result = lintWorkflow(filePath);
    results.push(result);

    console.log(`📄 ${file}`);
    console.log('   ' + '─'.repeat(60));

    if (result.errors.length > 0) {
      console.log('   Errors:');
      for (const err of result.errors) {
        console.log(`   ❌ ${err}`);
      }
      totalErrors += result.errors.length;
    }

    if (result.warnings.length > 0) {
      console.log('   Warnings:');
      for (const warn of result.warnings) {
        console.log(`   ⚠️  ${warn}`);
      }
      totalWarnings += result.warnings.length;
    }

    if (result.errors.length === 0 && result.warnings.length === 0) {
      console.log('   ✅ All checks passed');
    }

    console.log('');
  }

  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('════════════════════════════════════════════════════════════════════════════');

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);

  console.log(`✅ Passed: ${passed.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  console.log(`⚠️  Total errors: ${totalErrors}`);
  console.log(`⚠️  Total warnings: ${totalWarnings}`);
  console.log('');

  if (failed.length > 0) {
    console.log('❌ Linting failed - fix errors before committing');
    process.exit(1);
  } else {
    console.log('✅ All workflows passed validation!');
    process.exit(0);
  }
}

main();
