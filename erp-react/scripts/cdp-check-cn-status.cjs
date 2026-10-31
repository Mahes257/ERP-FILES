/* Verify the Status select on the CN edit page shows the saved value. */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs } = helpers;
    const consoleLogs = [];
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'log') consoleLogs.push(p.args.map((a) => a.value ?? a.description ?? '').join(' '));
    });
    await cdp.send('Runtime.enable');
    const setVal = `(el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };`;

    await navigate('http://localhost:5173/credit-notes/6/edit');
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
      await navigate('http://localhost:5173/credit-notes/6/edit');
      await sleep(2500);
    }
    // Wait until the CN number is populated (load completed), then extra time
    await waitFor(`(() => {
      const lb = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.includes('Credit Note Number'));
      const ctl = lb && lb.parentElement ? lb.parentElement.querySelector('input') : null;
      return ctl && ctl.value.includes('CN-');
    })()`, 15000);
    await sleep(3000);

    const result = await evalJs(`(() => {
      const lb = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.includes('Status'));
      const sel = lb && lb.parentElement ? lb.parentElement.querySelector('select') : null;
      return {
        status: sel ? sel.value : null,
        statusOptions: sel ? Array.from(sel.options).map((o) => o.textContent.trim()) : [],
        selectedText: sel && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent.trim() : null
      };
    })()`);

    console.log(JSON.stringify({ result, consoleLogs }, null, 2));
  }
};
