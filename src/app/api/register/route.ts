import { NextResponse } from 'next/server';
import { registrationCounter } from '../../../lib/metrics';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    // Validate email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ 
        success: false, 
        error: 'Valid email is required' 
      }, { status: 400 });
    }

    // In production, you would:
    // 1. Store in database (Supabase, PlanetScale, etc.)
    // 2. Send confirmation email
    // 3. Add to mailing list

    // PII-safe logging with stable SHA-256 hash (consistent across logs, no PII exposed)
    const hash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 12);
    const redactedEmail = `user_${hash}`;
    console.log(`[REGISTRATION] New user: ${redactedEmail} at ${new Date().toISOString()}`);

    // Emit registration metric to Grafana (domain only, no PII)
    const emailDomain = email.split('@')[1] || 'unknown';
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
    return NextResponse.json({ 
      success: false, 
      error: 'Registration failed' 
    }, { status: 500 });
  }
}
