import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  // Check for secure header to enable detailed mode
  const token = req.headers.get('x-health-token');
  const isInternal = token === process.env.HEALTH_DETAILS_TOKEN;

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    version: '1.0.0-phase1',
    // Only show detailed service status with valid internal token
    ...(isInternal && {
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
      }
    })
  };

  return NextResponse.json(health);
}
