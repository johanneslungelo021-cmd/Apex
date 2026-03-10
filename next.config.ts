import type { NextConfig } from 'next';

// ─── Security Headers ────────────────────────────────────────────────────────
// Pillar 4: Applied to all routes. CSP is in report-only mode for Vercel
// deployments to avoid breaking Next.js script injection in dev.
const SECURITY_HEADERS = [
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    // Minimal permissions — Apex does not use camera, geolocation, or payment browser API
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Content-Security-Policy',
    // Allows: self, Vercel internals, cdnjs for Three.js, HuggingFace for inference.
    // unsafe-inline required for Next.js inline script hydration.
    // upgrade-insecure-requests forces HTTPS on all mixed-content resources.
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://api.groq.com https://api.perplexity.ai https://api.moonshot.cn https://api-inference.huggingface.co https://otel.grafana.net",
      "media-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
  {
    // HSTS: 1 year, include subdomains. Preload requires manual submission to
    // hstspreload.org — intentionally omitted to avoid locking out plain HTTP
    // during active development rotation.
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
];

const nextConfig: NextConfig = {
  // instrumentation.ts works automatically in Next.js 16 – no flag needed
  transpilePackages: ['three'],
  async headers() {
    return [
      {
        // Apply security headers to all routes including API responses
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        // Allow any HTTPS hostname and any path.
        // This wildcard is intentional: news article images come from Perplexity
        // Search results which span an unbounded set of news publishers. There is
        // no finite list of hostnames that can be pre-declared at build time.
        // All fetched image URLs are already validated by assertSafeUrl (DNS check +
        // private-IP block) in news/route.ts before they reach the client, so the
        // only risk here is Next.js Image optimisation being invoked for an external
        // URL — not an SSRF vector.
        protocol: 'https',
        hostname: '**',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
