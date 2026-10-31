import { useEffect, useRef } from 'react';

/**
 * useVisibleInterval — `setInterval` that does not run while the document
 * is hidden.
 *
 * Background tabs kept polling: the Production Quality store re-read its
 * (500-row) inspection list every 30 s and the Dashboard re-read its KPI
 * stats every 60 s even when nobody could see the result, i.e. pure
 * repeated traffic with no user benefit.
 *
 * Behaviour:
 *   · the cadence is unchanged while the tab is visible,
 *   · polling stops while `document.hidden`,
 *   · one catch-up run happens immediately when the tab becomes visible
 *     again, so the screen is never showing data older than the last poll
 *     would have produced.
 *
 * Pass `delayMs == null` (or <= 0) to disable polling entirely.
 *
 * @param {() => void} callback
 * @param {number|null} delayMs
 */
export default function useVisibleInterval(callback, delayMs) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!delayMs || delayMs <= 0) return undefined;
    if (typeof document === 'undefined') return undefined;

    let timer = null;

    const tick = () => {
      try {
        savedCallback.current?.();
      } catch {
        /* A poll tick must never break the component that owns it. */
      }
    };

    const start = () => {
      if (timer == null) timer = setInterval(tick, delayMs);
    };

    const stop = () => {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
        return;
      }
      // Catch up once, then resume the normal cadence.
      tick();
      start();
    };

    if (document.hidden) stop();
    else start();

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [delayMs]);
}
