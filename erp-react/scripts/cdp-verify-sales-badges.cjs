/*
 * VERIFY PREMIUM SIDEBAR NOTIFICATION BADGES IN THE BROWSER.
 * Usage: node cdp-driver.cjs 9222 scripts/cdp-verify-sales-badges.cjs
 *
 * Checks:
 *   1. Badges are compact pills (consistent 18px height, full radius, padding).
 *   2. Premium styling: refined red bg, darker red border, subtle shadow,
 *      white text, semi-bold weight.
 *   3. Positioning: badge sits right-aligned; never overlaps text or the
 *      group chevron; no sidebar width shift / horizontal scroll.
 *   4. All existing counts still rendered with correct numbers.
 *   5. Collapsed (icon-rail) state keeps badges positioned correctly.
 */
const BASE = process.env.BASE || 'http://localhost:5173';

module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor, shot } = helpers;
    const log = (k, v) => console.log(k + ': ' + JSON.stringify(v));
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');

    await navigate(BASE + '/signin');
    await waitFor(`document.querySelector('input[type="email"], input[name="email"]') !== null`);
    await sleep(400);
    await evalJs(`(() => {
      const setVal = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const email = document.querySelector('input[type="email"], input[name="email"]');
      const pass = document.querySelector('input[type="password"]');
      if (email) setVal(email, 'admin@vishaktech.com');
      if (pass) setVal(pass, 'Admin@123');
      return true;
    })()`);
    await sleep(300);
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /sign\\s*in/i.test(b.textContent || ''));
      if (btn) btn.click();
      return !!btn;
    })()`);
    await waitFor(`location.pathname !== '/signin'`, 30000);
    await sleep(2500);

    await navigate(BASE + '/quotations');
    await sleep(1500);

    // ---- 1+2+4: badge styles + counts (expanded) ----
    const badges = await evalJs(`(() => {
      const aside = document.getElementById('app-sidebar');
      const asideW = aside.getBoundingClientRect().width;
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const out = [];
      for (const b of document.querySelectorAll('.sb-pending-count')) {
        const cs = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        const parent = b.closest('.sb-nav-item') || b.closest('.sb-subitem');
        const parR = parent.getBoundingClientRect();
        const chevron = parent.querySelector('.sb-group-chevron');
        const chevR = chevron ? chevron.getBoundingClientRect() : null;
        out.push({
          text: b.textContent,
          height: r.height,
          minWidth: cs.minWidth,
          padding: cs.paddingLeft + '/' + cs.paddingRight,
          radius: cs.borderRadius,
          background: cs.backgroundColor,
          border: cs.borderTopWidth + ' ' + cs.borderTopColor,
          shadow: cs.boxShadow.slice(0, 60),
          color: cs.color,
          weight: cs.fontWeight,
          fontSize: cs.fontSize,
          rightGap: parR.right - r.right,
          chevGap: chevR ? chevR.left - r.right : null
        });
      }
      return { asideWidth: asideW, hScroll: overflow, badges: out };
    })()`);
    log('BADGES_EXPANDED', badges);

    const pillOk = badges.badges.every((b) =>
      b.height === 18 && b.radius === '9999px' && b.padding === '6px/6px' && b.color === 'rgb(255, 255, 255)' &&
      b.background === 'rgb(185, 28, 28)' && parseFloat(b.fontSize) >= 10 && b.weight === '600');
    const noOverlap = badges.badges.every((b) => (b.chevGap === null ? true : b.chevGap > 4) && b.rightGap >= 0);
    log('EXPANDED_CHECKS', { pillOk, noOverlap, widthStable: badges.asideWidth === 260, noHScroll: badges.hScroll <= 0 });

    await shot('salesnav-premium-badges');

    // ---- 3+5: collapsed icon-rail state ----
    const collapsed = await evalJs(`(() => {
      const aside = document.getElementById('app-sidebar');
      aside.classList.remove('expanded');
      const w = aside.getBoundingClientRect().width;
      const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const out = [];
      for (const b of document.querySelectorAll('.sb-pending-count')) {
        const cs = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        const parent = b.closest('.sb-nav-item') || b.closest('.sb-subitem');
        const parR = parent.getBoundingClientRect();
        out.push({
          text: b.textContent,
          height: r.height,
          fontSize: cs.fontSize,
          position: cs.position,
          insideRail: r.left >= 0 && r.right <= w,
          rightGapToRail: w - r.right,
          topOverlapNav: r.top >= parR.top && r.bottom <= parR.bottom
        });
      }
      aside.classList.add('expanded');
      return { railWidth: w, hScroll: over, badges: out };
    })()`);
    log('BADGES_COLLAPSED', collapsed);
    log('COLLAPSED_CHECKS', {
      railOk: collapsed.railWidth === 72,
      noHScroll: collapsed.hScroll <= 0,
      allInside: collapsed.badges.every((b) => b.insideRail && b.topOverlapNav && parseFloat(b.fontSize) <= 9)
    });

    log('CONSOLE_ERRORS', errors);
    console.log('CDP_SCRIPT_DONE');
  }
};
