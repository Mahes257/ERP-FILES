/* Click sortable ERP headers on the CRM pages and confirm the list still
   loads (no Spring PropertyReferenceException 500 from invalid sort params). */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const badResponses = [];
    cdp.on('Network.responseReceived', (p) => {
      if (p.response && p.response.status >= 400 && !/favicon|\.js$|\.css$|sourcemap/i.test(p.response.url || '')) {
        badResponses.push(p.response.status + ' ' + (p.response.url || '').slice(0, 140));
      }
    });
    await cdp.send('Network.enable');

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
    })()`);
    await sleep(400);
    await evalJs(`[...document.querySelectorAll('button')].find((b) => /sign\\s*in/i.test(b.textContent || ''))?.click()`);
    await waitFor(`location.pathname !== '/signin'`, 20000);
    await sleep(2500);

    const pages = [
      { route: '/clients', headers: ['Client Code', 'Business Name', 'Contact Person', 'Status'] },
      { route: '/leads', headers: ['Lead No', 'Contact Person', 'Expected Value', 'Stage', 'Status'] },
      { route: '/followups', headers: ['Date', 'Customer', 'Lead Stage', 'Status'] }
    ];

    for (const page of pages) {
      await navigate('http://localhost:5173' + page.route);
      await sleep(2500);
      for (const header of page.headers) {
        const before = badResponses.length;
        const clicked = await evalJs(`(() => {
          const th = [...document.querySelectorAll('.crm-erp-table-card thead th')].find((t) =>
            t.textContent.trim().replace(/[\\u25B2\\u25BC]/g, '').trim() === ${JSON.stringify(header)});
          if (!th) return false;
          th.click();
          return true;
        })()`);
        await sleep(1200);
        const rows = await evalJs(`document.querySelectorAll('.crm-erp-table-card tbody tr').length`);
        const newBad = badResponses.slice(before);
        const ok = clicked && rows > 0 && newBad.length === 0;
        console.log((ok ? 'PASS | ' : 'FAIL | ') + page.route + ' sort by "' + header + '"' + (ok ? '' : '  rows=' + rows + ' bad=' + newBad.join(',')));
      }
    }
    console.log('SORT_DONE bad=' + badResponses.join(' | '));
  }
};
