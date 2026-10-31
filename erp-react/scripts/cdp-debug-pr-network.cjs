module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const requests = [];
    cdp.on('Network.requestWillBeSent', (p) => {
      const req = p.request || {};
      if (/payment-receipts|v1/.test(req.url || '')) {
        requests.push({ type: 'REQ', method: req.method, url: (req.url || '').slice(0, 90) });
      }
    });
    cdp.on('Network.responseReceived', (p) => {
      const resp = p.response || {};
      if (/payment-receipts/.test(resp.url || '')) {
        requests.push({ type: 'RESP', status: resp.status, url: (resp.url || '').slice(0, 90) });
      }
    });
    await cdp.send('Network.enable');

    await navigate('http://localhost:5173/payment-receipts/7/edit');
    await sleep(3000);

    // Set status to Received via React-compatible change
    await evalJs(`(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'Received'));
      if (!sel) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, 'Received');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(1000);

    // Also check the amount input value on edit (validate() requires amount > 0)
    const amt = await evalJs(`(() => {
      const inputs = [...document.querySelectorAll('input[type="number"]')].map((i) => i.value);
      return inputs;
    })()`);
    console.log('NUM_INPUTS: ' + JSON.stringify(amt));

    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('.sticky button')].find((b) => /Update/i.test(b.textContent || ''));
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(3500);
    console.log('PATH: ' + (await evalJs(`location.pathname`)));
    console.log('REQUESTS: ' + JSON.stringify(requests));
    console.log('NET_DONE');
  }
};
