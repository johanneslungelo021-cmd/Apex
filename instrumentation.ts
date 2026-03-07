// instrumentation.ts
import { registerOTel } from '@vercel/otel';
import { APP_VERSION } from '@/lib/version';

export function register() {
  registerOTel({
    serviceName: 'apex-sentient-interface',
    attributes: {
      'deployment.environment.name':
        process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
      'service.version': APP_VERSION,
      'service.instance.id': process.env.VERCEL_REGION || 'local',
    },
  });
}
