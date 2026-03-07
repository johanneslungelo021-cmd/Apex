import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // instrumentation.ts works automatically in Next.js 16 – no flag needed
  images: {
    remotePatterns: [
      {
        // Allow any HTTPS hostname and any path.
        // News article images come from Perplexity Search results which span
        // an unbounded set of news publishers — no finite allowlist is possible.
        // All URLs are SSRF-validated by assertSafeUrl (DNS + private-IP check)
        // in news/route.ts before they reach the browser.
        protocol: 'https',
        hostname: '**',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
