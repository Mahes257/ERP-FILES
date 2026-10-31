import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * useStickyPageHeader
 * ------------------------------------------------------------------
 * Keeps the page-level TOP CONTROL SECTION of the current route pinned
 * while KPI cards, tables and every other content block scroll
 * underneath it.
 *
 * Why a shared hook instead of per-page CSS
 * ----------------------------------------
 * Every screen in the ERP renders inside a shared page shell
 * (`.purchase-page.cpr-page`, production `.page`, `.module-hub`), but
 * the top section itself is authored per page and is commonly a RUN of
 * sibling blocks rather than a single wrapper:
 *
 *   <nav class="pr-breadcrumb" />      ← breadcrumb
 *   <div class="pr-page-header" />     ← title + subtitle + actions
 *   <div class="segmented-control" />  ← page / module tabs
 *   <div class="pr-toolbar" />         ← search + filters
 *   ...KPI cards, table...
 *
 * `position: sticky` needs one `top` per block, and CSS cannot stack an
 * unknown number of variable-height siblings (nor know how tall the
 * block above it is). Wrapping them would mean editing ~80 page files.
 * So the mechanism lives here once and AppLayout mounts it for the
 * whole app:
 *
 *   1. locate the leading run of page "chrome" blocks — a bare
 *      <header>, a breadcrumb, a *-page-header, a hub header, page
 *      tabs, a page toolbar, or anything explicitly marked with
 *      `data-erp-sticky-header` / `.erp-page-chrome`
 *   2. `position: sticky` each of them, stacked directly under the
 *      global topbar using their measured heights AND margins, so the
 *      pinned header looks exactly like the unscrolled one (no jump)
 *   3. paint the page background behind them so scrolling content
 *      never shows through
 *   4. re-align in-content sticky headers (sticky table heads, sticky
 *      section headers) so they dock below the pinned chrome instead of
 *      sliding underneath it
 *
 * The document is the scroll container everywhere in this app
 * (`.app-shell` / `.app-workspace-content` are deliberately
 * `overflow: visible`), so sticky resolves against the viewport and the
 * behaviour is correct on desktop, tablet and mobile. Sticky — never
 * fixed — is used, so layout, padding, margins and document flow are
 * untouched: nothing moves, it simply stays put.
 *
 * @param {React.RefObject<HTMLElement>} hostRef
 *   The workspace content element that wraps the routed page
 *   (`.app-workspace-content`).
 */

/** Height of the global topbar (`.app-topbar h-14`). */
const TOPBAR_H = 56;
/** Sticky page chrome sits above page content but below the sidebar (40) and the mobile drawer (50). */
const Z_BASE = 32;
/** Never pin more than this share of the viewport, so content stays usable. */
const MAX_RUN_RATIO = 0.5;
/** Markers for headers the heuristics cannot recognise (Tailwind-only pages). */
const MARKER_ATTR = 'data-erp-sticky-header';
const MARKER_CLASS = 'erp-page-chrome';
const STICKY_CLASS = 'erp-sticky-chrome';

/** Blocks that CAN start a pinned run (unambiguous page chrome). */
const STRONG_TOKENS = [
  'pr-breadcrumb',
  'po-breadcrumb',
  'crm-erp-breadcrumb',
  'qtn-breadcrumb',
  'pr-page-header',
  'po-page-header',
  'qpo-page-header',
  'page-header',
  'cpr-page-static-header',
  'module-hub-header',
  'vfue-header',
  'po-prod-header',
  'settings-page-head',
  'qtn-page-head',
];

/** Class shape of a page header/heading (extra reach for pages without a token). */
const HEAD_CLASS_RE = /(?:^|-)(?:header|head|breadcrumb|breadcrumbs|title-bar)$/;
/** ...but never treat card / panel / table / sticky-section heads as page chrome. */
const HEAD_CLASS_DENY_RE =
  /(?:^|-)(?:card|panel|modal|drawer|table|section|widget|tile|block|box|chart|stat|filter|menu|sticky|print|num|btn|item|items|pagination|footer|foot)(?:-|$)/;
const HEADER_TAGS = ['DIV', 'SECTION', 'ARTICLE', 'NAV', 'HEADER'];
const PAGE_TITLE_TAGS = ['H1', 'H2'];
/**
 * Structural fallback for the remaining pages: a leading block whose class
 * merely *reads* like a page header (e.g. `settings-page-head`) or a bare
 * page title. Only ever consulted for the LEADING run, and never for a block
 * tall enough to be page content.
 */
function isGenericHeader(el) {
  const height = el.getBoundingClientRect().height;
  if (height <= 0 || height > (window.innerHeight || 0) * 0.3) return false;
  if (PAGE_TITLE_TAGS.includes(el.tagName)) return true;
  if (!HEADER_TAGS.includes(el.tagName)) return false;
  return tokensOf(el).some(
    (token) => HEAD_CLASS_RE.test(token) && !HEAD_CLASS_DENY_RE.test(token)
  );
}

/** Blocks that may CONTINUE a pinned run (page tabs / toolbars / filters). */
const WEAK_TOKENS = [
  'pr-tabs',
  'po-tabs',
  'qpo-tabs',
  'cpr-tabs',
  'qpo-tabs-row',
  'po-tabs-row',
  'cpr-module-tabs',
  'segmented-control',
  'rfq-tab-nav',
  'tv-division-tabs',
  'st-pill-tabs',
  'report-tabs',
  'journey-tabs',
  'ldp-tabs',
  'pr-toolbar',
  'po-toolbar',
  'pr-filter-panel',
  'pr-filter-grid',
];

/** Never look inside these when hunting for the page header (they are content). */
const DENY_DESCEND = [
  'card',
  'kpi',
  'grid',
  'table',
  'panel',
  'modal',
  'drawer',
  'list',
  'rows',
  'row',
  'stat',
  'chart',
  'form',
  'banner',
  'toolbar',
  'tabs',
  'items',
  'footer',
];

/** In-content blocks that may be sticky against the window. */
const CONTENT_STICKY_SELECTOR = 'thead, .prv-sticky-header, .ac-toolbar, .erp-sticky-content';

const tokensOf = (el) => (el && el.classList ? Array.from(el.classList) : []);
const hasToken = (el, list) => tokensOf(el).some((token) => list.includes(token));
const isMarked = (el) => el.hasAttribute(MARKER_ATTR) || el.classList.contains(MARKER_CLASS);
const isStrongChrome = (el) =>
  el.tagName === 'HEADER' || isMarked(el) || hasToken(el, STRONG_TOKENS) || isGenericHeader(el);
const isChrome = (el) => isStrongChrome(el) || hasToken(el, WEAK_TOKENS);
const canDescend = (el) =>
  ['DIV', 'SECTION', 'MAIN', 'ARTICLE'].includes(el.tagName) && !hasToken(el, DENY_DESCEND);

const isTransparent = (color) => !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';

/** First painted background above `el` — the colour the pinned block must cover. */
function inheritedBackground(el) {
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    const bg = window.getComputedStyle(node).backgroundColor;
    if (!isTransparent(bg)) return bg;
    node = node.parentElement;
  }
  return '';
}

/**
 * Collect the leading run of chrome blocks under `scope`. Only the
 * leading blocks count, so a KPI grid or a table below the header can
 * never be pinned. Values come from the live DOM, so a page whose
 * header is not rendered (embedded hub child) simply yields no run.
 */
function findChromeRun(scope, depth) {
  const run = [];
  for (const el of Array.from(scope.children)) {
    if (!isChrome(el)) break;
    if (el.getBoundingClientRect().height <= 0) break; // rendered but hidden
    run.push(el);
  }
  if (run.length) return isStrongChrome(run[0]) ? run : [];
  if (depth <= 0) return [];
  const first = scope.firstElementChild;
  if (!first || !canDescend(first)) return [];
  return findChromeRun(first, depth - 1);
}

/** Nearest scroll container above `el` (null when the window is the scroller). */
function nearestScroller(el, stopAt) {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') return node;
    if (node === stopAt) return null;
    node = node.parentElement;
  }
  return null;
}

const capture = (el) => ({
  el,
  position: el.style.position,
  top: el.style.top,
  zIndex: el.style.zIndex,
  background: el.style.background,
  overflow: el.style.overflow,
});

const restore = ({ el, position, top, zIndex, background, overflow }) => {
  el.style.position = position;
  el.style.top = top;
  el.style.zIndex = zIndex;
  el.style.background = background;
  el.style.overflow = overflow;
  el.classList.remove(STICKY_CLASS);
};

/**
 * A page shell that carries `overflow: hidden/auto` but has an auto height
 * never scrolls in this app (the document scrolls instead) — yet it is still
 * a scroll container, and a sticky child would be pushed down inside it by
 * its own `top` offset instead of pinning to the viewport. Neutralising those
 * inert boxes with `overflow: clip` keeps the clipping identical while
 * restoring sticky behaviour. Boxes that DO scroll are left alone, because a
 * header inside a real scroll area already pins correctly and an inner
 * table/list keeps its own scroll position.
 */
function neutralizeInertScrollers(run, host, record) {
  const seen = new Set();
  run.forEach((el) => {
    let node = el.parentElement;
    while (node && node !== host) {
      const { overflowY } = window.getComputedStyle(node);
      const isScrollContainer =
        overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden';
      if (isScrollContainer && !seen.has(node) && node.scrollHeight <= node.clientHeight + 1) {
        seen.add(node);
        record(node);
        node.style.overflow = 'clip';
      }
      node = node.parentElement;
    }
  });
}

export default function useStickyPageHeader(hostRef) {
  const location = useLocation();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let applied = [];
    let observers = [];
    let frame = 0;
    let timers = [];

    function detachObservers() {
      observers.forEach((observer) => observer.disconnect());
      observers = [];
    }

    function reset() {
      detachObservers();
      applied.forEach(restore);
      applied = [];
    }

    function apply() {
      reset();

      const run = findChromeRun(host, 2);
      const viewport = window.innerHeight || 0;
      let stackBottom = TOPBAR_H;

      if (run.length) {
        /* Must happen before any `top` is applied, otherwise the offset would
           shift the header down inside an inert box instead of pinning it. */
        neutralizeInertScrollers(run, host, (node) => applied.push(capture(node)));

        const background = inheritedBackground(run[0]);
        const styles = run.map((el) => window.getComputedStyle(el));
        const marginsTop = styles.map((style) => parseFloat(style.marginTop) || 0);

        /* Work out which blocks fit the pinned stack, and where each sits. */
        const blocks = [];
        let consumed = TOPBAR_H;
        run.forEach((el, index) => {
          const height = el.getBoundingClientRect().height;
          const nextTop = index + 1 < run.length ? marginsTop[index + 1] : 0;
          if (index > 0 && consumed + height > viewport * MAX_RUN_RATIO) return;
          blocks.push({ el, style: styles[index], top: consumed, background });
          consumed += height + (parseFloat(styles[index].marginBottom) || 0) + nextTop;
        });
        stackBottom = consumed;

        blocks.forEach((block, index) => {
          const { el, style, top } = block;
          applied.push(capture(el));
          el.classList.add(STICKY_CLASS);
          el.style.position = 'sticky';
          el.style.top = `${Math.round(top)}px`;
          el.style.zIndex = String(Z_BASE - index);
          /* Only fill in a background when the block has none of its own —
             designed backgrounds (production .page-header) stay untouched. */
          if (
            isTransparent(style.backgroundColor) &&
            style.backgroundImage === 'none' &&
            block.background
          ) {
            el.style.background = block.background;
          }
        });

        /* Re-stack when a block resizes (wrapping title, responsive chips). */
        if (typeof ResizeObserver !== 'undefined') {
          const resizeObserver = new ResizeObserver(() => schedule());
          run.forEach((el) => resizeObserver.observe(el));
          observers.push(resizeObserver);
        }
        /* A late-rendering header (async page state) must be picked up too —
           the subtree watch is rAF-coalesced by schedule(). */
        const mutationObserver = new MutationObserver(() => schedule());
        mutationObserver.observe(host, { childList: true, subtree: true });
        observers.push(mutationObserver);
      }

      /* Dock in-content sticky blocks (table heads, sticky section headers)
         below the pinned chrome — only when the window is their scroll
         container, so tables inside a horizontally scrolling wrapper keep
         the offset they already had. */
      const contentTop = `${Math.round(run.length ? stackBottom : TOPBAR_H)}px`;
      Array.from(host.querySelectorAll(CONTENT_STICKY_SELECTOR)).forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.position !== 'sticky' || style.top === 'auto') return;
        if (nearestScroller(el, host)) return;
        applied.push(capture(el));
        el.style.top = contentTop;
      });
    }

    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    }

    schedule();
    /* Late passes catch routes whose header only appears after their first
       data load (e.g. production sub-pages). */
    timers = [120, 400, 900, 1600, 2600].map((ms) => window.setTimeout(schedule, ms));

    const onResize = () => schedule();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      timers.forEach((timer) => clearTimeout(timer));
      cancelAnimationFrame(frame);
      reset();
    };
  }, [hostRef, location.pathname, location.search]);
}
