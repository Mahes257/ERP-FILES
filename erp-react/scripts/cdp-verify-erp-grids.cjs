/* Verify all 6 sales modules render the ERP stat-card grid:
 *   8 cards → 5 columns on row 1, remainder on row 2 (SO/DC/PI/INV/CN)
 *   6 cards → 5 + 1 (Payment Receipts)
 * Checks: card count, label order, computed grid columns, row geometry,
 * equal widths, no horizontal overflow, KPI click filtering, console errors.
 */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs } = helpers;
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry && p.entry.level === 'error') errors.push('LOG: ' + p.entry.text);
    });

    const modules = [
      { route: '/sales-orders', expect: 8 },
      { route: '/delivery-challans', expect: 8 },
      { route: '/proforma-invoices', expect: 8 },
      { route: '/invoices', expect: 8 },
      { route: '/credit-notes', expect: 8 },
      { route: '/payment-receipts', expect: 6 }
    ];

    const base = 'http://localhost:5173';

    // Sign in if the session expired (app redirects to /signin).
    await navigate(base + '/sales-orders');
    await sleep(3000);
    const needsLogin = await evalJs(`!!document.querySelector('input[type=email]')`);
    if (needsLogin) {
      await evalJs(`(() => {
        const setVal = (el, v) => {
          const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setVal(document.querySelector('input[type=email]'), 'admin@vishaktech.com');
        setVal(document.querySelector('input[type=password]'), 'Admin@123');
        document.querySelector('button[type=submit]').click();
      })()`);
      await waitFor(`!location.href.includes('signin')`, 20000);
      await sleep(2500);
      console.log('LOGIN_DONE');
    } else {
      await sleep(1500);
    }

    const results = [];
    for (const mod of modules) {
      await navigate(base + mod.route);
      await waitFor(`document.querySelectorAll('button').length > 3`, 25000);
      await sleep(1800);
      const info = await evalJs(`(() => {
        const grid = document.querySelector('.sales-kpi-grid');
        const cards = grid ? Array.from(grid.querySelectorAll('button')) : [];
        const cs = grid ? getComputedStyle(grid) : null;
        const tops = cards.map((c) => Math.round(c.getBoundingClientRect().top));
        const distinctTops = [...new Set(tops)].sort((a, b) => a - b);
        const widths = [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().width)))];
        return {
          gridFound: !!grid,
          gridClass: grid ? grid.className : null,
          cols: cs ? cs.gridTemplateColumns.split(' ').length : 0,
          gap: cs ? cs.gap : null,
          count: cards.length,
          labels: cards.map((c) => c.querySelector('.text-\\\\[10px\\\\]') ? c.querySelector('.text-\\\\[10px\\\\]').textContent.trim() : ''),
          rows: distinctTops.map((t) => tops.filter((x) => x === t).length),
          widths,
          overflow: grid ? grid.scrollWidth - grid.clientWidth : null
        };
      })()`);
      results.push({ route: mod.route, expect: mod.expect, ...info });
    }

    // KPI click filtering check on Sales Orders (Completed card must filter).
    await navigate('http://localhost:5173/sales-orders');
    await waitFor(`document.querySelectorAll('button').length > 3`, 25000);
    await sleep(1500);
    const clickCheck = await evalJs(`(async () => {
      const cards = Array.from(document.querySelectorAll('.sales-kpi-grid button'));
      const completed = cards.find((c) => c.textContent.includes('Completed'));
      const allCard = cards.find((c) => c.textContent.includes('All Orders'));
      if (!completed || !allCard) return { error: 'cards missing' };
      allCard.click();
      await new Promise((r) => setTimeout(r, 600));
      const before = allCard.className;
      completed.click();
      await new Promise((r) => setTimeout(r, 1200));
      const active = cards.find((c) => c.className.includes('border-[#0B4A3D]'));
      const url = location.href;
      // toggle back to All
      allCard.click();
      await new Promise((r) => setTimeout(r, 1200));
      return {
        activeAfterClick: active ? active.textContent.replace(/\\s+/g, ' ').trim() : null,
        urlAfterClick: url,
        backToAll: allCard.className.includes('border-[#0B4A3D]')
      };
    })()`);

    console.log(JSON.stringify({ modules: results, clickCheck, errors }, null, 2));
  }
};
