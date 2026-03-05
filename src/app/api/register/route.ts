/**
 * User Registration API Endpoint
 *
 * Handles user registration with email validation and PII-safe logging.
 * Records registration metrics to OpenTelemetry for observability.
 *
 * @module app/api/register
 */

import { NextResponse } from 'next/server';
import { registrationCounter } from '@/lib/metrics';
import { generateRequestId, log } from '@/lib/api-utils';
import crypto from 'crypto';

/**
 * Service identifier for log entries.
 */
const SERVICE = 'register';

/**
 * Email validation regex pattern.
 * Validates basic email format: local@domain.tld
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates a SHA-256 hash of an email for PII-safe logging.
 *
 * Uses a salt value to prevent rainbow table attacks on hashed emails.
 * The hash is truncated to 16 characters for brevity in logs.
 *
 * @param email - The email address to hash
 * @returns Truncated SHA-256 hash string
 */
function hashEmail(email: string): string {
  const salt = process.env.EMAIL_SALT || 'apex-default-salt';
  return crypto.createHash('sha256').update(email + salt).digest('hex').slice(0, 16);
}

/**
 * POST handler for user registration.
 *
 * Validates email format, extracts domain for metrics, and logs
 * registration event with PII-safe hashed email identifier.
 *
 * Security features:
 * - Email format validation
 * - PII redaction (only domain stored in metrics)
 * - Hashed email for log correlation without exposing PII
 *
 * @param request - The incoming HTTP request with JSON body
 * @returns JSON response with success/error status
 *
 * @example
 * // POST /api/register
 * // Body: { "email": "user@example.com" }
 * // Response: { "success": true, "message": "Registration successful" }
 */
export async function POST(request: Request) {
  const requestId = generateRequestId();

  try {
    const body = await request.json();
    const { email } = body;

    // Validate email
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
      log({ level: 'warn', service: SERVICE, message: 'Invalid email format', requestId });
      return NextResponse.json(
        { success: false, message: 'Please provide a valid email address.', requestId },
        { status: 400 }
      );
    }

    // Extract domain for metrics (no PII)
    const domain = email.split('@')[1]?.toLowerCase() || 'unknown';

    // Record registration metric
    registrationCounter.add(1, {
      email_domain: domain,
      environment: process.env.NODE_ENV || 'development',
    });

    // Log registration with hashed email for correlation (PII-safe)
    log({
      level: 'info',
      service: SERVICE,
      message: 'User registered successfully',
      requestId,
      emailHash: hashEmail(email),
      domain,
    });

    return NextResponse.json({
      success: true,
      message: 'Registration successful',
      requestId,
    });

  } catch (error) {
    log({
      level: 'error',
      service: SERVICE,
      message: 'Registration failed',
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { success: false, message: 'Registration failed. Please try again.', requestId },
      { status: 500 }
    );
  }
}
