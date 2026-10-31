/* Verify the ERP empty-draft flow: Save Draft with no customer/items must work. */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs } = helpers;
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry && p.entry.level === 'error') errors.push('LOG: ' + p.entry.text);
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    const setVal = `(el, v) => {
      const proto = HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };`;

    await navigate('http://localhost:5173/credit-notes/new');
    await sleep(2500);
    const needsLogin = await evalJs(`!!document.querySelector('input[type=email]')`);
    if (needsLogin) {
      await evalJs(`(() => {
        const setVal = ${setVal};
        setVal(document.querySelector('input[type=email]'), 'admin@vishaktech.com');
        setVal(document.querySelector('input[type=password]'), 'Admin@123');
        document.querySelector('button[type=submit]').click();
      })()`);
      await waitFor(`!location.href.includes('signin')`, 20000);
      await sleep(2000);
      await navigate('http://localhost:5173/credit-notes/new');
      await sleep(2500);
    }
    await waitFor(`document.querySelectorAll('label').length > 5`, 25000);
    await sleep(1200);

    // Click Save Draft with an EMPTY form (no customer, no items)
    const result = await evalJs(`(async () => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Save Draft');
      if (!btn) return { error: 'no save draft button' };
      btn.click();
      await new Promise((r) => setTimeout(r, 3000));
      return { url: location.href };
    })()`);

    let list = null;
    if (result.url && result.url.includes('/credit-notes')) {
      await sleep(1200);
      list = await evalJs(`(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr')).slice(0, 2);
        return rows.map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 70));
      })()`);
    }

    console.log(JSON.stringify({ result, list, errors }, null, 2));
  }
};
