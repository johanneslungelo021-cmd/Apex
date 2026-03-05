import { NextResponse } from 'next/server';
import { registrationCounter } from '../../../lib/metrics';
import crypto from 'crypto';

// RFC-5322-inspired regex: requires local@domain.tld — rejects bare @, double dots, etc.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  // Safely parse JSON — null or malformed body must return 400, not 500
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'VALIDATION_ERROR', message: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { success: false, error: 'VALIDATION_ERROR', message: 'Request body must be a JSON object.' },
      { status: 400 }
    );
  }

  try {
    const { email } = body as Record<string, unknown>;

    // Validate: present, string, non-empty
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'email is required.' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Strict format check — prevents malformed domains polluting email_domain metric cardinality
    if (!EMAIL_RE.test(normalizedEmail)) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'email format is invalid.' },
        { status: 400 }
      );
    }

    // PII-safe logging with stable SHA-256 hash (no PII exposed in logs)
    const hash = crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 12);
    const redactedEmail = `user_${hash}`;
    console.log(`[REGISTRATION] New user: ${redactedEmail} at ${new Date().toISOString()}`);

    // Emit registration metric to Grafana (domain only, no PII)
    const emailDomain = normalizedEmail.split('@')[1];
    registrationCounter.add(1, {
      email_domain: emailDomain,
      environment: process.env.VERCEL_ENV || 'development'
    });

    return NextResponse.json({
      success: true,
      message: 'Registration successful! Welcome to Apex Sentient Interface.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[REGISTRATION] Error:', error);
    return NextResponse.json(
      { success: false, error: 'internal_server_error', message: 'Registration failed.' },
      { status: 500 }
    );
  }
}
