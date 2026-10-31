/* CDP inspection: verify 5x2 KPI grid on the 5 target modules and confirm the
 * two unchanged modules (Sales Contracts, Payment Receipts) keep the default grid.
 * Usage: node scripts/cdp-driver.cjs 9222 scripts/cdp-inspect-kpis.cjs
 */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs, shot } = helpers;
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry?.level === 'error') errors.push('LOG: ' + p.entry.text);
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    const routes = [
      ['sales-orders', '/sales-orders', true],
      ['delivery-challans', '/delivery-challans', true],
      ['proforma-invoices', '/proforma-invoices', true],
      ['invoices', '/invoices', true],
      ['credit-notes', '/credit-notes', true],
      ['sales-contracts', '/sales-contracts', false],
      ['payment-receipts', '/payment-receipts', false]
    ];

    const out = [];
    for (const [name, route, expectFive] of routes) {
      await navigate('http://localhost:5173' + route);
      try {
        await waitFor(`document.querySelectorAll('button').length > 3`, 25000);
      } catch { /* keep going */ }
      await sleep(1800);
      const info = await evalJs(`(() => {
        const cards = Array.from(document.querySelectorAll('button')).filter((b) =>
          !!b.querySelector('.text-base.font-bold'));
        const grid = cards[0]?.parentElement || null;
        const body = document.body;
        // group cards by row (rounded top position)
        const rows = [];
        for (const c of cards) {
          const top = Math.round(c.getBoundingClientRect().top);
          const row = rows.find((r) => Math.abs(r.top - top) < 6);
          if (row) row.cards.push(c);
          else rows.push({ top, cards: [c] });
        }
        const rowInfo = rows
          .sort((a, b) => a.top - b.top)
          .map((r) => ({
            top: r.top,
            count: r.cards.length,
            widths: r.cards.map((c) => Math.round(c.getBoundingClientRect().width))
          }));
        return {
          url: location.pathname,
          cardCount: cards.length,
          gridClasses: grid ? grid.className : null,
          rowInfo,
          bodyScrollWidth: body.scrollWidth,
          bodyClientWidth: body.clientWidth,
          hasHorizontalOverflow: body.scrollWidth > body.clientWidth + 2
        };
      })()`);
      out.push(info);
      await shot('kpis-' + name);
    }
    console.log(JSON.stringify({ out, errors }, null, 2));
  }
};
