// Final browser smoke test across key modules post-cleanup.
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;
    const consoleErrors = [];
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error' || p.type === 'warning') {
        consoleErrors.push(`${p.type}: ${(p.args || []).map((a) => a.value || a.description || '').join(' ')}`);
      }
    });
    cdp.on('Runtime.exceptionThrown', (p) => {
      consoleErrors.push(`exception: ${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || ''}`);
    });

    const results = {};

    async function checkPage(name, url, tableSelector) {
      await navigate(url);
      await sleep(4000);
      const info = await evalJs(`(() => {
        const rows = document.querySelectorAll('tbody tr, .data-table tbody tr, table tbody tr').length;
        const kpiCards = document.querySelectorAll('[class*="kpi"], [class*="stat-card"], .sales-kpi-grid > div').length;
        const h1 = document.querySelector('h1')?.textContent?.trim() || null;
        const hasError = !!document.body.textContent.includes('Failed to load');
        return { h1, rows, kpiCards, hasError };
      })()`);
      results[name] = { ...info, url };
    }

    // login first (assume already logged in in the persistent browser session)
    await navigate('http://localhost:5173/clients');
    await sleep(4000);

    results.clients = await evalJs(`(() => {
      const body = document.body.textContent;
      const rows = document.querySelectorAll('tbody tr').length;
      const total = (() => { const m = body.match(/Total Clients[^0-9]*([\\d,]+)/); return m ? m[1] : null; })();
      return { h1: document.querySelector('h1')?.textContent?.trim() || null, rows, total, failed: body.includes('Failed to load') };
    })()`);

    await checkPage('leads', 'http://localhost:5173/leads');
    await checkPage('followups', 'http://localhost:5173/followups');
    await checkPage('quotations', 'http://localhost:5173/quotations');
    await checkPage('salesOrders', 'http://localhost:5173/sales-orders');
    await checkPage('invoices', 'http://localhost:5173/invoices');
    await checkPage('creditNotes', 'http://localhost:5173/credit-notes');
    await checkPage('paymentReceipts', 'http://localhost:5173/payment-receipts');
    await checkPage('cprs', 'http://localhost:5173/cprs');

    await sleep(800);
    results.consoleErrors = consoleErrors.slice(0, 12);
    results.consoleErrorCount = consoleErrors.length;

    console.log('CDP_FINAL_SMOKE ' + JSON.stringify(results));
  }
};
