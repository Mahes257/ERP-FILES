/*
 * FINAL CLICK-TO-TOGGLE TEST for the NEW SALES sidebar.
 * Usage: node cdp-driver.cjs 9222 scripts/cdp-verify-sales-click-visibility.cjs
 *
 * For each branch (CRM, CPR, Sales Execution, Customer Purchase Order):
 *   click once  -> children visually visible (grid 1fr/height>0, opacity 1)
 *   click again -> children visually hidden (grid 0fr/height 0, opacity 0)
 * Also verifies branches do not control each other and SALES heading is inert.
 */
const BASE = process.env.BASE || 'http://localhost:5173';

module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const log = (k, v) => console.log(k + ': ' + JSON.stringify(v));
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');

    await navigate(BASE + '/signin');
    await waitFor(`document.querySelector('input[type="email"], input[name="email"]') !== null`);
    await sleep(700);
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

    const groupById = (id) => `document.getElementById(${JSON.stringify(id)}).closest('.sb-group')`;
    const visibility = async (id, childText) => evalJs(`(() => {
      const g = ${groupById(id)};
      if (!g) return 'MISSING';
      const children = g.querySelector('.sb-group-children');
      const open = g.getAttribute('data-open');
      const cs = getComputedStyle(children);
      const effectiveVisible = cs.gridTemplateRows !== '0px' && cs.opacity !== '0';
      return { open, rows: cs.gridTemplateRows, opacity: cs.opacity, effectiveVisible };
    })()`);
    const click = async (id) => evalJs(`(() => {
      const g = ${groupById(id)};
      if (!g) return false;
      g.querySelector('.sb-nav-item').click();
      return true;
    })()`);

    // Ensure a branch is CLOSED before its open->close test (toggle until closed).
    const closeIfNeeded = async (id) => {
      for (let i = 0; i < 2; i++) {
        const v = await visibility(id, '');
        if (v.open === 'false') return;
        await click(id);
        await sleep(350);
      }
    };

    const results = {};

    // 1-2. CRM: open (first click) -> children visible; second click -> hidden
    await closeIfNeeded('sb-crm');
    results.crm = {};
    await click('sb-crm'); await sleep(700);
    results.crm.afterOpenClick = await visibility('sb-crm', '');
    await click('sb-crm'); await sleep(700);
    results.crm.afterCloseClick = await visibility('sb-crm', '');

    // 3-4. CPR
    await closeIfNeeded('sb-sales-cpr');
    results.cpr = {};
    await click('sb-sales-cpr'); await sleep(700);
    results.cpr.afterOpenClick = await visibility('sb-sales-cpr', '');
    await click('sb-sales-cpr'); await sleep(700);
    results.cpr.afterCloseClick = await visibility('sb-sales-cpr', '');

    // 5-6. Sales Execution
    await closeIfNeeded('sb-sales-execution');
    results.salesExec = {};
    await click('sb-sales-execution'); await sleep(700);
    results.salesExec.afterOpenClick = await visibility('sb-sales-execution', '');
    await click('sb-sales-execution'); await sleep(700);
    results.salesExec.afterCloseClick = await visibility('sb-sales-execution', '');

    // 7-9. Customer Purchase Order inside Sales Execution
    await click('sb-sales-execution'); await sleep(700); // Sales Exec open again
    await closeIfNeeded('sb-cpo');
    results.cpo = {};
    await click('sb-cpo'); await sleep(700);
    results.cpo.afterOpenClick = await visibility('sb-cpo', '');
    await click('sb-cpo'); await sleep(700);
    results.cpo.afterCloseClick = await visibility('sb-cpo', '');
    results.cpo.salesExecStillOpen = await visibility('sb-sales-execution', '');

    // 10. CRM stays open while CPR is closed
    results.independence = {};
    await closeIfNeeded('sb-crm');
    await click('sb-crm'); await sleep(700); // CRM open
    await closeIfNeeded('sb-sales-cpr');     // CPR closed
    results.independence.crmOpenWhileCprClosed = (await visibility('sb-crm', '')).open;
    results.independence.cprClosed = (await visibility('sb-sales-cpr', '')).open;

    // 11. Sales Execution stays open while CPO is closed
    await closeIfNeeded('sb-sales-execution');
    await click('sb-sales-execution'); await sleep(700); // Sales Exec open
    await closeIfNeeded('sb-cpo');                       // CPO closed
    results.independence.salesExecOpenWhileCpoClosed = (await visibility('sb-sales-execution', '')).open;
    results.independence.cpoClosed = (await visibility('sb-cpo', '')).open;

    // SALES heading is inert: click it, no branch may change
    const before = await evalJs(`(() => {
      const ids = ['sb-crm', 'sb-sales-cpr', 'sb-sales-execution', 'sb-cpo'];
      return Object.fromEntries(ids.map((id) => [id, document.getElementById(id).closest('.sb-group').getAttribute('data-open')]));
    })()`);
    await evalJs(`document.querySelector('.sb-sales-heading').click()`);
    await sleep(700);
    const after = await evalJs(`(() => {
      const ids = ['sb-crm', 'sb-sales-cpr', 'sb-sales-execution', 'sb-cpo'];
      return Object.fromEntries(ids.map((id) => [id, document.getElementById(id).closest('.sb-group').getAttribute('data-open')]));
    })()`);
    results.independence.salesHeadingInert = JSON.stringify(before) === JSON.stringify(after);

    log('RESULTS', results);
    log('CONSOLE_ERRORS', errors);
    console.log('CDP_SCRIPT_DONE');
  }
};
