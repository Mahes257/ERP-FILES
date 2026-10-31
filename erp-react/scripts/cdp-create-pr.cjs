/* End-to-end Payment Receipt create flow:
 * 1. Open /payment-receipts/new, select customer, set mode Cheque (bank fields),
 *    enter amount + remarks
 * 2. Click "Mark as Received"
 * 3. Verify landing on /payment-receipts and the new row appears
 */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs, shot } = helpers;
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry && p.entry.level === 'error') errors.push('LOG: ' + p.entry.text);
    });

    const base = 'http://localhost:5173';
    const setVal = `(el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };`;

    await navigate(base + '/payment-receipts/new');
    await sleep(3000);
    const needsLogin = await evalJs(`!!document.querySelector('input[type=email]')`);
    if (needsLogin) {
      await evalJs(`(() => {
        const setVal = ${setVal};
        setVal(document.querySelector('input[type=email]'), 'admin@vishaktech.com');
        setVal(document.querySelector('input[type=password]'), 'Admin@123');
        document.querySelector('button[type=submit]').click();
      })()`);
      await waitFor(`!location.href.includes('signin')`, 20000);
      await sleep(2500);
      await navigate(base + '/payment-receipts/new');
      await sleep(2500);
    }
    await waitFor(`document.querySelectorAll('label').length > 5`, 25000);
    await sleep(1500);

    // ---- Customer ----
    const customer = await evalJs(`(async () => {
      const input = document.querySelector('input[aria-label="Select Customer"], input[placeholder^="Search customer"]');
      if (!input) return { error: 'customer input not found' };
      const setVal = ${setVal};
      input.focus();
      setVal(input, 'a');
      await new Promise((r) => setTimeout(r, 900));
      const sug = Array.from(document.querySelectorAll('body > div[class*="fixed"] button'))
        .find((b) => b.className.includes('w-full text-left') && b.textContent.trim().length > 0);
      if (!sug) return { error: 'no suggestion' };
      sug.click();
      await new Promise((r) => setTimeout(r, 900));
      return { name: sug.textContent.trim().split(String.fromCharCode(10))[0] };
    })()`);
    if (customer.error) { console.log(JSON.stringify({ customer, errors }, null, 2)); return; }

    // ---- Mode (Cheque -> bank fields), amount, remarks ----
    const details = await evalJs(`(async () => {
      const setVal = ${setVal};
      const ctl = (labelText, tag) => {
        const lb = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === labelText || l.textContent.includes(labelText));
        return lb && lb.parentElement ? lb.parentElement.querySelector(tag || 'select,input,textarea') : null;
      };
      const mode = ctl('Payment Mode');
      if (!mode) return { error: 'mode not found' };
      mode.value = 'Cheque';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      const bank = ctl('Bank Name');
      const bankVisible = bank ? bank.offsetParent !== null : false;
      if (bank && bankVisible) setVal(bank, 'HDFC Bank');
      const branch = ctl('Branch');
      if (branch && branch.offsetParent !== null) setVal(branch, 'Bangalore');
      const cheque = ctl('Cheque No / Transaction ID');
      if (cheque && cheque.offsetParent !== null) setVal(cheque, 'CHQ-778899');
      const amount = ctl('Amount Received');
      if (!amount) return { error: 'amount not found' };
      setVal(amount, '5000');
      const remarks = ctl('Remarks / Notes', 'textarea');
      if (remarks) setVal(remarks, 'Advance payment received');
      await new Promise((r) => setTimeout(r, 400));
      return { ok: true, bankVisible };
    })()`);
    if (details.error) { console.log(JSON.stringify({ details, errors }, null, 2)); return; }
    await shot('pr-create-filled');

    // ---- Save (Mark as Received) ----
    const save = await evalJs(`(async () => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Mark as Received');
      if (!btn) return { error: 'save button not found' };
      btn.click();
      await new Promise((r) => setTimeout(r, 4000));
      return { url: location.href };
    })()`);
    await shot('pr-create-saved');

    // ---- Verify list ----
    let list = null;
    if (save.url && save.url.includes('/payment-receipts')) {
      await sleep(1500);
      list = await evalJs(`(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr')).slice(0, 4);
        return rows.map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80));
      })()`);
    }

    console.log(JSON.stringify({ customer, details, save, list, errors }, null, 2));
  }
};
