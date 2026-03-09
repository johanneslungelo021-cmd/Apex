import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // instrumentation.ts works automatically in Next.js 16 – no flag needed
  transpilePackages: ['three'],
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
