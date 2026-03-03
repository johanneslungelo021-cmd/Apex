import { registerOTel } from '@vercel/otel';

export function register() {
  registerOTel({
    serviceName: 'apex-sentient-interface',
    attributes: {
      'deployment.environment': process.env.NODE_ENV || 'production',
      'service.version': '1.0.0-phase1'
    }
  });
}
