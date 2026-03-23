/**
 * Data-Saver Mode for South African Market
 *
 * Progressive enhancement strategy for 3D UI based on connection quality.
 * South Africa has among the highest mobile data costs globally.
 *
 * Strategy:
 * - High Speed (4G/5G/WiFi): Full 3D particle effects, WebGPU renderer
 * - Medium (3G): Simplified 3D models, WebGL fallback, reduced particles (30%)
 * - Low (2G/Edge): Static 2D fallback, CSS animations only, no Three.js
 *
 * @module lib/hooks/useDataSaverMode
 */

import { useState, useEffect, useCallback } from 'react';

export type ConnectionQuality = 'high' | 'medium' | 'low' | 'unknown';

export interface DataSaverConfig {
  /** Whether data-saver mode is enabled */
  enabled: boolean;
  /** Detected connection quality */
  quality: ConnectionQuality;
  /** Effective downlink speed in Mbps (from Network Information API) */
  downlink: number | null;
  /** Whether WebGPU is supported and available */
  webGPUSupported: boolean;
  /** Recommended particle density (0-1) */
  particleDensity: number;
  /** Whether to use Three.js at all */
  useThreeJS: boolean;
  /** Whether to load high-poly models */
  useHighPoly: boolean;
  /** Animation frame rate target */
  targetFPS: number;
  /** Texture resolution multiplier */
  textureResolution: number;
}

interface NetworkInformation {
  effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
  downlink?: number; // Mbps
  rtt?: number; // ms
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

/**
 * Detect connection quality using Network Information API
 * and fallback heuristics
 */
function detectConnectionQuality(): {
  quality: ConnectionQuality;
  downlink: number | null;
  saveData: boolean;
} {
  // Try to use Network Information API
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  if (connection) {
    const downlink = connection.downlink ?? null;
    const saveData = connection.saveData ?? false;

    // If user has explicitly enabled data-saver mode
    if (saveData) {
      return { quality: 'low', downlink, saveData };
    }

    // Use effectiveType if available
    if (connection.effectiveType) {
      switch (connection.effectiveType) {
        case '4g':
          return { quality: 'high', downlink, saveData };
        case '3g':
          return { quality: 'medium', downlink, saveData };
        case '2g':
        case 'slow-2g':
          return { quality: 'low', downlink, saveData };
      }
    }

    // Use downlink speed if available
    if (downlink !== null) {
      if (downlink >= 10) {
        return { quality: 'high', downlink, saveData };
      } else if (downlink >= 1.5) {
        return { quality: 'medium', downlink, saveData };
      } else {
        return { quality: 'low', downlink, saveData };
      }
    }
  }

  // Fallback: Use performance API to estimate speed
  const entries = performance.getEntriesByType('navigation');
  if (entries.length > 0) {
    const navigation = entries[0] as PerformanceNavigationTiming;
    const transferSize = navigation.transferSize ?? 0;
    const duration = navigation.duration ?? 0;

    if (transferSize > 0 && duration > 0) {
      const speedMbps = (transferSize * 8) / (duration / 1000) / 1_000_000;

      if (speedMbps >= 10) {
        return { quality: 'high', downlink: speedMbps, saveData: false };
      } else if (speedMbps >= 1.5) {
        return { quality: 'medium', downlink: speedMbps, saveData: false };
      } else {
        return { quality: 'low', downlink: speedMbps, saveData: false };
      }
    }
  }

  // Default to medium if unknown
  return { quality: 'medium', downlink: null, saveData: false };
}

/**
 * Check if WebGPU is supported
 */
async function checkWebGPUSupport(): Promise<boolean> {
  if (!navigator.gpu) {
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Hook to manage data-saver mode configuration
 *
 * @param userPreference - User's explicit preference (overrides detection)
 * @returns DataSaverConfig with all settings
 */
export function useDataSaverMode(
  userPreference?: 'high' | 'medium' | 'low' | 'auto'
): DataSaverConfig {
  const [config, setConfig] = useState<DataSaverConfig>({
    enabled: false,
    quality: 'unknown',
    downlink: null,
    webGPUSupported: false,
    particleDensity: 1,
    useThreeJS: true,
    useHighPoly: true,
    targetFPS: 60,
    textureResolution: 1,
  });

  useEffect(() => {
    async function determineConfig() {
      // Check WebGPU support
      const webGPUSupported = await checkWebGPUSupport();

      // Determine quality
      let quality: ConnectionQuality;
      let downlink: number | null;

      if (userPreference && userPreference !== 'auto') {
        // User preference overrides detection
        quality = userPreference;
        const detected = detectConnectionQuality();
        downlink = detected.downlink;
      } else {
        // Auto-detect
        const detected = detectConnectionQuality();
        quality = detected.quality;
        downlink = detected.downlink;
      }

      // Calculate config based on quality
      let particleDensity: number;
      let useThreeJS: boolean;
      let useHighPoly: boolean;
      let targetFPS: number;
      let textureResolution: number;

      switch (quality) {
        case 'high':
          // Full experience
          particleDensity = 1;
          useThreeJS = true;
          useHighPoly = true;
          targetFPS = 60;
          textureResolution = 1;
          break;

        case 'medium':
          // Optimized for 3G
          particleDensity = 0.3; // 30% of particles
          useThreeJS = true;
          useHighPoly = false; // Use LOD meshes
          targetFPS = 30;
          textureResolution = 0.75;
          break;

        case 'low':
          // 2D fallback for 2G/Edge
          particleDensity = 0;
          useThreeJS = false;
          useHighPoly = false;
          targetFPS = 15;
          textureResolution = 0.5;
          break;

        default:
          // Default to medium
          particleDensity = 0.5;
          useThreeJS = true;
          useHighPoly = false;
          targetFPS = 30;
          textureResolution = 0.75;
      }

      setConfig({
        enabled: quality === 'low',
        quality,
        downlink,
        webGPUSupported,
        particleDensity,
        useThreeJS,
        useHighPoly,
        targetFPS,
        textureResolution,
      });
    }

    determineConfig();

    // Listen for connection changes
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
      const handleChange = () => determineConfig();
      connection.addEventListener?.('change', handleChange);
      return () => connection.removeEventListener?.('change', handleChange);
    }
  }, [userPreference]);

  return config;
}

/**
 * Hook to get a simplified particle count based on data-saver mode
 *
 * @param baseCount - The full particle count for high-quality mode
 * @param config - DataSaverConfig from useDataSaverMode
 * @returns Adjusted particle count
 */
export function useOptimizedParticleCount(
  baseCount: number,
  config: DataSaverConfig
): number {
  return Math.max(1, Math.round(baseCount * config.particleDensity));
}

/**
 * Hook to lazy-load Three.js only when needed
 *
 * @param config - DataSaverConfig from useDataSaverMode
 * @returns Whether Three.js is loaded and ready
 */
export function useLazyThreeJS(config: DataSaverConfig): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!config.useThreeJS) {
      return;
    }

    // Dynamically import Three.js
    import('three')
      .then(() => {
        setLoaded(true);
      })
      .catch((error) => {
        console.error('Failed to load Three.js:', error);
      });
  }, [config.useThreeJS]);

  return loaded;
}

/**
 * CSS-based fallback animations for data-saver mode
 * Used when Three.js is disabled
 */
export const dataSaverAnimations = {
  // Floating animation for cards
  float: `
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-10px); }
    }
    animation: float 3s ease-in-out infinite;
  `,

  // Pulse animation for interactive elements
  pulse: `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    animation: pulse 2s ease-in-out infinite;
  `,

  // Subtle gradient shift
  gradientShift: `
    @keyframes gradientShift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    background-size: 200% 200%;
    animation: gradientShift 5s ease infinite;
  `,

  // Fade in for content
  fadeIn: `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    animation: fadeIn 0.5s ease-out forwards;
  `,
};

/**
 * Performance monitoring for data-saver adjustments
 */
export function usePerformanceMonitor(config: DataSaverConfig): {
  fps: number;
  adjustQuality: () => void;
} {
  const [fps, setFps] = useState(60);
  const frameCount = { current: 0 };
  const lastTime = { current: performance.now() };

  useEffect(() => {
    if (!config.useThreeJS) {
      return;
    }

    let animationFrameId: number;

    const measureFPS = () => {
      frameCount.current++;
      const currentTime = performance.now();
      const elapsed = currentTime - lastTime.current;

      if (elapsed >= 1000) {
        setFps(Math.round((frameCount.current * 1000) / elapsed));
        frameCount.current = 0;
        lastTime.current = currentTime;
      }

      animationFrameId = requestAnimationFrame(measureFPS);
    };

    animationFrameId = requestAnimationFrame(measureFPS);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [config.useThreeJS]);

  const adjustQuality = useCallback(() => {
    // This would trigger a re-render with lower quality settings
    // Implementation depends on the specific 3D scene
    console.log('Adjusting quality due to low FPS');
  }, []);

  return { fps, adjustQuality };
}

export default useDataSaverMode;
