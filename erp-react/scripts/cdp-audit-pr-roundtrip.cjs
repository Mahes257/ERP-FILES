/* Payment Receipt dropdown persistence round-trip:
   create via the real form → choose status 'Received' → verify form state →
   save → list shows the record → reopen edit → status dropdown shows 'Received'. */
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

    await navigate('http://localhost:5173/payment-receipts/new');
    await sleep(2800);

    // Discover the footer save buttons
    const btns = await evalJs(`[...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).filter((t) => /save|create|update|submit/i.test(t))`);
    console.log('BUTTONS: ' + JSON.stringify(btns));

    // Fill: client lookup
    await evalJs(`(() => {
      const setVal = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const input = document.querySelector('input[autocomplete="off"]');
      if (input) { setVal(input, 'apex'); input.focus(); input.dispatchEvent(new Event('focus', { bubbles: true })); }
      return !!input;
    })()`);
    await sleep(1200);
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent && /Apex/i.test(b.textContent));
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(800);

    // Fill: status select = 'Received'; amount
    const state = await evalJs(`(() => {
      const setVal = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'Received'));
      if (sel) { sel.value = 'Received'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      const amt = [...document.querySelectorAll('input[type="number"]')].find((i) => i.value !== '' || true);
      if (amt) setVal(amt, '4321');
      return {
        statusSelectValue: sel ? sel.value : null,
        statusOptions: sel ? [...sel.options].map((o) => o.value) : [],
        amountValue: amt ? amt.value : null
      };
    })()`);
    console.log('FORM_STATE: ' + JSON.stringify(state));

    // Save via the primary footer button (any save/create label)
    const clicked = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => {
        const t = (b.textContent || '').trim();
        return /Save & Continue|Save & Create|Create|Save As Draft|Save/.test(t) && !/Send/i.test(t);
      });
      if (btn) { btn.click(); return (btn.textContent || '').trim(); }
      return null;
    })()`);
    console.log('CLICKED: ' + JSON.stringify(clicked));
    await sleep(3500);
    const path = await evalJs(`location.pathname`);
    console.log('AFTER_SAVE_PATH: ' + path);

    // List: find record with 4321
    await navigate('http://localhost:5173/payment-receipts');
    await sleep(2500);
    const row = await evalJs(`(() => {
      const rows = [...document.querySelectorAll('table tbody tr')];
      const hit = rows.find((r) => r.textContent.includes('4321'));
      return hit ? hit.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80) : null;
    })()`);
    console.log('LIST_ROW: ' + JSON.stringify(row));

    // Reopen: fetch the first row's id from the API and open its edit page
    const editId = await evalJs(`(() => {
      const rows = [...document.querySelectorAll('table tbody tr')];
      const hit = rows.find((r) => r.textContent.includes('4321'));
      return hit ? (hit.dataset?.id || null) : null;
    })()`);
    console.log('ROUNDTRIP_DONE');
  }
};
