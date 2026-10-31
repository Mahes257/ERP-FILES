module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

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

    const firstRowId = async (route) => {
      await navigate('http://localhost:5173' + route);
      await sleep(2500);
      return evalJs(`(() => {
        const row = document.querySelector('table tbody tr');
        if (!row) return null;
        const m = (row.textContent || '').match(/(\\d{1,4})/);
        return m ? m[1] : null;
      })()`);
    };

    const checks = [
      ['Sales Orders', '/sales-orders', '/edit'],
      ['Delivery Challans', '/delivery-challans', '/edit'],
      ['Proforma Invoices', '/proforma-invoices', '/edit'],
      ['Invoices', '/invoices', '/edit']
    ];

    for (const [name, listRoute] of checks) {
      const id = await firstRowId(listRoute);
      if (!id) { console.log('SKIP | ' + name + ' no records'); continue; }
      await navigate('http://localhost:5173' + listRoute + '/' + id + '/edit');
      await sleep(3500);
      const st = await evalJs(`(() => {
        const selects = Array.from(document.querySelectorAll('select'))
          .filter((s) => s.options.length > 1)
          .map((s) => ({ v: s.value, opts: s.options.length }));
        const combos = Array.from(document.querySelectorAll('input[autocomplete="off"]'))
          .filter((i) => i.value)
          .map((i) => ({ ph: i.placeholder || '', v: i.value.slice(0, 25) }));
        return { selects, combos: combos.slice(0, 5), disabled: Array.from(document.querySelectorAll('select, input')).filter((e) => e.disabled).length };
      })()`);
      const hasPrefill = st.selects.some((s) => s.v) || st.combos.length > 0;
      console.log((hasPrefill ? 'PASS | ' : 'FAIL | ') + name + ' edit id=' + id + ' selects=' + JSON.stringify(st.selects.slice(0, 3)) + ' combos=' + JSON.stringify(st.combos) + ' disabled=' + st.disabled);
    }
    console.log('PRESELECT_DONE');
  }
};
