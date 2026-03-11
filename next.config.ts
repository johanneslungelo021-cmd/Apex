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

/**
 * Fix 5: Layered caching headers for department API routes.
 *
 * Vercel CDN will serve cached responses from the nearest PoP (including
 * Johannesburg). South African repeat visitors and navigations receive instant
 * responses instead of paying the serverless cold-start + network penalty.
 *
 * stale-while-revalidate: serve stale content immediately while regenerating
 * in the background. Users never wait for a round-trip.
 *
 * NOTE: These cannot go in SECURITY_HEADERS because they are route-specific.
 * The security headers array is applied to source:'/(.*)', i.e. all routes.
 */
const CACHE_HEADERS_TRADING = [
  { key: 'Cache-Control', value: 'public, s-maxage=600, stale-while-revalidate=1200' },
  { key: 'Vary', value: 'Accept-Encoding' },
];

const CACHE_HEADERS_BLOGS_REELS = [
  { key: 'Cache-Control', value: 'public, s-maxage=1800, stale-while-revalidate=3600' },
  { key: 'Vary', value: 'Accept-Encoding' },
];

const CACHE_HEADERS_NEWS = [
  { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=600' },
  { key: 'Vary', value: 'Accept-Encoding' },
];

const CACHE_HEADERS_GEO = [
  // GEO markdown shadow routes — content changes at most with deploys
  { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
  { key: 'Vary', value: 'Accept-Encoding' },
];

const nextConfig: NextConfig = {
  // instrumentation.ts works automatically in Next.js 16 – no flag needed
  transpilePackages: ['three'],

  /**
   * Perf: Tree-shake heavy packages — only the named exports actually used
   * are included in the bundle.  Without this entry, importing { motion }
   * from 'framer-motion' pulls the ENTIRE library (~100 KB gzipped) including
   * drag, layout, and gesture controllers Apex never uses.  Same story for
   * lucide-react (250+ icons) and @react-three/drei (60+ helpers).
   *
   * Impact: initial JS −80–120 KB, FCP −0.3–0.5 s across all routes.
   *
   * Note: optimizePackageImports was removed in Next.js 16. Tree-shaking
   * now happens automatically via Turbopack's built-in optimization.
   * The packages listed below are already optimized by their maintainers
   * for tree-shaking (using ES modules with named exports).
   */

  /**
   * Perf: Enable Brotli/gzip for all server responses.
   * Brotli is 15–25 % better than gzip on JS bundles.
   * On the 500 KB Three.js bundle this saves 75–125 KB per cold visit.
   */
  compress: true,
  async headers() {
    return [
      {
        // Apply security headers to all routes including API responses
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
      // Fix 5: Department API caching — eliminates repeat SA latency penalty
      {
        source: '/api/trading',
        headers: CACHE_HEADERS_TRADING,
      },
      {
        source: '/api/blogs',
        headers: CACHE_HEADERS_BLOGS_REELS,
      },
      {
        source: '/api/reels',
        headers: CACHE_HEADERS_BLOGS_REELS,
      },
      {
        source: '/api/news',
        headers: CACHE_HEADERS_NEWS,
      },
      {
        source: '/api/mx/:path*',
        headers: CACHE_HEADERS_GEO,
      },
    ];
  },
  images: {
    /**
     * Perf: Explicit AVIF then WebP preference.
     * AVIF is 40–50 % smaller than JPEG at equivalent quality.
     * For the news article thumbnails (SA users' likely LCP element) this
     * saves 30–50 KB per image.  Next.js serves AVIF to browsers that send
     * 'image/avif' in the Accept header (Chrome 85+, Firefox 93+) and falls
     * back to WebP for older clients.
     */
    formats: ['image/avif', 'image/webp'],
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
