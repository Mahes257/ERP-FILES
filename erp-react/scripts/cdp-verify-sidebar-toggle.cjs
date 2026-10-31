/* Verify Sales Execution group expand/collapse toggle with render delays */
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

    const state = await evalJs(`(() => {
      const group = [...document.querySelectorAll('.sb-group')].find((g) =>
        (g.textContent || '').includes('Sales Execution'));
      if (!group) return 'NO_GROUP';
      return { open: group.getAttribute('data-open'), header: (group.querySelector('button')?.textContent || '').trim().slice(0, 20) };
    })()`);
    log('INITIAL', state);

    await evalJs(`(() => {
      const group = [...document.querySelectorAll('.sb-group')].find((g) =>
        (g.textContent || '').includes('Sales Execution'));
      group.querySelector('button').click();
      return true;
    })()`);
    await sleep(500);
    const afterCollapse = await evalJs(`(() => {
      const group = [...document.querySelectorAll('.sb-group')].find((g) =>
        (g.textContent || '').includes('Sales Execution'));
      return group ? group.getAttribute('data-open') : 'NO_GROUP';
    })()`);
    log('AFTER_COLLAPSE_CLICK', { open: afterCollapse });

    await evalJs(`(() => {
      const group = [...document.querySelectorAll('.sb-group')].find((g) =>
        (g.textContent || '').includes('Sales Execution'));
      group.querySelector('button').click();
      return true;
    })()`);
    await sleep(500);
    const afterExpand = await evalJs(`(() => {
      const group = [...document.querySelectorAll('.sb-group')].find((g) =>
        (g.textContent || '').includes('Sales Execution'));
      return group ? group.getAttribute('data-open') : 'NO_GROUP';
    })()`);
    log('AFTER_EXPAND_CLICK', { open: afterExpand });

    // After re-expanding, subitems should be visible again
    const items = await evalJs(`(() => {
      const group = [...document.querySelectorAll('.sb-group')].find((g) =>
        (g.textContent || '').includes('Sales Execution'));
      return [...group.querySelectorAll('.sb-subitem')].map((s) => s.textContent.trim()).slice(0, 9);
    })()`);
    log('SUBITEMS_AFTER_REEXPAND', items);

    log('CONSOLE_ERRORS', errors);
    console.log('CDP_SCRIPT_DONE');
  }
};
