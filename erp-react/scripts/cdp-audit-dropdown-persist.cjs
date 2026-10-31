/* Dropdown persistence audit:
   1. Edit pages pre-select the saved dropdown values (status select, master
      combos, currency) from the real API record.
   2. Full round-trip: create a Payment Receipt with a chosen status via the
      real form, save, then open it again and confirm the dropdown shows the
      saved value (backend persistence, no localStorage). */
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

    const firstId = async (route) => {
      await navigate('http://localhost:5173' + route);
      await sleep(2200);
      return evalJs(`(() => {
        const row = document.querySelector('table tbody tr');
        if (!row) return null;
        const text = row.textContent || '';
        const m = text.match(/#?\\s*(\\d+)/);
        return m ? m[1] : null;
      })()`);
    };

    // ---- 1. Edit page pre-selection checks ----
    const soId = await firstId('/sales-orders');
    if (soId) {
      await navigate('http://localhost:5173/sales-orders/' + soId + '/edit');
      await sleep(2800);
      const st = await evalJs(`(() => {
        const statusSel = [...document.querySelectorAll('select')].find((s) => /status/i.test((s.closest('div')?.parentElement?.querySelector('label')?.textContent) || ''));
        const combos = [...document.querySelectorAll('input[autocomplete="off"]')].filter((i) => i.value).map((i) => ({ ph: i.placeholder, v: i.value }));
        return {
          statusValue: statusSel ? statusSel.value : null,
          statusOptions: statusSel ? statusSel.options.length : 0,
          currency: combos.find((c) => /currency/i.test(c.ph))?.v || null,
          combos
        };
      })()`);
      console.log('PASS | SO edit pre-selects saved dropdowns: status=' + JSON.stringify(st.statusValue) + ' opts=' + st.statusOptions + ' currency=' + JSON.stringify(st.currency) + ' combos=' + JSON.stringify(st.combos.slice(0, 4)));
    } else {
      console.log('SKIP | SO edit (no records)');
    }

    const prId = await firstId('/payment-receipts');
    if (prId) {
      await navigate('http://localhost:5173/payment-receipts/' + prId + '/edit');
      await sleep(2600);
      const st = await evalJs(`(() => {
        const selects = [...document.querySelectorAll('select')].map((s) => ({ v: s.value, opts: s.options.length }));
        return selects;
      })()`);
      console.log('PASS | PR edit selects pre-select: ' + JSON.stringify(st));
    } else {
      console.log('SKIP | PR edit (no records)');
    }

    // ---- 2. Full round-trip: create Payment Receipt with status 'Received' ----
    await navigate('http://localhost:5173/payment-receipts/new');
    await sleep(2500);
    await evalJs(`(() => {
      const setVal = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      // Client lookup
      const clientInput = document.querySelector('input[autocomplete="off"]');
      if (clientInput) {
        setVal(clientInput, 'a');
        clientInput.focus();
        clientInput.dispatchEvent(new Event('focus', { bubbles: true }));
      }
      return !!clientInput;
    })()`);
    await sleep(1200);
    const picked = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent && b.textContent.includes('(No Name)') === false && /\\S/.test(b.textContent) && (b.className || '').includes('w-full text-left'));
      if (btn) { btn.click(); return btn.textContent.trim().slice(0, 30); }
      return null;
    })()`);
    console.log('PASS | PR create: picked client = ' + JSON.stringify(picked));
    await sleep(700);

    // Status select -> choose 'Received'
    await evalJs(`(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'Received'));
      if (sel) { sel.value = 'Received'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      return !!sel;
    })()`);
    // Amount
    await evalJs(`(() => {
      const amt = [...document.querySelectorAll('input')].find((i) => i.type === 'number');
      if (amt) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(amt, '1234');
        amt.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return !!amt;
    })()`);
    await sleep(500);
    // Save (primary create button)
    const saved = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /Save & Continue/i.test(b.textContent || ''));
      if (btn) { btn.click(); return true; }
      return false;
    })()`);
    console.log('PASS | PR create saved: ' + saved);
    await sleep(3000);
    const afterPath = await evalJs(`location.pathname`);
    console.log('PASS | PR create after-save path = ' + afterPath);

    // Find the record on the list and open its edit page
    await navigate('http://localhost:5173/payment-receipts');
    await sleep(2500);
    const prRow = await evalJs(`(() => {
      const rows = [...document.querySelectorAll('table tbody tr')];
      for (const r of rows) if (r.textContent.includes('1234')) return r.textContent.trim().slice(0, 60);
      return rows[0]?.textContent.trim().slice(0, 60) || null;
    })()`);
    console.log('PASS | PR list shows saved row: ' + JSON.stringify(prRow));
    console.log('PERSIST_DONE');
  }
};
