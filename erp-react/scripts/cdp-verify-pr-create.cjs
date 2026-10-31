/* Verify the Payment Receipt create page against ERP payment-receipt-create.html:
 * card order, labels, company defaults, readonly PR number, payment modes,
 * bank-field gating, invoice KPI grid, amount words, footer buttons, zero errors.
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
    await shot('pr-create-page');

    // ---- 1. Section card titles (ERP order) ----
    const cards = await evalJs(`(() => Array.from(document.querySelectorAll('h3')).map((h) => h.textContent.trim()).filter(Boolean))()`);

    // ---- 2. All labels ----
    const labels = await evalJs(`(() => Array.from(document.querySelectorAll('label')).map((l) => l.textContent.trim()))()`);

    // ---- 3. Company defaults + PR number ----
    const defaults = await evalJs(`(() => {
      const ctl = (labelText) => {
        const lb = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === labelText || l.textContent.includes(labelText));
        return lb && lb.parentElement ? lb.parentElement.querySelector('input,select,textarea') : null;
      };
      const pr = ctl('Receipt Number');
      return {
        companyName: ctl('Company Name') ? ctl('Company Name').value : null,
        address: ctl('Address') ? ctl('Address').value : null,
        receiptNo: pr ? pr.value : null,
        receiptNoReadOnly: pr ? pr.readOnly : null,
        receiptNoBold: pr ? pr.className.includes('font-bold') : null,
        date: ctl('Payment Date') ? ctl('Payment Date').value : null,
        statusDefault: (() => { const s = ctl('Status'); return s && s.options ? s.options[s.selectedIndex].textContent.trim() : null; })()
      };
    })()`);

    // ---- 4. Payment mode options ----
    const modes = await evalJs(`(() => {
      const lb = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.includes('Payment Mode'));
      const sel = lb && lb.parentElement ? lb.parentElement.querySelector('select') : null;
      return sel ? Array.from(sel.options).map((o) => o.textContent.trim()) : [];
    })()`);

    // ---- 5. Bank fields hidden by default; shown for Cheque ----
    const bankGating = await evalJs(`(async () => {
      const lb = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.includes('Payment Mode'));
      const sel = lb && lb.parentElement ? lb.parentElement.querySelector('select') : null;
      const bankLabel = (t) => Array.from(document.querySelectorAll('label')).find((l) => l.textContent.includes(t));
      const bankVisible = (t) => { const bl = bankLabel(t); if (!bl || !bl.parentElement) return false; const p = bl.closest('[class*="grid"]'); return p ? p.offsetParent !== null : true; };
      const before = { bank: bankVisible('Bank Name'), branch: bankVisible('Branch'), cheque: bankVisible('Cheque No') };
      sel.value = 'Cheque';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      const after = { bank: bankVisible('Bank Name'), branch: bankVisible('Branch'), cheque: bankVisible('Cheque No') };
      sel.value = '';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      const reset = { bank: bankVisible('Bank Name'), branch: bankVisible('Branch'), cheque: bankVisible('Cheque No') };
      return { before, after, reset };
    })()`);

    // ---- 6. Invoice reference: Source -> From Invoice populates invoices + KPIs ----
    const invoiceTest = await evalJs(`(async () => {
      const ctl = (labelText, tag) => {
        const lb = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === labelText || l.textContent.includes(labelText));
        return lb && lb.parentElement ? lb.parentElement.querySelector(tag || 'select,input,textarea') : null;
      };
      const src = ctl('Source');
      if (!src) return { error: 'source not found' };
      src.value = 'From Invoice';
      src.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 1200));
      const inv = ctl('Invoice');
      const opts = inv && inv.options ? Array.from(inv.options).map((o) => ({ value: o.value, text: o.textContent.trim() })).filter((o) => o.text && o.value) : [];
      if (opts.length > 0) {
        inv.value = opts[0].value;
        inv.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 800));
      }
      const txt = document.body.innerText;
      return {
        invoiceOptions: opts.length,
        first: opts.slice(0, 3).map((o) => o.text),
        hasKpiInvoice: txt.includes('Invoice Amount'),
        hasKpiOutstanding: txt.includes('Outstanding'),
        hasKpiBalance: txt.includes('Balance after Payment'),
        hasAmountWords: txt.includes('Rupees Only'),
        amountValue: ctl('Amount Received') ? ctl('Amount Received').value : null
      };
    })()`);
    await shot('pr-create-invoice');

    // ---- 7. Footer buttons ----
    const footerBtns = await evalJs(`(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => ['Save Draft', 'Save & New', 'Mark as Received', 'Back'].includes(t)))()`);

    // ---- 8. Customer selection chips ----
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
      const chipLabels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent.trim()).filter((t) => ['GSTIN', 'Email', 'Phone'].includes(t));
      return { name: sug.textContent.trim().split(String.fromCharCode(10))[0], chipLabels };
    })()`);

    console.log(JSON.stringify({ cards, labels, defaults, modes, bankGating, invoiceTest, footerBtns, customer, errors }, null, 2));
  }
};
