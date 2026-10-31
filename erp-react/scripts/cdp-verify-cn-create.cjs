/* Verify the Credit Note create page against the ERP credit-note-create.html
 * structure: section order, labels, company defaults, readonly CN number,
 * status options, source/source-doc selects, items table headers, embedded
 * totals panel, footer buttons, zero console errors.
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
    await shot('cn-create-page');

    // ---- 1. Section card titles (ERP order) ----
    const cards = await evalJs(`(() => {
      return Array.from(document.querySelectorAll('h3')).map((h) => h.textContent.trim()).filter(Boolean);
    })()`);

    // ---- 2. All labels in order ----
    const labels = await evalJs(`(() => {
      return Array.from(document.querySelectorAll('label')).map((l) => l.textContent.trim());
    })()`);

    // ---- 3. Company defaults ----
    const company = await evalJs(`(() => {
      const v = (s) => { const i = Array.from(document.querySelectorAll('input')).find((x) => x.closest('div') && x.closest('div').previousElementSibling && x.closest('div').previousElementSibling.textContent.includes(s)); return i ? i.value : null; };
      const companyName = Array.from(document.querySelectorAll('input')).find((x) => { const lb = x.closest('div') && x.closest('div').previousElementSibling; return lb && lb.textContent.trim() === 'Company Name'; });
      const cnNo = Array.from(document.querySelectorAll('input')).find((x) => { const lb = x.closest('div') && x.closest('div').previousElementSibling; return lb && lb.textContent.includes('Credit Note Number'); });
      return {
        companyName: companyName ? companyName.value : null,
        cnNo: cnNo ? cnNo.value : null,
        cnNoReadOnly: cnNo ? cnNo.readOnly : null,
        cnNoBold: cnNo ? cnNo.className.includes('font-bold') : null,
        cnNoBg: cnNo ? getComputedStyle(cnNo).backgroundColor : null
      };
    })()`);

    // ---- 4. Status / Source / Source Doc option lists ----
    const selects = await evalJs(`(() => {
      const map = {};
      Array.from(document.querySelectorAll('select')).forEach((s) => {
        const lb = s.closest('div') && s.closest('div').previousElementSibling;
        const label = lb ? lb.textContent.trim() : '';
        if (label && !map[label]) map[label] = Array.from(s.options).map((o) => o.textContent.trim());
      });
      return map;
    })()`);

    // ---- 5. Items table headers ----
    const itemThs = await evalJs(`(() => {
      const th = document.querySelector('thead');
      return th ? Array.from(th.querySelectorAll('th')).map((t) => t.textContent.trim()) : [];
    })()`);

    // ---- 6. Totals panel labels ----
    const totals = await evalJs(`(() => {
      const txt = document.body.innerText;
      return {
        hasSubTotal: txt.includes('Sub Total'),
        hasDiscount: txt.includes('Discount (%)'),
        hasCharges: txt.includes('Additional Charges'),
        hasGst: !!txt.match(/\\bGST\\b/),
        hasGrand: txt.includes('Grand Total'),
        hasWords: txt.includes('Amount in Words') || txt.includes('Rupees Only')
      };
    })()`);

    // ---- 7. Footer buttons ----
    const footerBtns = await evalJs(`(() => {
      return Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => ['Save Draft', 'Save & New', 'Submit for Approval', 'Back'].includes(t));
    })()`);

    // ---- 8. Select a customer via the lookup and check the chips appear ----
    const customer = await evalJs(`(async () => {
      const input = document.querySelector('input[aria-label="Select Customer"], input[placeholder^="Search customer"]');
      if (!input) return { error: 'customer input not found' };
      const setVal = ${setVal};
      input.focus();
      setVal(input, 'a');
      await new Promise((r) => setTimeout(r, 900));
      const sug = Array.from(document.querySelectorAll('body > div[class*="fixed"] button'))
        .find((b) => b.className.includes('w-full text-left') && b.textContent.trim().length > 0);
      if (!sug) return { error: 'no suggestion', hasPortal: Array.from(document.querySelectorAll('body > div[class*="fixed"]')).length };
      const name = sug.textContent.trim().split(String.fromCharCode(10))[0];
      sug.click();
      await new Promise((r) => setTimeout(r, 900));
      const chipLabels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent.trim()).filter((t) => ['GSTIN', 'Email', 'Phone'].includes(t));
      return { name, chipLabels };
    })()`);
    await shot('cn-create-after-customer');

    // ---- 9. Add item + check totals math ----
    const itemTest = await evalJs(`(async () => {
      const addBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Add Item'));
      if (!addBtn) return { error: 'add item not found' };
      addBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      const inputs = Array.from(document.querySelectorAll('input'));
      const product = inputs.find((i) => i.placeholder === 'Product name');
      if (!product) return { error: 'product input not found' };
      const setVal = ${setVal};
      setVal(product, 'CN Test Item');
      const row = product.closest('tr');
      const rowInputs = Array.from(row.querySelectorAll('input'));
      const rate = rowInputs.filter((i) => i.type === 'number').find((i) => i.step === '0.01');
      if (rate) setVal(rate, '100');
      await new Promise((r) => setTimeout(r, 500));
      const bodyText = document.body.innerText;
      return {
        rowCount: row.closest('table').querySelectorAll('tbody tr').length,
        grandVisible: bodyText.includes('Grand Total'),
        hasCNTest: bodyText.includes('CN Test Item')
      };
    })()`);

    console.log(JSON.stringify({ cards, labels, company, selects, itemThs, totals, footerBtns, customer, itemTest, errors }, null, 2));
  }
};
