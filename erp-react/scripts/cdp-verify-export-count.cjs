/* Verify exactly one visible Export button both before and after selecting a row */
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
    await waitFor(`document.querySelector('.qpo-table tbody') !== null`);
    await sleep(1200);

    const countExports = () => evalJs(`(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const btns = [...document.querySelectorAll('button')].filter((b) =>
        (b.textContent || '').trim() === 'Export');
      const all = [...document.querySelectorAll('button, [role="menuitem"], a')]
        .filter((b) => (b.textContent || '').trim().startsWith('Export'))
        .map((b) => ({ text: (b.textContent || '').trim().slice(0, 20), visible: visible(b) }));
      return { exportButtons: btns.filter(visible).length, all };
    })()`);

    log('BEFORE_SELECT', await countExports());

    await evalJs(`(() => {
      const box = document.querySelector('.qpo-table tbody input[type="checkbox"]');
      if (box) box.click();
      return !!box;
    })()`);
    await sleep(800);

    log('AFTER_SELECT', await countExports());

    log('CONSOLE_ERRORS', errors);
    console.log('CDP_SCRIPT_DONE');
  }
};
