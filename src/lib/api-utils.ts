/**
 * API Utilities Module
 *
 * Production-ready utility functions for the Apex platform.
 * Provides logging, fetch with timeout, JSON parsing, rate limiting,
 * and environment configuration helpers.
 *
 * @module lib/api-utils
 *
 * @example
 * import { log, generateRequestId, fetchWithTimeout, checkRateLimit } from '@/lib/api-utils';
 *
 * const requestId = generateRequestId();
 * log({ level: 'info', service: 'my-service', message: 'Request started', requestId });
 */

import crypto from 'crypto';

// ─── Request ID ───────────────────────────────────────────────────────────────

/**
 * Generates a short, URL-safe, collision-resistant request ID.
 * Uses 6 random bytes converted to 12 hex characters.
 *
 * @returns A 12-character hex string suitable for log correlation
 *
 * @example
 * const requestId = generateRequestId(); // "a3f2c9e8b1d4"
 */
export function generateRequestId(): string {
  return crypto.randomBytes(6).toString('hex');
}

// ─── Structured Logger ────────────────────────────────────────────────────────

/** Supported log levels for structured logging */
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Structured log entry compatible with Vercel log drains and Grafana Loki.
 */
interface LogEntry {
  /** Log severity level */
  level: LogLevel;
  /** Service name for log aggregation */
  service: string;
  /** Human-readable log message */
  message: string;
  /** Request correlation ID */
  requestId?: string;
  /** Operation duration in milliseconds */
  durationMs?: number;
  /** Error message for error logs */
  error?: string;
  /** Additional context fields */
  [key: string]: unknown;
}

/**
 * Emits a structured JSON log line to stdout.
 * Compatible with Vercel log drains and Grafana Loki label extraction.
 *
 * Error and warn logs go to stderr, all others to stdout.
 *
 * @param entry - The log entry to emit
 *
 * @example
 * log({ level: 'info', service: 'scout-agent', message: 'Agent started', requestId: 'abc123' });
 * // stdout: {"ts":"2024-01-15T10:30:00.000Z","level":"info","service":"scout-agent","message":"Agent started","requestId":"abc123"}
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
 * Wraps fetch with an AbortController timeout.
 * Throws with name 'AbortError' on timeout — callers can detect this specifically.
 *
 * @param url - The URL to fetch
 * @param init - Standard fetch request init options
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise resolving to the Response object
 * @throws AbortError if the request times out
 *
 * @example
 * try {
 *   const response = await fetchWithTimeout('https://api.example.com', {}, 5000);
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
 * Parses a JSON string without throwing.
 * Returns the parsed value on success, or null on any parse error.
 *
 * @typeParam T - The expected type of the parsed value
 * @param raw - The JSON string to parse
 * @returns The parsed value or null if parsing fails
 *
 * @example
 * const data = safeJsonParse<MyType>('{"key": "value"}');
 * if (data) {
 *   console.log(data.key);
 * }
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
 * Reads a numeric millisecond value from an env var string.
 * Falls back to defaultMs if the value is absent, NaN, or non-positive.
 *
 * @param raw - The raw environment variable value
 * @param defaultMs - Default timeout in milliseconds
 * @returns A valid positive timeout value
 *
 * @example
 * const timeout = envTimeoutMs(process.env.AI_TIMEOUT_MS, 10000);
 * // Returns parsed value or 10000 if invalid/missing
 */
export function envTimeoutMs(raw: string | undefined, defaultMs: number): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

// ─── URL Validator ────────────────────────────────────────────────────────────

/**
 * Returns true if the string is a well-formed http or https URL.
 * Used to validate AI-generated opportunity links before surfacing to users.
 *
 * @param raw - The string to validate as a URL
 * @returns True if the string is a valid HTTP/HTTPS URL
 *
 * @example
 * isValidHttpUrl('https://example.com'); // true
 * isValidHttpUrl('ftp://files.example.com'); // false
 * isValidHttpUrl('not-a-url'); // false
 */
export function isValidHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// ─── Simple In-Memory Rate Limiter ────────────────────────────────────────────

/**
 * Internal rate limit entry tracking requests per window.
 */
interface RateLimitEntry {
  /** Number of requests in current window */
  count: number;
  /** Window start timestamp in milliseconds */
  windowStart: number;
}

/** In-memory store for rate limit entries */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Token-bucket style rate limiter keyed by an arbitrary identifier (e.g. IP).
 * Cleans up expired entries automatically to prevent unbounded memory growth.
 *
 * @param key - Unique identifier for the caller (e.g. IP address)
 * @param limit - Max requests allowed per window
 * @param windowMs - Window duration in milliseconds
 * @returns True if the request is allowed, false if rate-limited
 *
 * @example
 * // Allow 20 requests per minute per IP
 * if (!checkRateLimit(clientIp, 20, 60000)) {
 *   return res.status(429).json({ error: 'Rate limited' });
 * }
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    // Periodic cleanup: remove expired entries older than 2x window
    if (rateLimitStore.size > 10_000) {
      for (const [k, v] of rateLimitStore) {
        if (now - v.windowStart > windowMs * 2) rateLimitStore.delete(k);
      }
    }
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}
