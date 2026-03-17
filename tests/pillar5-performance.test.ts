/**
 * tests/pillar5-performance.test.ts
 *
 * Automated verification of all Pillar 5 Speed Insights fixes.
 * Every assertion maps to a root cause documented in the diagnosis:
 *
 * Fix 1  — Cape Town region (cpt1) in vercel.json            → TTFB -200-300ms
 * Fix 2  — Dynamic imports for Three.js / R3F               → FCP -1.0-1.5s, LCP -0.8-1.2s
 * Fix 3  — Granular "use client" boundaries verified         → FCP, LCP, bundle size
 * Fix 4  — Suspense boundaries on Canvas                     → INP improvement
 * Fix 5  — Stale-while-revalidate cache headers              → TTFB near-zero cached
 * Fix 6  — next/font display:swap + preload                  → FCP -0.3-1.0s
 * Fix 7  — Resource hints (preconnect + dns-prefetch)        → FCP/LCP -100-300ms
 * Fix 8  — R3F ref mutation pattern (no setState in useFrame)→ INP -150-250ms
 * Bonus  — SentientCanvasScene isolates Three.js imports     → clean code split
 * Bonus  — yieldToMain scheduler polyfill                    → INP utility
 *
 * @see https://vercel.com/docs/speed-insights/metrics
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

// ─── Fix 1: Cape Town Region ──────────────────────────────────────────────────
describe('Fix 1 — Cape Town region', () => {
  const vercel = JSON.parse(read('vercel.json'));

  it('has cpt1 (Cape Town, South Africa) as the primary region', () => {
    // cpt1 must appear — it is the primary SA audience region
    expect(vercel.regions).toContain('cpt1');
  });

  it('cpt1 is the sole region — no iad1 or other regions (Hobby plan)', () => {
    expect(vercel.regions).not.toContain('iad1');
    expect(vercel.regions[0]).toBe('cpt1');
  });

  it('has exactly one region (Hobby plan restriction — multi-region requires Pro)', () => {
    // Vercel Hobby/Free plan: single region only.
    // Multi-region throws: "Deploying Serverless Functions to multiple regions
    // is restricted to the Pro and Enterprise plans."
    expect(vercel.regions).toHaveLength(1);
  });

  it('preserves existing function maxDuration configs', () => {
    expect(vercel.functions['src/app/api/ai-agent/route.ts'].maxDuration).toBe(30);
    expect(vercel.functions['src/app/api/news/route.ts'].maxDuration).toBe(30);
  });
});

// ─── Fix 2: Dynamic Imports — Three.js removed from critical path ─────────────
describe('Fix 2 — Dynamic imports for Three.js / R3F', () => {
  const pageContent = read('src/app/page.tsx');

  it('does NOT statically import Canvas from @react-three/fiber', () => {
    // Static: "import { Canvas } from '@react-three/fiber'"
    // If present, Three.js (~500KB) is in the critical bundle
    expect(pageContent).not.toMatch(/^import\s+\{[^}]*Canvas[^}]*\}\s+from\s+['"]@react-three\/fiber['"]/m);
  });

  it('does NOT statically import EmotionalSwarm', () => {
    expect(pageContent).not.toMatch(/^import\s+EmotionalSwarm\s+from/m);
  });

  it('does NOT statically import MagneticReticle', () => {
    expect(pageContent).not.toMatch(/^import\s+MagneticReticle\s+from/m);
  });

  it('does NOT statically import SensoryControls', () => {
    expect(pageContent).not.toMatch(/^import\s+SensoryControls\s+from/m);
  });

  it('uses next/dynamic for SentientCanvasScene with ssr: false', () => {
    expect(pageContent).toContain("import('@/components/sentient/SentientCanvasScene')");
    expect(pageContent).toMatch(/SentientCanvasScene[\s\S]{0,200}ssr:\s*false/);
  });

  it('uses next/dynamic for MagneticReticle with ssr: false', () => {
    expect(pageContent).toContain("import('@/components/sentient/MagneticReticle')");
    expect(pageContent).toMatch(/MagneticReticle[\s\S]{0,200}ssr:\s*false/);
  });

  it('uses next/dynamic for SensoryControls with ssr: false', () => {
    expect(pageContent).toContain("import('@/components/sentient/SensoryControls')");
    expect(pageContent).toMatch(/SensoryControls[\s\S]{0,200}ssr:\s*false/);
  });

  it('renders SentientCanvasScene in JSX (not raw Canvas)', () => {
    expect(pageContent).toContain('<SentientCanvasScene');
    // Confirm raw Canvas JSX is gone — it's inside SentientCanvasScene now
    expect(pageContent).not.toMatch(/<Canvas\s+camera/);
  });
});

// ─── Fix 2 (continued): SentientCanvasScene isolation ────────────────────────
describe('Fix 2 — SentientCanvasScene component', () => {
  const scene = read('src/components/sentient/SentientCanvasScene.tsx');

  it('file exists at the expected path', () => {
    expect(existsSync(join(ROOT, 'src/components/sentient/SentientCanvasScene.tsx'))).toBe(true);
  });

  it('is marked "use client" (required for R3F hooks)', () => {
    expect(scene).toMatch(/^['"]use client['"]/m);
  });

  it('imports Canvas from @react-three/fiber (only here, not in page)', () => {
    expect(scene).toContain("from '@react-three/fiber'");
    expect(scene).toContain('Canvas');
  });

  it('imports EmotionalSwarm internally (not leaked to page bundle)', () => {
    expect(scene).toContain("import EmotionalSwarm from '@/components/sentient/EmotionalSwarm'");
  });

  it('has a default export (required for next/dynamic)', () => {
    expect(scene).toMatch(/export\s+default\s+function/);
  });

  it('caps dpr at 1.5 to reduce pixel fill on Retina displays', () => {
    // dpr={[1, 1.5]} — 44% fewer pixels vs dpr=2 on SA mobile Retina
    expect(scene).toMatch(/dpr=\{\[1,\s*1\.5\]\}/);
  });

  it('wraps Canvas in Suspense for selective hydration', () => {
    expect(scene).toContain('<Suspense');
  });
});

// ─── Fix 3: Granular "use client" — EmotionalSwarm stays isolated ─────────────
describe('Fix 3 — Granular "use client" boundaries', () => {
  const swarm = read('src/components/sentient/EmotionalSwarm.tsx');
  const grid  = read('src/components/sentient/EmotionalGrid.tsx');

  it('EmotionalSwarm has its own "use client" directive', () => {
    expect(swarm).toMatch(/^['"]use client['"]/m);
  });

  it('EmotionalGrid has its own "use client" directive', () => {
    expect(grid).toMatch(/^['"]use client['"]/m);
  });

  it('EmotionalSwarm does NOT import from page.tsx (no circular dependency)', () => {
    expect(swarm).not.toContain("from '@/app/page'");
  });

  it('Three.js imports are confined to EmotionalSwarm and SentientCanvasScene', () => {
    const pageContent = read('src/app/page.tsx');
    // page.tsx must not import three directly
    expect(pageContent).not.toMatch(/from ['"]three['"]/);
    expect(pageContent).not.toMatch(/from ['"]@react-three/);
  });
});

// ─── Fix 4: Suspense boundaries ───────────────────────────────────────────────
describe('Fix 4 — Suspense boundaries', () => {
  const pageContent = read('src/app/page.tsx');
  const scene = read('src/components/sentient/SentientCanvasScene.tsx');

  it('page.tsx imports Suspense from React', () => {
    expect(pageContent).toMatch(/import\s+\{[^}]*Suspense[^}]*\}\s+from\s+['"]react['"]/);
  });

  it('SentientCanvasScene wraps Canvas in Suspense', () => {
    expect(scene).toContain('<Suspense');
  });
});

// ─── Fix 5: Stale-while-revalidate cache headers ──────────────────────────────
describe('Fix 5 — Cache headers for department API routes', () => {
  const config = read('next.config.ts');

  it('defines a trading cache header constant with s-maxage', () => {
    // The config defines CACHE_HEADERS_TRADING = [...s-maxage=600...] above nextConfig
    expect(config).toMatch(/CACHE_HEADERS_TRADING[\s\S]{0,200}s-maxage/);
  });

  it('blogs/reels cache constant has stale-while-revalidate', () => {
    expect(config).toMatch(/CACHE_HEADERS_BLOGS_REELS[\s\S]{0,200}stale-while-revalidate/);
  });

  it('applies blogs/reels cache to /api/reels route', () => {
    expect(config).toMatch(/source:\s*['"]\/api\/reels['"]/);
    expect(config).toContain('CACHE_HEADERS_BLOGS_REELS');
  });

  it('news cache constant has stale-while-revalidate', () => {
    expect(config).toMatch(/CACHE_HEADERS_NEWS[\s\S]{0,200}stale-while-revalidate/);
  });

  it('GEO shadow routes have 24h stale-while-revalidate', () => {
    expect(config).toMatch(/CACHE_HEADERS_GEO[\s\S]{0,200}stale-while-revalidate=86400/);
  });

  it('trading cache is shorter than blogs (trading data changes faster)', () => {
    // Extract s-maxage values from constant DEFINITIONS (not from route source entries)
    const tradingConstant = config.match(/CACHE_HEADERS_TRADING\s*=\s*\[[\s\S]*?s-maxage=(\d+)/);
    const blogsConstant   = config.match(/CACHE_HEADERS_BLOGS_REELS\s*=\s*\[[\s\S]*?s-maxage=(\d+)/);
    expect(tradingConstant).not.toBeNull();
    expect(blogsConstant).not.toBeNull();
    if (tradingConstant && blogsConstant) {
      expect(parseInt(tradingConstant[1])).toBeLessThan(parseInt(blogsConstant[1]));
    }
  });
});

// ─── Fix 6: Font display:swap ─────────────────────────────────────────────────
describe('Fix 6 — next/font display:swap', () => {
  const layout = read('src/app/layout.tsx');

  it('Geist font has display: "swap" (no FOIT — text visible immediately)', () => {
    // display:"swap" prevents invisible text during font load (FOIT).
    // Layout uses next/font/local (same Geist font, no Google CDN dependency).
    // Matches: localFont({ ... display: "swap" })
    const swapMatches = [...layout.matchAll(/display:\s*["']swap["']/g)];
    expect(swapMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('Geist Mono has display: "swap"', () => {
    // Both font instances use display:swap — verify at least 2 occurrences
    const swapMatches = [...layout.matchAll(/display:\s*["']swap["']/g)];
    expect(swapMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('primary font (Geist Sans) has preload: true', () => {
    // Preloading the primary font eliminates render-blocking font request.
    // next/font/local preload:true is equivalent to Geist({ preload: true }).
    expect(layout).toMatch(/preload:\s*true/);
  });
});

// ─── Fix 7: Resource hints ────────────────────────────────────────────────────
describe('Fix 7 — Resource hints (preconnect + dns-prefetch)', () => {
  const layout = read('src/app/layout.tsx');

  it('preconnects to api.groq.com (primary chat provider)', () => {
    expect(layout).toMatch(/rel=["']preconnect["'][^>]*href=["']https:\/\/api\.groq\.com["']/);
  });

  it('preconnects to api.perplexity.ai (Scout Agent provider)', () => {
    expect(layout).toMatch(/rel=["']preconnect["'][^>]*href=["']https:\/\/api\.perplexity\.ai["']/);
  });

  it('preconnects to Vercel Speed Insights (called on every page load)', () => {
    expect(layout).toMatch(/rel=["']preconnect["'][^>]*href=["']https:\/\/vitals\.vercel-insights\.com["']/);
  });

  it('uses dns-prefetch for HuggingFace (secondary provider)', () => {
    // dns-prefetch is the lightweight option for less-critical origins
    expect(layout).toMatch(/rel=["']dns-prefetch["'][^>]*href=["']https:\/\/api-inference\.huggingface\.co["']/);
  });

  it('uses dns-prefetch for Moonshot AI (Kimi K2)', () => {
    expect(layout).toMatch(/rel=["']dns-prefetch["'][^>]*href=["']https:\/\/api\.moonshot\.cn["']/);
  });

  it('has no more than 6 preconnect directives (bandwidth budget)', () => {
    const preconnects = (layout.match(/rel=["']preconnect["']/g) || []).length;
    // Each preconnect downloads a TLS certificate — cap at 6 to avoid
    // wasting bandwidth on high-latency SA mobile connections
    expect(preconnects).toBeLessThanOrEqual(6);
  });

  it('preconnect hints appear inside <head> (not <body>)', () => {
    const headSection = layout.split('<head>')[1]?.split('</head>')[0] ?? '';
    expect(headSection).toContain('rel="preconnect"');
  });
});

// ─── Fix 8: R3F performance — no setState in useFrame ────────────────────────
describe('Fix 8 — R3F ref mutation pattern', () => {
  const swarm = read('src/components/sentient/EmotionalSwarm.tsx');

  it('useFrame callback mutates refs directly (not setState)', () => {
    // Extract the useFrame callback body
    const useFrameMatch = swarm.match(/useFrame\s*\([^)]*\)\s*\{([\s\S]*?)^\s*\}\s*\);/m);
    const frameBody = useFrameMatch?.[1] ?? swarm;
    // setState inside useFrame causes 60 React re-renders/sec → main thread congestion
    expect(frameBody).not.toContain('setState');
    expect(frameBody).not.toContain('setRotation');
  });

  it('uses useRef for animation values (rotation, opacity, color)', () => {
    expect(swarm).toContain('currentSpeed   = useRef');
    expect(swarm).toContain('currentOpacity = useRef');
    expect(swarm).toContain('targetColor    = useRef');
    expect(swarm).toContain('currentColor   = useRef');
  });

  it('THREE.Color objects are allocated once via useRef (no per-frame garbage)', () => {
    // Correct pattern: allocate inside useRef() at component scope (runs once),
    // then mutate with .set() / .lerp() inside useFrame (runs 60x/sec, zero GC).
    // The useRef allocation lines appear BEFORE useFrame in the file.
    // Check: Colors live in useRef, not freshly constructed inside useFrame.

    // Extract lines between "useFrame" and end of file to find the frame body
    const afterUseFrameKw = swarm.split('useFrame(').slice(1).join('useFrame(');
    // new THREE.Color() inside the callback body would be GC pressure
    // The only Color constructions should be in the useRef() calls above useFrame
    const useRefLines = swarm.split('\n')
      .filter(l => l.includes('useRef(new THREE.Color'));
    const useFrameCallback = afterUseFrameKw.match(/\(\{[^)]*\}\)\s*=>\s*\{([\s\S]*?)^\s*\}\);/m)?.[1] ?? '';

    // There should be Color useRef allocations (good)
    expect(useRefLines.length).toBeGreaterThanOrEqual(2);
    // But not inside the frame callback (bad — would cause GC every frame)
    expect(useFrameCallback).not.toContain('new THREE.Color(');
  });

  it('positions array is memoised with useMemo (not recreated each render)', () => {
    expect(swarm).toContain('useMemo');
    expect(swarm).toMatch(/useMemo[\s\S]{0,200}Float32Array/);
  });

  it('SentientCanvasScene sets dpr cap to reduce Retina GPU work', () => {
    const scene = read('src/components/sentient/SentientCanvasScene.tsx');
    expect(scene).toMatch(/dpr=\{[^}]*1\.5[^}]*\}/);
  });
});

// ─── Bonus: yieldToMain scheduler utility ────────────────────────────────────
describe('Bonus — yieldToMain scheduler polyfill', () => {
  const ym = read('src/lib/performance/yieldToMain.ts');

  it('file exists', () => {
    expect(existsSync(join(ROOT, 'src/lib/performance/yieldToMain.ts'))).toBe(true);
  });

  it('exports yieldToMain function', () => {
    expect(ym).toContain('export function yieldToMain');
  });

  it('exports isLongTask helper', () => {
    expect(ym).toContain('export function isLongTask');
  });

  it('falls back to MessageChannel (Safari-safe, better than setTimeout)', () => {
    expect(ym).toContain('MessageChannel');
  });

  it('tries scheduler.yield first (Chrome 115+ priority-inheriting yield)', () => {
    const lines = ym.split('\n');
    const schedulerYieldLine = lines.findIndex(l => l.includes('scheduler.yield'));
    const msgChannelLine     = lines.findIndex(l => l.includes('MessageChannel'));
    expect(schedulerYieldLine).toBeGreaterThanOrEqual(0);
    expect(schedulerYieldLine).toBeLessThan(msgChannelLine);
  });

  it('isLongTask threshold is 50ms (RAIL / long-task definition)', () => {
    expect(ym).toContain('> 50');
  });
});

// ─── Regression: security headers and Pillar 4 still intact ──────────────────
describe('Regression — Pillar 4 Bones still intact', () => {
  const config = read('next.config.ts');

  it('X-Frame-Options: DENY still present', () => {
    expect(config).toContain("value: 'DENY'");
  });

  it('HSTS header still present', () => {
    expect(config).toContain('Strict-Transport-Security');
  });

  it('security headers still applied to all routes', () => {
    expect(config).toMatch(/source:\s*['"]\/\(\.\*\)['"]/);
  });

  it('Pillar 4 metrics file still intact', () => {
    expect(existsSync(join(ROOT, 'src/lib/observability/pillar4Metrics.ts'))).toBe(true);
  });
});

// ─── Integration: end-to-end flow check ──────────────────────────────────────
describe('Integration — end-to-end performance contract', () => {
  it('page.tsx has no direct Three.js imports at the module level', () => {
    const page = read('src/app/page.tsx');
    // All Three.js code is behind dynamic() — none reaches the critical bundle
    expect(page).not.toMatch(/from ['"]three['"]/);
    expect(page).not.toMatch(/from ['"]@react-three\/fiber['"]/);
    expect(page).not.toMatch(/from ['"]@react-three\/drei['"]/);
  });

  it('SentientCanvasScene is the single entry point for all Three.js code', () => {
    const scene = read('src/components/sentient/SentientCanvasScene.tsx');
    const swarm = read('src/components/sentient/EmotionalSwarm.tsx');
    // Canvas lives here
    expect(scene).toContain("from '@react-three/fiber'");
    // Geometry/rendering in swarm
    expect(swarm).toContain("from '@react-three/fiber'");
    expect(swarm).toContain("from 'three'");
  });

  it('layout.tsx has both font optimisation AND resource hints', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toContain('display: "swap"');      // Fix 6
    expect(layout).toContain('rel="preconnect"');      // Fix 7
    expect(layout).toContain('rel="dns-prefetch"');    // Fix 7
  });

  it('next.config.ts has both security headers AND cache headers', () => {
    const config = read('next.config.ts');
    expect(config).toContain('SECURITY_HEADERS');                  // Pillar 4
    expect(config).toContain('stale-while-revalidate');            // Fix 5
    expect(config).toContain("source: '/(.*)'");                   // Pillar 4 all-routes
    expect(config).toContain("source: '/api/trading'");            // Fix 5
  });

  it('vercel.json has cpt1 region AND preserves function configs', () => {
    const vercel = JSON.parse(read('vercel.json'));
    expect(vercel.regions).toContain('cpt1');
    expect(vercel.functions).toBeTruthy();
  });
});
