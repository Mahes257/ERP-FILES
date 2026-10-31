/*
 * VERIFY GOLD SIDEBAR NOTIFICATION BELLS IN THE BROWSER.
 * Usage: node cdp-driver.cjs 9222 scripts/cdp-verify-sidebar-bells.cjs
 *
 * Checks:
 *   1. Old round/red pills (.sb-pending-count) are GONE everywhere.
 *   2. Gold bell (.sb-bell + inline SVG) renders with the count INSIDE the
 *      bell body; count text matches its aria-label; bell svg is gold.
 *   3. Bell sits far right of each section row (right of the label, left of /
 *      next to the chevron), never overlapping label text, no width shift.
 *  4. The bottom "Pending Approvals" utility row also shows a gold bell.
 *  5. SALES hierarchy is untouched: CRM / CPR / Sales Execution branches and
 *      the nested Customer Purchase Order sub-branch still expand and the
 *      labels/order are unchanged.
 *  6. Collapsed (icon-rail) state positions each bell absolutely top-right,
 *      inside the rail, with a smaller count — no overflow.
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
    await sleep(2600);

    await navigate(BASE + '/quotations');
    await sleep(1800);

    // ---- Expanded sidebar: bells present, old pills gone ----
    const expanded = await evalJs(`(() => {
      const aside = document.getElementById('app-sidebar');
      const asideW = aside.getBoundingClientRect().width;
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const oldPills = document.querySelectorAll('.sb-pending-count').length;

      // Collect bell element details (expanded layout)
      const bells = [];
      for (const bell of document.querySelectorAll('.sb-bell')) {
        const cs = getComputedStyle(bell);
        const bellR = bell.getBoundingClientRect();
        const svg = bell.querySelector('.sb-bell-svg');
        const countEl = bell.querySelector('.sb-bell-count');
        const countR = countEl.getBoundingClientRect();
        const svgR = svg.getBoundingClientRect();
        const parent = bell.closest('.sb-nav-item') || bell.closest('.sb-subitem');
        const parR = parent.getBoundingClientRect();
        const label = parent.querySelector('.sb-label--flex') || parent.querySelector('.sb-subitem-label') || parent.querySelector('.sb-label');
        const labelR = label ? label.getBoundingClientRect() : null;
        const chevron = parent.querySelector('.sb-group-chevron');
        const chevR = chevron ? chevron.getBoundingClientRect() : null;
        const path = svg ? svg.querySelector('path') : null;
        const stops = svg ? [...svg.querySelectorAll('linearGradient stop')].map((s) => s.getAttribute('stop-color')) : [];
        // center of count must sit inside the bell's box (i.e. inside the bell body)
        const countInsideBell = countR.left >= bellR.left && countR.right <= bellR.right &&
                                countR.top >= bellR.top && countR.bottom <= bellR.bottom &&
                                (countR.top + countR.height / 2) <= bellR.top + bellR.height * 0.6;
        bells.push({
          text: countEl.textContent,
          label: bell.getAttribute('aria-label'),
          w: Math.round(bellR.width), h: Math.round(bellR.height),
          svgW: Math.round(svgR.width), svgH: Math.round(svgR.height),
          fillPath: path ? path.getAttribute('fill') : null,
          stops,
          rightGap: Math.round(parR.right - bellR.right),
          chevGap: chevR ? Math.round(chevR.left - bellR.right) : null,
          labelGap: labelR ? Math.round(bellR.left - labelR.right) : null,
          countInsideBell,
          fontSize: cs.fontSize,
          marginLeft: cs.marginLeft
        });
      }
      return { asideWidth: asideW, hScroll: overflow, oldPills, bellCount: bells.length, bells };
    })()`);
    log('BELLS_EXPANDED', expanded);

    const bells = expanded.bells;
    const goldOk = bells.every((b) =>
      b.w >= 18 && b.w <= 26 && b.h >= 18 && b.h <= 26 &&
      b.svgW === b.w && b.svgH === b.h &&
      (b.stops.includes('#fcd34d') || b.stops.includes('#fbbf24')) &&
      b.countInsideBell && b.rightGap >= 0 && (b.chevGap === null || b.chevGap >= 2) &&
      (b.labelGap === null || b.labelGap >= 4) &&
      /^[0-9]+(\\+)?$/.test(b.text) &&
      b.label === b.text + ' pending approval(s)');
    log('EXPANDED_CHECKS', {
      oldPillsGone: expanded.oldPills === 0,
      bellsRendered: bells.length >= 3,
      goldOk,
      noHScroll: expanded.hScroll <= 0,
      widthStable: expanded.asideWidth === 260
    });

    await shot('sidebar-gold-bells-expanded');

    // ---- Hierarchy intact: branches + nested CPO + labels/order ----
    const tree = await evalJs(`(() => {
      const labels = [];
      for (const el of document.querySelectorAll('.sb-nav-item, .sb-subitem')) {
        const l = el.querySelector('.sb-label') || el.querySelector('.sb-subitem-label');
        if (l && l.textContent.trim()) labels.push(l.textContent.trim());
      }
      const crmOpen = document.querySelector('#sb-crm')?.closest('.sb-group')?.getAttribute('data-open');
      const cpoOpen = document.querySelector('#sb-cpo')?.closest('.sb-group')?.getAttribute('data-open');
      const labelsText = labels.join(' | ');
      return {
        hasCRM: labels.includes('CRM'), hasCPR: labels.includes('CPR (Customer Purchase Request)'),
        hasSalesExec: labels.includes('Sales Execution'), hasCPO: labels.includes('Customer Purchase Order'),
        cpoNestedBelowSalesExec: labelsText.indexOf('Sales Execution') < labelsText.indexOf('Customer Purchase Order'),
        crmOpen, cpoOpen
      };
    })()`);
    log('TREE', tree);

    // Toggle branches still work independently
    await evalJs(`(() => {
      const crm = [...document.querySelectorAll('.sb-nav-item')].find((b) => (b.querySelector('.sb-label')?.textContent || '').trim() === 'CRM');
      if (crm) crm.click();
      return !!crm;
    })()`);
    await sleep(500);
    const crmClosed = await evalJs(`document.querySelector('#sb-crm')?.closest('.sb-group')?.getAttribute('data-open')`);
    await evalJs(`(() => {
      const crm = [...document.querySelectorAll('.sb-nav-item')].find((b) => (b.querySelector('.sb-label')?.textContent || '').trim() === 'CRM');
      if (crm) crm.click();
      return !!crm;
    })()`);
    await sleep(500);
    const crmReopened = await evalJs(`document.querySelector('#sb-crm')?.closest('.sb-group')?.getAttribute('data-open')`);
    log('TOGGLE_CRM', { crmClosed, crmReopened });

    // Navigate a leaf next to a bell → routes still work + active highlight
    await evalJs(`(() => {
      const leaf = [...document.querySelectorAll('.sb-subitem')].find((b) => (b.querySelector('.sb-subitem-label')?.textContent || '').trim() === 'Cost Workout (CW)');
      if (leaf) leaf.click();
      return !!leaf;
    })()`);
    await waitFor(`location.pathname === '/cost-workouts'`, 20000);
    await sleep(1200);
    const active = await evalJs(`(() => {
      const activeItem = document.querySelector('.sb-subitem.is-active');
      const activeLeaf = activeItem?.querySelector('.sb-subitem-label')?.textContent?.trim();
      const activeOnCostWorkouts = location.pathname === '/cost-workouts';
      return { activeLeaf, activeOnCostWorkouts };
    })()`);
    log('NAV_ACTIVE', active);

    await navigate(BASE + '/quotations');
    await sleep(1500);

    // ---- Collapsed icon-rail: absolute top-right, small ----
    const collapsed = await evalJs(`(() => {
      const aside = document.getElementById('app-sidebar');
      aside.classList.remove('expanded');
      const w = aside.getBoundingClientRect().width;
      const overW = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const out = [];
      for (const bell of document.querySelectorAll('.sb-bell')) {
        const r = bell.getBoundingClientRect();
        const cs = getComputedStyle(bell);
        const countEl = bell.querySelector('.sb-bell-count');
        const par = bell.closest('.sb-nav-item') || bell.closest('.sb-subitem');
        const parR = par.getBoundingClientRect();
        out.push({
          text: countEl.textContent,
          pos: cs.position,
          insideRail: r.left >= 0 && r.right <= w,
          rightGapToRail: Math.round(w - r.right),
          insideNavRow: r.top >= parR.top && r.bottom <= parR.bottom,
          fontSize: getComputedStyle(countEl).fontSize
        });
      }
      window.__collapsedForShot = true;
      return { railWidth: w, hScroll: overW, bells: out };
    })()`);
    await sleep(500);
    await shot('sidebar-gold-bells-collapsed');
    await evalJs(`(() => {
      document.getElementById('app-sidebar').classList.add('expanded');
      window.__collapsedForShot = false;
      return true;
    })()`);
    await sleep(500);
    log('BELLS_COLLAPSED', collapsed);
    log('COLLAPSED_CHECKS', {
      railOk: collapsed.railWidth === 72,
      noHScroll: collapsed.hScroll <= 0,
      bellsInsideRail: collapsed.bells.length === expanded.bellCount &&
        collapsed.bells.every((b) => b.pos === 'absolute' && b.insideRail && b.insideNavRow && parseFloat(b.fontSize) <= 6.5)
    });

    // ---- Bottom Pending Approvals row also uses the gold bell ----
    const pendingRow = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('.sb-bottom .sb-nav-item')].find((b) => /Pending Approvals/i.test(b.textContent));
      const bell = btn?.querySelector('.sb-bell');
      return {
        hasPendingRow: !!btn,
        hasGoldBell: !!bell,
        bellText: bell?.querySelector('.sb-bell-count')?.textContent || null
      };
    })()`);
    log('PENDING_ROW', pendingRow);

    log('CONSOLE_ERRORS', errors);
    const fatal = !(expanded.oldPills === 0 && bells.length >= 3 && goldOk &&
      tree.hasCRM && tree.hasCPR && tree.hasSalesExec && tree.hasCPO && tree.cpoNestedBelowSalesExec &&
      crmReopened === 'true' && active.activeOnCostWorkouts && active.activeLeaf === 'Cost Workout (CW)' &&
      collapsed.railWidth === 72 && collapsed.hScroll <= 0 &&
      collapsed.bells.length === expanded.bellCount && pendingRow.hasGoldBell);
    console.log(fatal ? 'CDP_SCRIPT_FAILED' : 'CDP_SCRIPT_DONE');
  }
};