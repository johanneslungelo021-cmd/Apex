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

import crypto from "crypto";

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
  return crypto.randomBytes(6).toString("hex");
}

// ─── Structured Logger ────────────────────────────────────────────────────────

/**
 * Log level type for structured logging.
 * Maps to standard syslog severity levels.
 */
type LogLevel = "info" | "warn" | "error" | "debug";

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
  if (entry.level === "error" || entry.level === "warn") {
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
export function envTimeoutMs(
  raw: string | undefined,
  defaultMs: number,
): number {
  const parsed = parseInt(raw ?? "", 10);
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
    return url.protocol === "http:" || url.protocol === "https:";
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
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Simple In-Memory Rate Limiter ────────────────────────────────────────────

/**
 * Internal rate limit entry tracking request counts per window.
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
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Token-bucket style rate limiter keyed by an arbitrary identifier.
 *
 * Provides simple rate limiting for API endpoints to prevent abuse and
 * ensure fair resource allocation. Uses a sliding window algorithm with
 * automatic cleanup of expired entries to prevent unbounded memory growth.
 *
 * Suitable for single-instance deployments. For distributed systems,
 * consider using Redis-backed rate limiting.
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
 *
 * @example
 * // Multiple rate limits for different actions
 * // Allow 5 login attempts per 15 minutes
 * if (!checkRateLimit(`login:${userId}`, 5, 15 * 60 * 1000)) {
 *   return { error: 'Too many login attempts' };
 * }
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Periodic cleanup runs unconditionally so active-but-stale entries are
  // also pruned — not just entries that happen to start a new window.
  // Deletes entries whose window expired more than 2x ago (safely stale).
  if (rateLimitStore.size > 10_000) {
    for (const [k, v] of rateLimitStore) {
      if (now - v.windowStart > windowMs * 2) rateLimitStore.delete(k);
    }
  }

  // No entry or window expired — start a fresh window
  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return true;
  }

  // Within current window — check limit then increment
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}
