/* Verify CN edit page: loads saved values; Source=From Invoice populates the
 * Source Document dropdown with real invoices. */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs } = helpers;
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry && p.entry.level === 'error') errors.push('LOG: ' + p.entry.text);
    });

    const setVal = `(el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };`;

    // ---- Edit page (CN-2026-000006) ----
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
    await waitFor(`document.querySelectorAll('label').length > 5`, 25000);
    await sleep(1500);

    const edit = await evalJs(`(() => {
      const ctl = (labelText, tag) => {
        const lb = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === labelText || l.textContent.includes(labelText));
        return lb && lb.parentElement ? lb.parentElement.querySelector(tag || 'select,input,textarea') : null;
      };
      return {
        heading: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : null,
        cnNo: ctl('Credit Note Number') ? ctl('Credit Note Number').value : null,
        date: ctl('Date') ? ctl('Date').value : null,
        status: ctl('Status') ? ctl('Status').value : null,
        reason: ctl('Reason for Credit Note') ? ctl('Reason for Credit Note').value : null,
        refund: ctl('Refund Amount') ? ctl('Refund Amount').value : null,
        customerInput: (document.querySelector('input[aria-label="Select Customer"], input[placeholder^="Search customer"]') || {}).value || null,
        itemCount: document.querySelectorAll('tbody tr').length,
        footerBtns: Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => ['Back', 'Update', 'Save Changes'].includes(t))
      };
    })()`);

    // ---- Source Document population (From Invoice) ----
    const sourceTest = await evalJs(`(async () => {
      const ctl = (labelText, tag) => {
        const lb = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.includes(labelText));
        return lb && lb.parentElement ? lb.parentElement.querySelector(tag || 'select,input,textarea') : null;
      };
      const src = ctl('Source');
      if (!src) return { error: 'source select not found' };
      src.value = 'From Invoice';
      src.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 1500));
      const srcDoc = ctl('Source Document');
      const opts = srcDoc && srcDoc.options ? Array.from(srcDoc.options).map((o) => o.textContent.trim()).filter(Boolean) : [];
      return { optionCount: opts.length, first: opts.slice(0, 3), srcDocFound: !!srcDoc };
    })()`);

    console.log(JSON.stringify({ edit, sourceTest, errors }, null, 2));
  }
};
