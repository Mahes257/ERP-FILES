/* Verify the Payment Receipt edit page: loads saved values, status normalized. */
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
      const proto = HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };`;

    await navigate('http://localhost:5173/payment-receipts/3/edit');
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
      await navigate('http://localhost:5173/payment-receipts/3/edit');
      await sleep(2500);
    }
    await waitFor(`(() => {
      const lb = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.includes('Receipt Number'));
      const ctl = lb && lb.parentElement ? lb.parentElement.querySelector('input') : null;
      return ctl && ctl.value.includes('PR-');
    })()`, 15000);
    await sleep(2500);

    const result = await evalJs(`(() => {
      const ctl = (labelText, tag) => {
        const lb = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === labelText || l.textContent.includes(labelText));
        return lb && lb.parentElement ? lb.parentElement.querySelector(tag || 'select,input,textarea') : null;
      };
      const statusSel = ctl('Status');
      return {
        heading: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : null,
        receiptNo: ctl('Receipt Number') ? ctl('Receipt Number').value : null,
        date: ctl('Payment Date') ? ctl('Payment Date').value : null,
        mode: ctl('Payment Mode') ? ctl('Payment Mode').value : null,
        status: statusSel ? statusSel.value : null,
        statusSelected: statusSel && statusSel.options[statusSel.selectedIndex] ? statusSel.options[statusSel.selectedIndex].textContent.trim() : null,
        bankName: ctl('Bank Name') ? ctl('Bank Name').value : null,
        amount: ctl('Amount Received') ? ctl('Amount Received').value : null,
        remarks: ctl('Remarks / Notes', 'textarea') ? ctl('Remarks / Notes', 'textarea').value : null,
        customer: (document.querySelector('input[aria-label="Select Customer"], input[placeholder^="Search customer"]') || {}).value || null,
        footerBtns: Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => ['Back', 'Update', 'Save Changes'].includes(t))
      };
    })()`);

    console.log(JSON.stringify({ result, errors }, null, 2));
  }
};
