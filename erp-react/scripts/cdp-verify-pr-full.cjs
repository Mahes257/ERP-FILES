module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    await navigate('http://localhost:5173/payment-receipts/7/edit');
    await sleep(3000);

    // Set payment mode (Cheque) + status (Received) dropdowns
    await evalJs(`(() => {
      const setSel = (el, v) => {
        if (!el) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      };
      const all = Array.from(document.querySelectorAll('select'));
      const modeSel = all.find((s) => Array.from(s.options).some((o) => o.value === 'Cheque'));
      const statusSel = all.find((s) => Array.from(s.options).some((o) => o.value === 'Received'));
      return { mode: setSel(modeSel, 'Cheque'), status: setSel(statusSel, 'Received') };
    })()`);
    await sleep(1200);

    const after = await evalJs(`(() => {
      const all = Array.from(document.querySelectorAll('select'));
      const modeSel = all.find((s) => Array.from(s.options).some((o) => o.value === 'Cheque'));
      const statusSel = all.find((s) => Array.from(s.options).some((o) => o.value === 'Received'));
      return { mode: modeSel ? modeSel.value : null, status: statusSel ? statusSel.value : null };
    })()`);
    console.log('AFTER_SET: ' + JSON.stringify(after));

    await evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('.sticky button')).find((b) => /Update/i.test(b.textContent || ''));
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(3500);
    console.log('PATH_AFTER: ' + (await evalJs('location.pathname')));

    await navigate('http://localhost:5173/payment-receipts/7/edit');
    await sleep(3000);
    const reopened = await evalJs(`(() => {
      const all = Array.from(document.querySelectorAll('select'));
      const modeSel = all.find((s) => Array.from(s.options).some((o) => o.value === 'Cheque'));
      const statusSel = all.find((s) => Array.from(s.options).some((o) => o.value === 'Received'));
      return { mode: modeSel ? modeSel.value : null, status: statusSel ? statusSel.value : null };
    })()`);
    console.log('REOPENED: ' + JSON.stringify(reopened));
    console.log('FULL_DONE');
  }
};
