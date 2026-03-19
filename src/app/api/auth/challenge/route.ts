import { NextResponse } from 'next/server';

export async function POST() {
  // Placeholder for WebAuthn challenge generation
  return NextResponse.json({ challenge: 'mock-challenge' });
}
