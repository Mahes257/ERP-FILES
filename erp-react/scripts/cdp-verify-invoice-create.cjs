/* Verify the Invoice Create page against the ERP invoice-create.html:
 *  - Section order in the main column (General Information, Customer Details,
 *    Reference Details, Bank Details, Item Details, Terms & Conditions,
 *    Remarks, Attachments) and right sidebar (Totals, Status)
 *  - General Information fields (Company Name, readonly Invoice Number, GSTIN,
 *    PAN, State, Invoice Date, Company Address)
 *  - Customer Details: Select Customer + Due Date in one row; chips appear
 *    after selection
 *  - Reference Details: Source (default Direct) + Source Document dropdown
 *  - Bank Details: Account Type text default Current
 *  - Item Details table columns
 *  - Footer buttons (Save Draft / Save & New / Save & Finish)
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
    await navigate(base + '/invoices/new');
    await sleep(3000);
    const needsLogin = await evalJs(`!!document.querySelector('input[type=email]')`);
    if (needsLogin) {
      await evalJs(`(() => {
        const setVal = (el, v) => {
          const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
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
    await sleep(1800);

    const structure = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent.trim());
      const accordionTitles = Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => t && t.length < 45);
      const h3s = Array.from(document.querySelectorAll('h3')).map((h) => h.textContent.trim());
      const sectionTitles = [...new Set([...accordionTitles, ...h3s])].filter((t) => ['General Information','Customer Details','Reference Details','Bank Details','Item Details','Terms & Conditions','Remarks','Attachments','Totals','Status'].includes(t) || t.includes('Terms'));
      const custInput = document.querySelector('input[placeholder^="Search customer"]');
      const invNo = (() => {
        const lab = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Invoice Number');
        return lab && lab.parentElement ? lab.parentElement.querySelector('input') : null;
      })();
      const companyName = (() => {
        const lab = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Company Name');
        return lab && lab.parentElement ? lab.parentElement.querySelector('input') : null;
      })();
      const bankType = (() => {
        const lab = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Account Type');
        return lab && lab.parentElement ? lab.parentElement.querySelector('input,select') : null;
      })();
      const sourceSel = (() => {
        const lab = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Source');
        return lab && lab.parentElement ? lab.parentElement.querySelector('select') : null;
      })();
      const sourceDocSel = (() => {
        const lab = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Source Document');
        return lab && lab.parentElement ? lab.parentElement.querySelector('select') : null;
      })();
      const itemThs = Array.from(document.querySelectorAll('table thead th')).map((th) => th.textContent.trim());
      const footerBtns = Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => ['Save Draft','Save & New','Save & Finish','Save & Send','Back'].includes(t));
      const sidebarCards = Array.from(document.querySelectorAll('h3')).map((h) => h.textContent.trim()).filter((t) => t === 'Totals' || t === 'Status');
      const dueDateInRow = (() => {
        const dd = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Due Date');
        const custLabel = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Select Customer');
        if (!dd || !custLabel) return null;
        const ddTop = Math.round(dd.getBoundingClientRect().top);
        const custTop = Math.round(custLabel.getBoundingClientRect().top);
        return { sameRow: Math.abs(ddTop - custTop) < 8, dueDateLabelTop: ddTop, custLabelTop: custTop };
      })();
      return {
        labels: labels.slice(0, 28),
        sectionTitles,
        footerBtns,
        sidebarCards,
        customerPlaceholder: custInput ? custInput.placeholder : null,
        invoiceNo: invNo ? { value: invNo.value, readOnly: invNo.readOnly, bg: getComputedStyle(invNo).backgroundColor } : null,
        companyName: companyName ? { value: companyName.value } : null,
        bankType: bankType ? { tag: bankType.tagName, value: bankType.value } : null,
        sourceDefault: sourceSel ? sourceSel.value : null,
        sourceDocOptions: sourceDocSel ? sourceDocSel.querySelectorAll('option').length : null,
        itemThs,
        dueDateInRow
      };
    })()`);
    await shot('invoice-form-structure');

    // ---- Select a customer and verify chips appear ----
    const selected = await evalJs(`(async () => {
      const input = document.querySelector('input[placeholder^="Search customer"]');
      if (!input) return { error: 'customer input not found' };
      const setVal = (el, v) => {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      input.focus();
      setVal(input, 'a');
      await new Promise((r) => setTimeout(r, 900));
      const sug = Array.from(document.querySelectorAll('button'))
        .find((b) => b.className.includes('w-full text-left px-3 py-2') && b.textContent.trim().length > 0);
      if (!sug) return { error: 'no suggestion found' };
      const name = sug.textContent.trim().split(String.fromCharCode(10))[0];
      sug.click();
      await new Promise((r) => setTimeout(r, 1000));
      const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent.trim());
      const chips = Array.from(document.querySelectorAll('div.rounded-lg.bg-slate-50')).map((c) => c.textContent.trim()).filter((c) => c !== '');
      const refInput = (() => {
        const lab = labels.find((l) => l === 'Reference');
        return lab ? document.querySelector('input[placeholder="PO / Ref No."]') : null;
      })();
      return {
        selected: name,
        chips,
        gstin: labels.includes('GSTIN'),
        email: labels.includes('Email'),
        phone: labels.includes('Phone'),
        referencePlaceholder: refInput ? refInput.placeholder : null,
        noContactPerson: !labels.includes('Contact Person'),
        noCustomerPan: labels.filter((l) => l === 'PAN').length === 1
      };
    })()`);
    await shot('invoice-form-customer');

    console.log(JSON.stringify({ structure, selected, errors }, null, 2));
  }
};
