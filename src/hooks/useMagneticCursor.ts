// src/hooks/useMagneticCursor.ts
'use client';

import { useState, useEffect } from 'react';
import { useSensoryPreferences } from './useSensoryPreferences';

export interface MagneticCursorState {
  x: number;
  y: number;
  isHovering: boolean;
}

export function useMagneticCursor(): MagneticCursorState {
  const { motion, isTouchDevice } = useSensoryPreferences();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    if (isTouchDevice || !motion || typeof window === 'undefined') return;

    const updatePosition = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };

    const updateHoverState = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive = Boolean(
        target.closest('button, a, input, [data-magnetic]')
      );
      setIsHovering(isInteractive);
    };

    window.addEventListener('mousemove', updatePosition);
    window.addEventListener('mouseover', updateHoverState);

    return () => {
      window.removeEventListener('mousemove', updatePosition);
      window.removeEventListener('mouseover', updateHoverState);
    };
  }, [motion, isTouchDevice]);

  return { x: position.x, y: position.y, isHovering };
}
