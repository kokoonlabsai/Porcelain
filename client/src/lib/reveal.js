import { useEffect } from 'react';

/**
 * Fades `.sr` elements in as they scroll into view. Runs after every render, so sections that
 * appear once their data loads are picked up too. Everything stays visible without JS or with reduced motion.
 */
export function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll('.sr:not(.in)')];
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((el) => el.classList.add('in'));
      return undefined;
    }
    document.documentElement.classList.add('sr-on');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
}
