/* End-to-end Invoice create test:
 * 1. Open /invoices/new, select a customer, add an item row (qty 2, rate 1000)
 * 2. Click "Save & Finish"
 * 3. Verify we land on /invoices and the new invoice row appears (client + amount)
 * 4. Open the new invoice's view and confirm the item + totals persisted
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

    await navigate(base + '/invoices/new');
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
      await navigate(base + '/invoices/new');
      await sleep(2500);
    }

    await waitFor(`document.querySelectorAll('label').length > 5`, 25000);
    await sleep(1500);

    // ---- Select customer ----
    const customer = await evalJs(`(async () => {
      const input = document.querySelector('input[placeholder^="Search customer"]');
      if (!input) return { error: 'customer input not found' };
      const setVal = ${setVal};
      input.focus();
      setVal(input, 'a');
      await new Promise((r) => setTimeout(r, 900));
      const sug = Array.from(document.querySelectorAll('button'))
        .find((b) => b.className.includes('w-full text-left px-3 py-2') && b.textContent.trim().length > 0);
      if (!sug) return { error: 'no suggestion' };
      const name = sug.textContent.trim().split(String.fromCharCode(10))[0];
      sug.click();
      await new Promise((r) => setTimeout(r, 900));
      return { name };
    })()`);
    if (customer.error) { console.log(JSON.stringify({ customer, errors }, null, 2)); return; }

    // ---- Add item + fill qty/rate ----
    const item = await evalJs(`(async () => {
      const setVal = ${setVal};
      const addBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Add Item'));
      if (!addBtn) return { error: 'add item button not found' };
      addBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      const grid = addBtn.closest('[class*="rounded-xl"]');
      const product = grid ? grid.querySelector('input[placeholder="Product name"]') : null;
      if (!product) return { error: 'product input not found' };
      setVal(product, 'E2E Test Product');
      const row = product.closest('tr');
      const inputs = Array.from(row.querySelectorAll('input'));
      const qty = inputs.find((i) => i.type === 'number' && i.min === '0.01');
      const rate = inputs.filter((i) => i.type === 'number').find((i) => i.step === '0.01');
      if (qty) setVal(qty, '2');
      if (rate) setVal(rate, '1000');
      await new Promise((r) => setTimeout(r, 500));
      const amountCell = row.querySelector('td span, td');
      return { ok: true, rowCount: grid.querySelectorAll('tbody tr').length };
    })()`);
    if (item.error) { console.log(JSON.stringify({ item, errors }, null, 2)); return; }
    await shot('invoice-create-filled');

    // ---- Save & Finish ----
    const save = await evalJs(`(async () => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Save & Finish');
      if (!btn) return { error: 'save button not found' };
      btn.click();
      await new Promise((r) => setTimeout(r, 4000));
      return { url: location.href };
    })()`);
    await shot('invoice-create-saved');

    // ---- Verify in the list ----
    let list = null;
    if (save.url && save.url.includes('/invoices')) {
      await sleep(1500);
      list = await evalJs(`(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr')).slice(0, 6);
        return rows.map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 90));
      })()`);
    }

    // ---- Open the new invoice view (first row matching the customer) ----
    let view = null;
    if (list && list.length) {
      const clicked = await evalJs(`(async () => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const target = rows.find((r) => r.textContent.includes(${JSON.stringify(customer.name.split(' ')[0])}));
        if (!target) return { error: 'row not found' };
        const cell = target.querySelector('td a') || target.querySelector('td');
        if (cell && cell.querySelector('a')) cell.querySelector('a').click();
        else {
          const act = target.querySelector('button');
          act && act.click();
        }
        await new Promise((r) => setTimeout(r, 2500));
        return { url: location.href };
      })()`);
      view = clicked;
      if (view.url && !view.error) {
        await sleep(1500);
        const pageText = await evalJs(`document.body.innerText.slice(0, 400)`);
        view.pageStart = pageText;
        view.hasItem = (await evalJs(`document.body.innerText.includes('E2E Test Product')`));
      }
    }

    console.log(JSON.stringify({ customer, item, save, list, view, errors }, null, 2));
  }
};
