/* Debug the CN save flow: capture toast messages, final URL, console, and page state. */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs } = helpers;
    const logs = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      logs.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry && p.entry.level === 'error') logs.push('LOG: ' + p.entry.text);
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    const setVal = `(el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
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

    // Select customer
    const customer = await evalJs(`(async () => {
      const input = document.querySelector('input[aria-label="Select Customer"], input[placeholder^="Search customer"]');
      if (!input) return { error: 'no customer input' };
      const setVal = ${setVal};
      input.focus();
      setVal(input, 'a');
      await new Promise((r) => setTimeout(r, 900));
      const sug = Array.from(document.querySelectorAll('body > div[class*="fixed"] button'))
        .find((b) => b.className.includes('w-full text-left') && b.textContent.trim().length > 0);
      if (!sug) return { error: 'no suggestion' };
      sug.click();
      await new Promise((r) => setTimeout(r, 900));
      return { ok: true, name: sug.textContent.trim().split(String.fromCharCode(10))[0] };
    })()`);

    // Add one item
    const item = await evalJs(`(async () => {
      const setVal = ${setVal};
      const addBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Add Item'));
      if (!addBtn) return { error: 'no add item btn' };
      addBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      const product = Array.from(document.querySelectorAll('input')).find((i) => i.placeholder === 'Product name');
      if (!product) return { error: 'no product input' };
      setVal(product, 'CN Debug Item');
      await new Promise((r) => setTimeout(r, 300));
      return { ok: true };
    })()`);

    // Click save
    const saveResult = await evalJs(`(async () => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Submit for Approval');
      if (!btn) return { error: 'no save button' };
      btn.click();
      await new Promise((r) => setTimeout(r, 2500));
      const toasts = Array.from(document.querySelectorAll('[class*="toast"], [role="status"], .toast-container *')).map((t) => t.textContent.trim()).filter(Boolean).slice(0, 5);
      return { url: location.href, toasts };
    })()`);

    const pageText = await evalJs(`document.body.innerText.slice(0, 500)`);

    console.log(JSON.stringify({ customer, item, saveResult, pageText, logs }, null, 2));
  }
};
