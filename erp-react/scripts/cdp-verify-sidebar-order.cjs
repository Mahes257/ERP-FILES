/* Verify Sales Execution sidebar order, navigation, and expand/collapse */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const log = (k, v) => console.log(`${k}: ${JSON.stringify(v)}`);
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');

    await navigate('http://localhost:5173/signin');
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
    await waitFor(`location.pathname !== '/signin'`, 20000);
    await sleep(2500);

    await navigate('http://localhost:5173/quotations');
    await sleep(1500);

    // 1. Read the Sales Execution subitem order as rendered
    const order = await evalJs(`(() => {
      const group = [...document.querySelectorAll('.sb-group')].find((g) =>
        (g.textContent || '').includes('Sales Execution'));
      if (!group) return 'NO_GROUP';
      return [...group.querySelectorAll('.sb-subitem')]
        .filter((s) => !s.disabled)
        .map((s) => s.textContent.trim().replace(/\\s*Coming Soon\\s*/, ''));
    })()`);
    log('SALES_EXEC_ORDER', order);

    // 2. Verify each label navigates to the correct route
    const navChecks = [
      ['Quotations', '/quotations'],
      ['Sales Contracts', '/sales-contracts'],
      ['Sales Orders', '/sales-orders'],
      ['Delivery Challans', '/delivery-challans'],
      ['Proforma Invoices', '/proforma-invoices'],
      ['Invoices', '/invoices'],
      ['Credit Notes', '/credit-notes'],
      ['Payment Receipts', '/payment-receipts']
    ];
    const results = [];
    for (const [label, route] of navChecks) {
      const ok = await evalJs(`(() => {
        const group = [...document.querySelectorAll('.sb-group')].find((g) =>
          (g.textContent || '').includes('Sales Execution'));
        const item = [...group.querySelectorAll('.sb-subitem')].find((s) =>
          (s.textContent || '').trim().startsWith(${JSON.stringify(label)}));
        if (!item) return false;
        item.click();
        return true;
      })()`);
      await sleep(900);
      const url = await evalJs(`location.pathname`);
      results.push({ label, expected: route, actual: url, ok: url === route, clicked: ok });
      await navigate('http://localhost:5173/quotations');
      await sleep(700);
    }
    log('NAV_CHECKS', results);

    // 3. Expand/collapse still works
    const collapse = await evalJs(`(() => {
      const group = [...document.querySelectorAll('.sb-group')].find((g) =>
        (g.textContent || '').includes('Sales Execution'));
      if (!group) return 'NO_GROUP';
      const before = group.getAttribute('data-open');
      const header = group.querySelector('button');
      header.click();
      return { before, after: group.getAttribute('data-open') };
    })()`);
    log('EXPAND_COLLAPSE', collapse);

    // 4. Sidebar static while page scrolls (sidebar fixed, main scrolls)
    const scrollCheck = await evalJs(`(() => {
      const aside = document.getElementById('app-sidebar');
      const main = document.querySelector('main');
      const asidePos = aside ? getComputedStyle(aside).position : 'no-aside';
      const mainOverflow = main ? getComputedStyle(main).overflowY : 'no-main';
      const asideRect0 = aside ? aside.getBoundingClientRect().top : null;
      window.scrollTo(0, 400);
      return new Promise((resolve) => setTimeout(() => {
        const asideRect1 = aside ? aside.getBoundingClientRect().top : null;
        resolve({ asidePos, mainOverflow, asideRect0, asideRect1, stable: asideRect0 === asideRect1 });
      }, 300));
    })()`);
    log('SCROLL_STATIC', scrollCheck);

    log('CONSOLE_ERRORS', errors);
    console.log('CDP_SCRIPT_DONE');
  }
};
