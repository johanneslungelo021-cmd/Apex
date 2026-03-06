import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // instrumentation.ts works automatically in Next.js 16 – no flag needed
  images: {
    // Allow images from any HTTPS domain for dynamic news images
    // Perplexity Search API returns articles from various news sources
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    // Disable static imports for truly dynamic external images
    unoptimized: false,
  },
};

export default nextConfig;
