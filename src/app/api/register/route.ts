import { NextResponse } from 'next/server';
import { registrationCounter } from '../../../lib/metrics';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    
    // LocalAI confirmation (real call)
    try {
      await fetch('http://localhost:8080/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: "llama-3.3-70b", 
          messages: [{ role: "user", content: `Confirm user registration for ${email}` }] 
        })
      });
    } catch {
      console.log('LocalAI not available for registration confirmation');
    }
    
    // Emit registration metric to Grafana
    registrationCounter.add(1, { email_domain: email?.split('@')[1] || 'unknown' });
    
    return NextResponse.json({ success: true, email });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ success: false, error: 'Registration failed' }, { status: 500 });
  }
}
