'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

const WAVE_DURATION = 620;
const WAVE_POINTS = 32;

function createWaveClipPath(originX, originY, radius, progress) {
  const points = [];
  const ripple = Math.min(18, radius * 0.075) * (1 - progress);

  for (let point = 0; point < WAVE_POINTS; point += 1) {
    const angle = (Math.PI * 2 * point) / WAVE_POINTS;
    const offset = Math.sin(angle * 5 - progress * Math.PI * 6) * ripple;
    const x = originX + Math.cos(angle) * (radius + offset);
    const y = originY + Math.sin(angle) * (radius + offset);
    points.push(`${x.toFixed(1)}px ${y.toFixed(1)}px`);
  }

  return `polygon(${points.join(', ')})`;
}

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const btnRef = useRef(null);
  const isTransitioningRef = useRef(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-9 h-9" />;

  const isDark = (theme === 'system' ? resolvedTheme : theme) === 'dark';

  async function handleToggle() {
    if (isTransitioningRef.current) return;

    const nextTheme = isDark ? 'light' : 'dark';
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Motion-sensitive users and unsupported browsers get the standard instant switch.
    if (prefersReduced || !document.startViewTransition) {
      setTheme(nextTheme);
      return;
    }

    const btn = btnRef.current;
    const rect = btn ? btn.getBoundingClientRect() : null;
    const originX = rect ? rect.left + rect.width / 2 : window.innerWidth - 36;
    const originY = rect ? rect.top + rect.height / 2 : 36;
    const maxRadius = Math.hypot(
      Math.max(originX, window.innerWidth - originX),
      Math.max(originY, window.innerHeight - originY)
    ) + 32;

    isTransitioningRef.current = true;
    setIsTransitioning(true);

    try {
      const transition = document.startViewTransition(() => {
        // The synchronous update guarantees that the old snapshot remains visible
        // beneath the new-theme wave instead of flashing the new theme first.
        flushSync(() => setTheme(nextTheme));
      });

      await transition.ready;

      const animation = document.documentElement.animate(
        [0, 0.13, 0.32, 0.56, 0.78, 1].map((progress) => ({
          clipPath: createWaveClipPath(originX, originY, maxRadius * progress, progress),
        })),
        {
          duration: WAVE_DURATION,
          easing: 'cubic-bezier(0.22, 0.8, 0.28, 1)',
          fill: 'both',
          pseudoElement: '::view-transition-new(root)',
        }
      );

      await animation.finished;
      await transition.finished;
    } catch {
      // A cancelled browser view transition should still leave the selected theme applied.
    } finally {
      isTransitioningRef.current = false;
      setIsTransitioning(false);
    }
  }

  return (
    <button
      ref={btnRef}
      onClick={handleToggle}
      disabled={isTransitioning}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-70"
    >
      <Sun
        className="absolute h-4 w-4 rotate-0 scale-100 transition-all duration-300 dark:-rotate-90 dark:scale-0"
        aria-hidden="true"
      />
      <Moon
        className="absolute h-4 w-4 rotate-90 scale-0 transition-all duration-300 dark:rotate-0 dark:scale-100"
        aria-hidden="true"
      />
    </button>
  );
}
