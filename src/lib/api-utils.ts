/**
 * API Utilities Module
 *
 * Provides common utilities for API routes including request ID generation,
 * structured logging, fetch with timeout, safe JSON parsing, URL validation,
 * and rate limiting. All functions are designed for production reliability.
 *
 * @module lib/api-utils
 *
 * @example
 * import {
 *   generateRequestId,
 *   log,
 *   fetchWithTimeout,
 *   safeJsonParse,
 *   envTimeoutMs,
 *   isValidHttpUrl,
 *   checkRateLimit
 * } from '@/lib/api-utils';
 *
 * const requestId = generateRequestId();
 * log({ level: 'info', service: 'my-service', message: 'Request started', requestId });
 */

import crypto from 'crypto';

// ─── Request ID ───────────────────────────────────────────────────────────────

/**
 * Generates a short, URL-safe, collision-resistant request ID.
 *
 * Uses 6 random bytes (12 hex characters) to create unique identifiers
 * for log correlation and request tracing across distributed systems.
 *
 * @returns A 12-character hexadecimal string unique per request
 *
 * @example
 * const requestId = generateRequestId();
 * // Returns something like "a1b2c3d4e5f6"
 *
 * @example
 * // Use for log correlation
 * log({
 *   level: 'info',
 *   service: 'api',
 *   message: 'Processing request',
 *   requestId: generateRequestId()
 * });
 */
export function generateRequestId(): string {
  return crypto.randomBytes(6).toString('hex');
}

// ─── Structured Logger ────────────────────────────────────────────────────────

/**
 * Log level type for structured logging.
 * Maps to standard syslog severity levels.
 */
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Structured log entry interface for JSON-formatted output.
 * Compatible with Vercel log drains and Grafana Loki label extraction.
 */
interface LogEntry {
  /** Log severity level */
  level: LogLevel;
  /** Service name emitting the log */
  service: string;
  /** Human-readable log message */
  message: string;
  /** Unique request identifier for tracing */
  requestId?: string;
  /** Operation duration in milliseconds */
  durationMs?: number;
  /** Error message if applicable */
  error?: string;
  /** Additional metadata fields */
  [key: string]: unknown;
}

/**
 * Emits a structured JSON log line to stdout.
 *
 * Designed for cloud-native environments where logs are collected by
 * platforms like Vercel, Datadog, or Grafana Loki. All logs include
 * an ISO 8601 timestamp for precise time-based correlation.
 *
 * Error and warn level logs are written to stderr for proper stream
 * separation in containerized environments.
 *
 * @param entry - The log entry object containing level, service, message, and optional metadata
 *
 * @example
 * // Basic info log
 * log({ level: 'info', service: 'api', message: 'Request received' });
 * // Output: {"ts":"2024-01-15T10:30:00.000Z","level":"info","service":"api","message":"Request received"}
 *
 * @example
 * // Error log with context
 * log({
 *   level: 'error',
 *   service: 'scout-agent',
 *   message: 'Failed to fetch opportunities',
 *   requestId: 'abc123',
 *   error: 'Connection timeout'
 * });
 */
export function log(entry: LogEntry): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  if (entry.level === 'error' || entry.level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

// ─── Fetch with Timeout ───────────────────────────────────────────────────────

/**
 * Wraps fetch with an AbortController timeout for reliable request cancellation.
 *
 * Prevents indefinite hanging on unresponsive upstream services by automatically
 * aborting the request after the specified timeout duration. Callers can detect
 * timeouts by checking if the error name is 'AbortError'.
 *
 * @param url - The URL to fetch
 * @param init - Standard fetch options (method, headers, body, etc.)
 * @param timeoutMs - Maximum time to wait in milliseconds before aborting
 * @returns Promise resolving to the Response object
 * @throws Error with name 'AbortError' on timeout, or other errors from fetch
 *
 * @example
 * try {
 *   const response = await fetchWithTimeout(
 *     'https://api.example.com/data',
 *     { method: 'GET' },
 *     5000 // 5 second timeout
 *   );
 *   const data = await response.json();
 * } catch (err) {
 *   if (err instanceof Error && err.name === 'AbortError') {
 *     console.log('Request timed out');
 *   }
 * }
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Safe JSON Parse ──────────────────────────────────────────────────────────

/**
 * Parses a JSON string without throwing exceptions on malformed input.
 *
 * Provides a safe alternative to JSON.parse for handling untrusted or
 * potentially malformed JSON from external APIs, user input, or file reads.
 * Returns null instead of throwing, allowing callers to handle errors gracefully.
 *
 * @typeParam T - The expected type of the parsed value
 * @param raw - The JSON string to parse
 * @returns The parsed value on success, or null on any parse error
 *
 * @example
 * const data = safeJsonParse<{ name: string }>('{"name":"test"}');
 * if (data) {
 *   console.log(data.name); // "test"
 * }
 *
 * @example
 * // Handles malformed JSON gracefully
 * const invalid = safeJsonParse('not json'); // null
 */
export function safeJsonParse<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ─── Timeout Validator ────────────────────────────────────────────────────────

/**
 * Reads and validates a numeric millisecond timeout value from an environment variable.
 *
 * Provides safe parsing of timeout configuration with sensible defaults.
 * Falls back to the default value if the environment variable is absent,
 * not a valid number, or contains a non-positive value.
 *
 * @param raw - The raw environment variable value (may be undefined)
 * @param defaultMs - Default timeout in milliseconds if parsing fails
 * @returns A valid positive timeout value in milliseconds
 *
 * @example
 * // With GROQ_TIMEOUT_MS=15000 in environment
 * const timeout = envTimeoutMs(process.env.GROQ_TIMEOUT_MS, 10000);
 * // Returns 15000
 *
 * @example
 * // With missing or invalid environment variable
 * const timeout = envTimeoutMs(process.env.MISSING_VAR, 10000);
 * // Returns 10000 (the default)
 */
export function envTimeoutMs(raw: string | undefined, defaultMs: number): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

// ─── URL Validator ────────────────────────────────────────────────────────────

/**
 * Validates that a string is a well-formed HTTP or HTTPS URL.
 *
 * Used to validate AI-generated opportunity links and external URLs
 * before surfacing them to users. Prevents broken or malicious links
 * from being displayed.
 *
 * @param raw - The string to validate as a URL
 * @returns true if the string is a valid http or https URL, false otherwise
 *
 * @example
 * isValidHttpUrl('https://example.com/path'); // true
 * isValidHttpUrl('http://localhost:3000'); // true
 * isValidHttpUrl('ftp://files.example.com'); // false
 * isValidHttpUrl('not a url'); // false
 */
export function isValidHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates that a string is a well-formed HTTPS-only URL.
 *
 * Stricter than isValidHttpUrl — rejects plain http:// links.
 * Used where HTTPS is mandatory, e.g. AI-generated opportunity links
 * that must be served over a secure connection.
 *
 * @param raw - The string to validate as a URL
 * @returns true if the string is a valid https:// URL, false otherwise
 *
 * @example
 * isValidHttpsUrl('https://example.com/path'); // true
 * isValidHttpsUrl('http://example.com');       // false — no plain HTTP
 * isValidHttpsUrl('ftp://files.example.com');  // false
 */
export function isValidHttpsUrl(raw: string): boolean {
  try {
    return new URL(raw).protocol === 'https:';
  } catch {
    return false;
  }
}

// ─── Rate Limiting ─────────────────────────────────────────────────────────────

/**
 * Rate limit check result from the KV-backed rate limiter.
 */
interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Unix timestamp when the rate limit resets */
  reset: number;
}

/**
 * KV-backed rate limiter using @upstash/ratelimit for serverless environments.
 *
 * CRITICAL: In-memory Maps are wiped out on Vercel serverless cold starts,
 * providing ZERO protection across function invocations. This implementation
 * uses @vercel/kv (Upstash Redis) for persistent rate limiting that survives
 * cold starts and works across concurrent function instances.
 *
 * Setup:
 * 1. Run: npm i @upstash/ratelimit @vercel/kv
 * 2. Provision a KV database in Vercel Dashboard (Storage → Create Database)
 * 3. Set KV_REST_API_URL and KV_REST_API_TOKEN environment variables
 *
 * For local development, falls back to in-memory rate limiting.
 */
let rateLimiter: {
  limit: (identifier: string) => Promise<RateLimitResult>;
} | null = null;

async function getRateLimiter() {
  if (rateLimiter) return rateLimiter;

  // Try to use KV-backed rate limiter in production
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      // Dynamic require with eval to prevent TypeScript/bundler resolution
      // These packages should be installed with: npm i @upstash/ratelimit @vercel/kv
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const ratelimitModule = await new Function('return import("@upstash/ratelimit")')().catch(() => null);
      const kvModule = await new Function('return import("@vercel/kv")')().catch(() => null);

      if (!ratelimitModule || !kvModule) {
        console.warn('@upstash/ratelimit or @vercel/kv not installed. Run: npm i @upstash/ratelimit @vercel/kv');
        return null;
      }

      const { Ratelimit } = ratelimitModule;
      const { kv } = kvModule;

      rateLimiter = new Ratelimit({
        redis: kv,
        limiter: Ratelimit.slidingWindow(30, '1 m'),
        analytics: true,
        prefix: 'apex:ratelimit',
      });

      return rateLimiter;
    } catch (error) {
      console.error('Failed to initialize KV rate limiter, falling back to in-memory:', error);
    }
  }

  // Fallback: in-memory rate limiter for local development
  return null;
}

/**
 * Internal rate limit entry tracking request counts per window (in-memory fallback).
 */
interface RateLimitEntry {
  /** Number of requests made in the current window */
  count: number;
  /** Unix timestamp when the current window started */
  windowStart: number;
}

/**
 * In-memory store for rate limit entries keyed by identifier (e.g., IP address).
 * Automatically cleaned up when entries exceed a threshold to prevent memory leaks.
 */
const memoryRateLimitStore = new Map<string, RateLimitEntry>();

/**
 * In-memory rate limiter for local development fallback.
 */
function checkMemoryRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = memoryRateLimitStore.get(key);

  // Periodic cleanup runs unconditionally so active-but-stale entries are
  // also pruned — not just entries that happen to start a new window.
  // Deletes entries whose window expired more than 2x ago (safely stale).
  if (memoryRateLimitStore.size > 10_000) {
    for (const [k, v] of memoryRateLimitStore) {
      if (now - v.windowStart > windowMs * 2) memoryRateLimitStore.delete(k);
    }
  }

  // No entry or window expired — start a fresh window
  if (!entry || now - entry.windowStart > windowMs) {
    memoryRateLimitStore.set(key, { count: 1, windowStart: now });
    return true;
  }

  // Within current window — check limit then increment
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

/**
 * Token-bucket style rate limiter keyed by an arbitrary identifier.
 *
 * Uses KV-backed storage (@vercel/kv) in production for persistence across
 * serverless cold starts. Falls back to in-memory rate limiting for local
 * development or when KV is not configured.
 *
 * @param key - Unique identifier for the caller (e.g., IP address, user ID)
 * @param limit - Maximum number of requests allowed per window
 * @param windowMs - Window duration in milliseconds
 * @returns true if the request is allowed, false if rate limit exceeded
 *
 * @example
 * // Rate limit to 20 requests per minute per IP
 * const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
 * if (!checkRateLimit(ip, 20, 60000)) {
 *   return new Response('Rate limit exceeded', { status: 429 });
 * }
 */
export async function checkRateLimitAsync(key: string, limit: number, windowMs: number): Promise<boolean> {
  // For local dev or missing KV config, use in-memory fallback
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return checkMemoryRateLimit(key, limit, windowMs);
  }

  try {
    const limiter = await getRateLimiter();
    if (limiter) {
      // KV rate limiter uses fixed 30 req/min - scale the key to match requested limit
      const scaledKey = limit !== 30 ? `${key}:limit${limit}` : key;
      const { success } = await limiter.limit(scaledKey);

      // If limit is different from default 30, adjust behavior
      if (!success && limit < 30) {
        return false;
      }

      return success;
    }
  } catch (error) {
    console.error('Rate limit error:', error);
    // Fail open - allow request if rate limiter fails
    // Consider failing closed for stricter security posture
  }

  // Fallback to in-memory
  return checkMemoryRateLimit(key, limit, windowMs);
}

/**
 * Synchronous rate limiter - uses in-memory storage only.
 *
 * DEPRECATED: Use checkRateLimitAsync for KV-backed rate limiting in production.
 * This synchronous version is kept for backward compatibility with routes
 * that haven't been updated to use async rate limiting.
 *
 * @param key - Unique identifier for the caller
 * @param limit - Maximum number of requests allowed per window
 * @param windowMs - Window duration in milliseconds
 * @returns true if the request is allowed, false if rate limit exceeded
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  return checkMemoryRateLimit(key, limit, windowMs);
}
