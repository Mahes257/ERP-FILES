/* Verify Sales Orders view page opens for a real record (regression check) */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const log = (k, v) => console.log(`${k}: ${JSON.stringify(v)}`);
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 220)));
    await cdp.send('Runtime.enable');

    await navigate('http://localhost:5173/signin');
    await waitFor(`document.querySelector('input[type="email"], input[name="email"]') !== null`, 15000);
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

    // Fetch the first SO id via the API from the page context
    const id = await evalJs(`(async () => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('http://localhost:8080/v1/sales-orders?size=1', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const json = await res.json().catch(() => ({}));
      const list = json?.content || json?.data || [];
      return list[0]?.id || null;
    })()`);
    log('SO_FIRST_ID', id);
    if (id) {
      await navigate('http://localhost:5173/sales-orders/' + id);
      await sleep(2500);
      const state = await evalJs(`(() => ({
        path: location.pathname,
        len: document.body.innerText.length,
        err: /something went wrong|error boundary/i.test(document.body.innerText.slice(0, 300))
      }))()`);
      log('SO_VIEW_STATE', state);
    } else {
      log('SO_VIEW_STATE', { skipped: 'no SO record found' });
    }

    log('CONSOLE_ERRORS', errors);
    console.log('CDP_SCRIPT_DONE');
  }
};
