/* Confirm KPI cards render on shared-module list pages + view pages open */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const log = (k, v) => console.log(`${k}: ${JSON.stringify(v)}`);
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 220)));
    await cdp.send('Runtime.enable');

    await navigate('http://localhost:5173/signin');
    await waitFor(`document.querySelector('input[type="email"], input[name="email"]') !== null`, 15000);
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
    await waitFor(`location.pathname !== '/signin'`, 20000);
    await sleep(2500);

    // KPI cards on the 5 shared modules (SalesListPage uses .sales-kpi-grid)
    for (const mod of ['sales-orders', 'delivery-challans', 'proforma-invoices', 'invoices', 'credit-notes']) {
      await navigate('http://localhost:5173/' + mod);
      await sleep(2200);
      const kpi = await evalJs(`(() => {
        const grid = document.querySelector('.sales-kpi-grid');
        const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
        const cards = grid ? grid.querySelectorAll('button, [role="button"], .kpi-card').length : 0;
        const gridCards = grid ? grid.children.length : 0;
        return { cols, explicitCards: cards, children: gridCards, hasGrid: !!grid };
      })()`);
      console.log(`KPI_${mod.toUpperCase()}: ${JSON.stringify(kpi)}`);
    }

    // View pages open via row action menu for Sales Orders + Payment Receipts
    for (const mod of ['sales-orders', 'payment-receipts']) {
      await navigate('http://localhost:5173/' + mod);
      await sleep(2200);
      const clicked = await evalJs(`(() => {
        const row = document.querySelector('table tbody tr');
        if (!row) return 'NO_ROW';
        // Click the actions/kebab menu button in the first row
        const menuBtn = [...row.querySelectorAll('button')].find((b) =>
          b.getAttribute('aria-label') === 'Actions' ||
          b.getAttribute('aria-haspopup') === 'menu' ||
          /actions/i.test(b.getAttribute('aria-label') || ''));
        if (menuBtn) { menuBtn.click(); return 'MENU_CLICKED'; }
        return 'NO_MENU';
      })()`);
      await sleep(800);
      const viewClicked = await evalJs(`(() => {
        const items = [...document.querySelectorAll('[role="menuitem"], [class*="menu-item"], button')].filter((b) =>
          /view/i.test(b.textContent || ''));
        if (!items.length) return false;
        items[0].click();
        return true;
      })()`);
      await sleep(2200);
      const state = await evalJs(`(() => ({
        path: location.pathname,
        len: document.body.innerText.length,
        err: /something went wrong|error boundary/i.test(document.body.innerText.slice(0, 300))
      }))()`);
      console.log(`VIEW_${mod.toUpperCase()}: ${JSON.stringify({ clicked, viewClicked, state })}`);
    }

    console.log('CONSOLE_ERRORS: ' + JSON.stringify(errors));
    console.log('CDP_SCRIPT_DONE');
  }
};
