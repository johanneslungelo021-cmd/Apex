import { NextResponse } from 'next/server';

export async function GET() {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    region: process.env.VERCEL_REGION || 'local',
    services: {
      grafana: {
        configured: !!(process.env.GRAFANA_API_KEY && process.env.GRAFANA_INSTANCE_ID),
        endpoint: process.env.GRAFANA_OTLP_ENDPOINT ? 'configured' : 'missing',
      },
      ai: {
        aiGateway: !!process.env.AI_GATEWAY_API_KEY,
        groq: !!process.env.GROQ_API_KEY,
      },
      github: !!process.env.GITHUB_TOKEN,
    },
    version: '1.0.0-phase1',
  };

  return NextResponse.json(health);
}
