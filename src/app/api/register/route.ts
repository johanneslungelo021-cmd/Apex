import { NextResponse } from 'next/server';
import { registrationCounter } from '../../../lib/metrics';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    // Validate email
    if (!email || !email.includes('@')) {
      return NextResponse.json({ 
        success: false, 
        error: 'Valid email is required' 
      }, { status: 400 });
    }

    // In production, you would:
    // 1. Store in database (Supabase, PlanetScale, etc.)
    // 2. Send confirmation email
    // 3. Add to mailing list

    // For now, we log and emit metric
    console.log(`[REGISTRATION] New user: ${email} at ${new Date().toISOString()}`);

    // Emit registration metric to Grafana
    registrationCounter.add(1, { 
      email_domain: email.split('@')[1] || 'unknown',
      environment: process.env.VERCEL_ENV || 'development'
    });

    return NextResponse.json({ 
      success: true, 
      email,
      message: 'Registration successful! Welcome to Apex Sentient Interface.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Registration failed' 
    }, { status: 500 });
  }
}
