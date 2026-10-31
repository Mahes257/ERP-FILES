module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const errors = [];
    const toasts = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push((p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 200)));
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') errors.push('CONSOLE: ' + (p.args || []).map((a) => a.value ?? '').join(' ').slice(0, 200));
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'log' || p.type === 'info') {
        const t = (p.args || []).map((a) => a.value ?? '').join(' ');
        if (/toast|updated|success|error|failed|draft|received/i.test(t)) toasts.push(t.slice(0, 160));
      }
    });
    await cdp.send('Runtime.enable');

    await navigate('http://localhost:5173/payment-receipts/7/edit');
    await sleep(3000);

    const btns = await evalJs(`[...document.querySelectorAll('button')].map((b, i) => ({ i, t: (b.textContent || '').trim().slice(0, 30), disabled: b.disabled }))`);
    console.log('BUTTONS: ' + JSON.stringify(btns));

    // Use React-compatible change: dispatch input via native setter + change + input
    await evalJs(`(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'Received'));
      if (!sel) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, 'Received');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(1500);
    const valueAfter = await evalJs(`(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'Received'));
      return sel ? sel.value : null;
    })()`);
    console.log('VALUE_AFTER_1500MS: ' + JSON.stringify(valueAfter));

    // Click the footer primary save button (has a Save icon, sticky footer, text 'Update')
    const clicked = await evalJs(`(() => {
      const footers = [...document.querySelectorAll('.sticky button')];
      const btn = footers.find((b) => /Update/i.test(b.textContent || '')) || footers[footers.length - 1];
      if (btn) { btn.click(); return (btn.textContent || '').trim(); }
      return null;
    })()`);
    console.log('CLICKED_FOOTER: ' + JSON.stringify(clicked));
    await sleep(3500);
    console.log('PATH_AFTER: ' + (await evalJs(`location.pathname`)));
    console.log('TOASTS: ' + JSON.stringify(toasts.slice(-4)));
    console.log('ERRORS: ' + JSON.stringify(errors.slice(0, 4)));

    await navigate('http://localhost:5173/payment-receipts/7/edit');
    await sleep(3000);
    const reopened = await evalJs(`(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'Received'));
      return sel ? sel.value : null;
    })()`);
    console.log('REOPENED: ' + JSON.stringify(reopened));
    console.log('DEBUG_DONE');
  }
};
