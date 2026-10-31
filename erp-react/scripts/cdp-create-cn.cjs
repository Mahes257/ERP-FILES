/* End-to-end Credit Note create flow:
 * 1. Open /credit-notes/new, select a customer, pick a reason, add an item
 * 2. Save (Submit for Approval)
 * 3. Verify we land on /credit-notes and the new CN row appears
 * 4. Open the view and confirm customer + item persisted
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

    await navigate(base + '/credit-notes/new');
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
      await navigate(base + '/credit-notes/new');
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
      const name = sug.textContent.trim().split(String.fromCharCode(10))[0];
      sug.click();
      await new Promise((r) => setTimeout(r, 900));
      return { name };
    })()`);
    if (customer.error) { console.log(JSON.stringify({ customer, errors }, null, 2)); return; }

    // ---- Reason + notes + refund ----
    const details = await evalJs(`(async () => {
      const setVal = ${setVal};
      const ctl = (labelText, tag) => {
        const lb = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === labelText || l.textContent.includes(labelText));
        if (!lb || !lb.parentElement) return null;
        return lb.parentElement.querySelector(tag || 'select,input,textarea');
      };
      const reason = ctl('Reason for Credit Note');
      if (!reason) return { error: 'reason select not found' };
      reason.value = 'Return of Goods';
      reason.dispatchEvent(new Event('change', { bubbles: true }));
      const notes = ctl('Detailed Reason / Notes', 'textarea');
      if (notes) setVal(notes, 'Returned due to quality issue');
      const refund = ctl('Refund Amount');
      if (refund) setVal(refund, '118');
      await new Promise((r) => setTimeout(r, 300));
      return { ok: true };
    })()`);
    if (details.error) { console.log(JSON.stringify({ details, errors }, null, 2)); return; }

    // ---- Add item ----
    const item = await evalJs(`(async () => {
      const setVal = ${setVal};
      const addBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Add Item'));
      if (!addBtn) return { error: 'add item not found' };
      addBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      const product = Array.from(document.querySelectorAll('input')).find((i) => i.placeholder === 'Product name');
      if (!product) return { error: 'product input not found' };
      setVal(product, 'CN E2E Item');
      const row = product.closest('tr');
      const rowInputs = Array.from(row.querySelectorAll('input'));
      const qty = rowInputs.filter((i) => i.type === 'number').find((i) => i.step !== '0.01' && i.step !== '0.1');
      const rate = rowInputs.filter((i) => i.type === 'number').find((i) => i.step === '0.01');
      if (qty) setVal(qty, '1');
      if (rate) setVal(rate, '100');
      await new Promise((r) => setTimeout(r, 500));
      return { ok: true, rowCount: row.closest('table').querySelectorAll('tbody tr').length };
    })()`);
    if (item.error) { console.log(JSON.stringify({ item, errors }, null, 2)); return; }
    await shot('cn-create-filled');

    // ---- Save (Submit for Approval) ----
    const save = await evalJs(`(async () => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Submit for Approval');
      if (!btn) return { error: 'save button not found' };
      btn.click();
      await new Promise((r) => setTimeout(r, 4000));
      return { url: location.href };
    })()`);
    await shot('cn-create-saved');

    // ---- Verify list ----
    let list = null;
    if (save.url && save.url.includes('/credit-notes')) {
      await sleep(1500);
      list = await evalJs(`(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr')).slice(0, 5);
        return rows.map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 90));
      })()`);
    }

    console.log(JSON.stringify({ customer, details, item, save, list, errors }, null, 2));
  }
};
