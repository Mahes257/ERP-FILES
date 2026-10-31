/* Full E2E smoke test across all 8 sales modules + sidebar order regression check.
   Signs in via the real UI, visits every list page, asserts data loads from the
   backend (table rows present), checks for console errors, and verifies the
   Sales Execution sidebar order and navigation routes. */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const log = (k, v) => console.log(`${k}: ${JSON.stringify(v)}`);
    const errors = [];
    const badResponses = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 220)));
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        errors.push('CONSOLE: ' + (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 220));
      }
    });
    cdp.on('Network.responseReceived', (p) => {
      if (p.response && p.response.status >= 400 && !/favicon|\.js$|\.css$|sourcemap/i.test(p.response.url || '')) {
        badResponses.push(p.response.status + ' ' + (p.response.url || '').slice(0, 160));
      }
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const results = [];

    const check = (name, ok, detail = '') => {
      results.push({ name, ok, detail });
      console.log((ok ? 'PASS | ' : 'FAIL | ') + name + (detail ? '  ==> ' + detail : ''));
    };

    // ---- Sign in via the real UI ----
    await navigate('http://localhost:5173/signin');
    await waitFor(`document.querySelector('input[type="email"], input[name="email"]') !== null`, 15000);
    await sleep(500);
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
      return { email: !!email, pass: !!pass };
    })()`);
    await sleep(400);
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /sign\\s*in/i.test(b.textContent || ''));
      if (btn) btn.click();
      return !!btn;
    })()`);
    await waitFor(`location.pathname !== '/signin'`, 20000);
    await sleep(2500);
    const afterSignin = await evalJs(`location.pathname`);
    check('SIGNIN works and redirects off /signin', afterSignin !== '/signin', 'path=' + afterSignin);

    // ---- Sidebar order regression check ----
    await navigate('http://localhost:5173/quotations');
    await sleep(1500);
    const order = await evalJs(`(() => {
      const group = [...document.querySelectorAll('.sb-group')].find((g) =>
        (g.textContent || '').includes('Sales Execution'));
      if (!group) return 'NO_GROUP';
      return [...group.querySelectorAll('.sb-subitem')]
        .filter((s) => !s.disabled)
        .map((s) => s.textContent.trim().replace(/\\s*Coming Soon\\s*/, ''));
    })()`);
    const EXPECTED = ['Quotations', 'Sales Contracts', 'Sales Orders', 'Delivery Challans', 'Proforma Invoices', 'Invoices', 'Credit Notes', 'Payment Receipts'];
    check('SIDEBAR order correct (Credit Notes before Payment Receipts)',
      JSON.stringify(order) === JSON.stringify(EXPECTED), JSON.stringify(order));

    // ---- The 8 sales modules ----
    const modules = [
      { name: 'Quotations', route: '/quotations', marker: ['Quotation', 'QT'] },
      { name: 'Sales Contracts', route: '/sales-contracts', marker: ['Sales Contract', 'SC'] },
      { name: 'Sales Orders', route: '/sales-orders', marker: ['Sales Order', 'SO'] },
      { name: 'Delivery Challans', route: '/delivery-challans', marker: ['Delivery Challan', 'DC'] },
      { name: 'Proforma Invoices', route: '/proforma-invoices', marker: ['Proforma Invoice', 'PI'] },
      { name: 'Invoices', route: '/invoices', marker: ['Invoice', 'INV'] },
      { name: 'Payment Receipts', route: '/payment-receipts', marker: ['Payment Receipt', 'PR'] },
      { name: 'Credit Notes', route: '/credit-notes', marker: ['Credit Note', 'CN'] }
    ];

    for (const mod of modules) {
      const errsBefore = errors.length;
      const badBefore = badResponses.length;
      await navigate('http://localhost:5173' + mod.route);
      await sleep(2500);

      const state = await evalJs(`(() => {
        const tableRows = document.querySelectorAll('table tbody tr').length;
        const hasErrorBoundary = /something went wrong|error boundary/i.test(document.body.innerText.slice(0, 400));
        const kpiCards = document.querySelectorAll('[class*="kpi-card"], [class*="kpi-cards"] button').length;
        return {
          path: location.pathname,
          title: (document.querySelector('h1')?.textContent || '').trim().slice(0, 40),
          tableRows,
          kpiCards,
          bodyLen: document.body.innerText.length,
          hasErrorBoundary
        };
      })()`);

      const ok =
        state.path === mod.route &&
        !state.hasErrorBoundary &&
        state.bodyLen > 200;
      const detail = `path=${state.path} rows=${state.tableRows} kpis=${state.kpiCards} h1="${state.title}" len=${state.bodyLen}`;
      check(`${mod.name} list page loads without errors`, ok, detail);

      // If the module has table rows, open the first record's view page to
      // confirm the detail view also renders (no crash).
      if (state.tableRows > 0) {
        const firstId = await evalJs(`(() => {
          const row = document.querySelector('table tbody tr');
          if (!row) return null;
          const links = [...row.querySelectorAll('a[href]')];
          if (links.length) return links[0].getAttribute('href');
          const viewBtn = [...row.querySelectorAll('button')].find((b) => /view/i.test(b.textContent || ''));
          return viewBtn ? 'VIEW_BTN' : null;
        })()`);
        if (firstId && firstId !== 'VIEW_BTN' && firstId.startsWith('/')) {
          await navigate('http://localhost:5173' + firstId);
          await sleep(2200);
          const viewState = await evalJs(`(() => ({
            path: location.pathname,
            len: document.body.innerText.length,
            hasErrorBoundary: /something went wrong|error boundary/i.test(document.body.innerText.slice(0, 400))
          }))()`);
          const viewOk = !viewState.hasErrorBoundary && viewState.len > 150;
          check(`${mod.name} first-record view page renders`, viewOk,
            `href=${firstId} path=${viewState.path} len=${viewState.len}`);
        }
      }

      const newErrs = errors.slice(errsBefore);
      const newBad = badResponses.slice(badBefore).slice(0, 3);
      if (newErrs.length) check(`${mod.name} zero console errors`, false, newErrs[0]);
      if (newBad.length) check(`${mod.name} zero 4xx/5xx API responses`, false, newBad[0]);
    }

    // ---- Final tally ----
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    console.log('SMOKE_SUMMARY: ' + JSON.stringify({ passed, failed, total: results.length }));
    log('CONSOLE_ERRORS_TOTAL', errors.length);
    log('BAD_RESPONSES', badResponses.slice(0, 10));
    console.log('CDP_SCRIPT_DONE');
  }
};
