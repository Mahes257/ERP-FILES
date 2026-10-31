/**
 * utils/routePrefetch.js
 * ------------------------------------------------------------------
 * Warms the JavaScript chunk of a page *before* the click that opens it.
 *
 * WHY THIS EXISTS
 * Every route in this app is code-split (React.lazy). Until a route's
 * chunk has been downloaded the router cannot render it, so a click can
 * only keep the previous screen visible (or show the Suspense fallback)
 * for as long as the chunk takes to arrive — the "navigation feels slow"
 * symptom. Prefetching moves that network round-trip in front of the
 * click:
 *
 *   · navigation intent (pointer hover / keyboard focus, after a short
 *     dwell so a mouse sweep across the menu fires nothing) warms the
 *     destination chunk, so the click renders from the module cache;
 *   · idle warming warms the routes reachable from the *current* screen
 *     (sibling tabs, module children), plus the heavy module route
 *     tables once, so the next hop inside a module is instant too.
 *
 * WHAT IT IS NOT
 *   · It never changes rendering, routing or data fetching — it calls
 *     the very same `import()` thunks the router already declares, so
 *     the module cache is shared and nothing is downloaded twice.
 *   · It never blocks a click, and every failure is swallowed: a failed
 *     prefetch just means the router loads the chunk as it always did.
 *   · It is skipped on metered / 2G connections
 *     (`navigator.connection.saveData` / `effectiveType`).
 *
 * The path → thunk table is generated from the real route declarations
 * and is loaded as its own small chunk (never in the startup bundle):
 *
 *   node scripts/gen-route-prefetch.cjs
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useRef } from 'react';

/**
 * Chunks that must never be warmed speculatively.
 */
const NEVER_PREFETCH = new Set(['/signin']);

/**
 * Pages whose modules pull very heavy libraries (pdf / canvas / print
 * editors). They are only warmed by explicit hover/focus intent, never
 * by idle warming.
 */
const HEAVY_PREFIXES = [
  '/quotations/design',
  '/invoices/design',
  '/delivery-challans/design',
  '/proforma-invoices/design',
  '/payment-receipts/design',
  '/credit-notes/design',
  '/sales-orders/design',
  '/sales-contracts/design',
  '/cost-workouts/design',
  '/profit-workouts/design',
  '/packing-lists/design',
];

/** Paths already kicked off — never issue the same import twice. */
const started = new Set();

/** Per-path dwell timers used by {@link prefetchIntentProps}. */
const dwellTimers = new Map();

let tablePromise = null;

/**
 * Load the generated route → thunk table. Small, cached for the session,
 * retried on failure, and deliberately separate from the startup bundle.
 */
export function loadPrefetchTable() {
  if (!tablePromise) {
    tablePromise = import('./routePrefetch.generated').catch((error) => {
      tablePromise = null;
      throw error;
    });
  }
  return tablePromise;
}

function isConnectionCheap() {
  if (typeof navigator === 'undefined') return false;
  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return !/^(slow-)?2g$/.test(connection.effectiveType || '');
}

function isVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function isHeavy(path) {
  return HEAVY_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** '/purchase/rfq/?tab=x#y' → '/purchase/rfq' */
export function normalizePath(pathname) {
  if (typeof pathname !== 'string' || pathname === '') return '/';
  const clean = pathname.split('#')[0].split('?')[0];
  if (clean.length > 1 && clean.endsWith('/')) return clean.replace(/\/+$/, '');
  return clean || '/';
}

/**
 * Find the module that serves `path`: an exact route first, then the
 * closest ancestor route, so a detail page (`/purchase/rfq/quotations/9`)
 * still warms the list chunk it was opened from.
 */
function resolveLoader(routeModules, path) {
  if (routeModules[path]) return routeModules[path];
  let candidate = path;
  let cut = candidate.lastIndexOf('/');
  while (cut > 0) {
    candidate = candidate.slice(0, cut);
    if (routeModules[candidate]) return routeModules[candidate];
    cut = candidate.lastIndexOf('/');
  }
  return null;
}

function run(loader) {
  try {
    const result = loader();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    /* a prefetch must never surface an error to the user */
  }
}

function cancelDwell(path) {
  const timer = dwellTimers.get(path);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    dwellTimers.delete(path);
  }
}

/**
 * Warm the chunk for a single route path. Safe to call repeatedly and
 * from anywhere (hover handlers, idle callbacks); duplicates collapse
 * and failures are ignored.
 */
export function prefetchRoute(pathname) {
  if (!pathname) return;
  const path = normalizePath(pathname);
  if (path === '/' || NEVER_PREFETCH.has(path) || started.has(path)) return;
  if (!isConnectionCheap()) return;
  started.add(path);

  loadPrefetchTable()
    .then(({ MODULE_CONTAINERS, ROUTE_MODULES }) => {
      // The module route table itself (e.g. the /purchase route table)
      // is what a module switch has to download first, so warm it too.
      const container = MODULE_CONTAINERS[path.split('/')[1]];
      if (container) run(container);

      const loader = resolveLoader(ROUTE_MODULES, path);
      if (loader) run(loader);
    })
    .catch(() => {
      started.delete(path);
    });
}

/** Warm several paths at once, in order. */
export function prefetchRoutes(pathnames, limit = 6) {
  if (!Array.isArray(pathnames)) return;
  pathnames.slice(0, limit).forEach(prefetchRoute);
}

function onIdle(task, timeout) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout });
    return;
  }
  window.setTimeout(task, Math.min(timeout, 200));
}

/**
 * Sequentially warm `pathnames` while the browser is idle. The gap
 * between chunks keeps speculative traffic out of the connection pool
 * the current page is using, and the run stops as soon as the tab is
 * hidden.
 */
export function warmRoutesOnIdle(pathnames, { limit = 5, gapMs = 400, startDelayMs = 700 } = {}) {
  if (!Array.isArray(pathnames) || !isConnectionCheap()) return;
  const queue = pathnames
    .map(normalizePath)
    .filter((p) => p && p !== '/' && !NEVER_PREFETCH.has(p) && !isHeavy(p) && !started.has(p))
    .slice(0, limit);
  if (queue.length === 0) return;

  let index = 0;

  const step = () => {
    if (index >= queue.length || !isVisible()) return;
    prefetchRoute(queue[index]);
    index += 1;
    if (index < queue.length) {
      // setTimeout keeps the gap between chunks; a background tab stops
      // here because timers are throttled and isVisible() fails.
      window.setTimeout(step, gapMs);
    }
  };

  onIdle(step, startDelayMs + 800);
}

/** Routes that share the first `depth` segments with `path` (tab siblings). */
function siblingsOf(routePaths, path, depth, maxDepth) {
  const segments = path.split('/').filter(Boolean);
  const prefix = `/${segments.slice(0, depth).join('/')}`;
  return routePaths.filter((key) => {
    if (key === path || isHeavy(key)) return false;
    if (!key.startsWith(prefix)) return false;
    return key.split('/').filter(Boolean).length <= maxDepth;
  });
}

/**
 * Warm the routes a user is most likely to click from the current
 * screen: the sibling tabs of the active module section first, and the
 * module's shallow pages when the current page has no siblings.
 */
export function warmNeighbourhood(pathname, { limit = 5, gapMs = 400 } = {}) {
  const path = normalizePath(pathname);
  if (path === '/' || NEVER_PREFETCH.has(path) || !isConnectionCheap()) return;

  const depth = path.split('/').filter(Boolean).length;

  loadPrefetchTable()
    .then(({ ROUTE_MODULES }) => {
      const routePaths = Object.keys(ROUTE_MODULES);
      const tabSiblings = depth > 2 ? siblingsOf(routePaths, path, 2, depth) : [];
      const moduleSiblings =
        tabSiblings.length > 0 ? [] : siblingsOf(routePaths, path, 1, Math.max(depth, 2));

      warmRoutesOnIdle([...tabSiblings, ...moduleSiblings], { limit, gapMs });
    })
    .catch(() => {});
}

/**
 * Props that warm a route as soon as the user shows intent to open it,
 * to be spread onto a navigation element:
 *
 *   <button {...prefetchIntentProps('/purchase/rfq')} />
 *
 * The short dwell on pointer entry keeps a fast mouse sweep across the
 * menu from firing a download for every item it crosses; keyboard focus
 * warms immediately.
 */
export function prefetchIntentProps(pathname, { dwellMs = 120 } = {}) {
  const path = normalizePath(pathname);
  return {
    onPointerEnter: () => {
      if (dwellTimers.has(path)) return;
      dwellTimers.set(
        path,
        window.setTimeout(() => {
          dwellTimers.delete(path);
          prefetchRoute(path);
        }, dwellMs),
      );
    },
    onPointerLeave: () => cancelDwell(path),
    onFocus: () => {
      cancelDwell(path);
      prefetchRoute(path);
    },
    onBlur: () => cancelDwell(path),
    onTouchStart: () => prefetchRoute(path),
  };
}

/**
 * Hook form of {@link prefetchIntentProps} — memoized so the returned
 * handlers stay referentially stable across renders.
 */
export function usePrefetchOnIntent(pathname, { dwellMs = 120 } = {}) {
  const path = normalizePath(pathname);
  return useMemo(() => prefetchIntentProps(path, { dwellMs }), [path, dwellMs]);
}

/**
 * Hook: once the current page has settled, warm the routes reachable
 * from it. Deferred so it can never compete with the page's own data
 * requests; the delay is cancelled if the user navigates first.
 */
export function useWarmNeighbourhood(pathname, { delayMs = 900 } = {}) {
  useEffect(() => {
    const id = window.setTimeout(() => warmNeighbourhood(pathname), delayMs);
    return () => window.clearTimeout(id);
  }, [pathname, delayMs]);
}

/**
 * Hook: one-off, idle warm of the prefetch table and the heavy module
 * route tables (Purchase, Production). Entering a module for the first
 * time is the single most expensive navigation in the app; paying for
 * it while the browser is idle means the first click on that module is
 * instant.
 */
export function useWarmModuleContainers({ delayMs = 2500 } = {}) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return undefined;
    done.current = true;

    // Deliberately deferred past the current screen's own data requests,
    // then spread out and only run while the browser is idle, so the
    // warm-up never competes with something the user is waiting for.
    const timer = window.setTimeout(() => {
      if (!isConnectionCheap()) return;
      loadPrefetchTable()
        .then(({ MODULE_CONTAINERS }) => {
          Object.values(MODULE_CONTAINERS).forEach((loader, index) => {
            window.setTimeout(() => {
              onIdle(() => {
                if (isVisible()) run(loader);
              }, 3000);
            }, index * 600);
          });
        })
        .catch(() => {});
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs]);
}

export default prefetchRoute;
