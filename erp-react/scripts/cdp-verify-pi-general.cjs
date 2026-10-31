/* Verify the Proforma Invoice create page General Information section against
 * the ERP reference (proforma-invoice-create.html) field-by-field:
 *  - Section title/position (first card)
 *  - PI Number (readonly auto-generated) + Date
 *  - Customer search placeholder + Contact Person placeholder
 *  - No required asterisks in the section
 *  - Client chips (GSTIN/PAN/Email/Phone) + Billing Address + shipping toggle
 *    hidden until a customer is selected
 *  - Shipping Address hidden until the "different from billing" toggle is on
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
    await navigate(base + '/proforma-invoices/new');
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
      await navigate(base + '/proforma-invoices/new');
      await sleep(2500);
    }

    await waitFor(`document.querySelectorAll('label').length > 5`, 25000);
    await sleep(1500);

    // ---- Structural checks BEFORE customer selection ----
    const before = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent.trim());
      const custInput = document.querySelector('input[placeholder^="Search customer"]');
      const contact = Array.from(document.querySelectorAll('input')).find((i) => i.placeholder === 'Contact person');
      const piNo = (() => {
        const lab = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'PI Number');
        return lab && lab.parentElement ? lab.parentElement.querySelector('input') : null;
      })();
      const dateInput = (() => {
        const lab = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Date');
        return lab && lab.parentElement ? lab.parentElement.querySelector('input') : null;
      })();
      const giCard = (() => {
        const lab = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'PI Number');
        return lab ? lab.closest('div[class*="rounded-xl"]') : null;
      })();
      const mainCol = giCard ? giCard.parentElement : null;
      const accordionTitles = Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => t && t.length < 40);
      return {
        labels: labels.slice(0, 20),
        accordionTitles,
        giHeadingFound: accordionTitles.some((t) => t.includes('General Information')),
        customerPlaceholder: custInput ? custInput.placeholder : null,
        customerAria: custInput ? custInput.getAttribute('aria-label') : null,
        contactPlaceholder: contact ? contact.placeholder : null,
        piNo: piNo ? { value: piNo.value, readOnly: piNo.readOnly, bg: getComputedStyle(piNo).backgroundColor } : null,
        piDate: dateInput ? { type: dateInput.type, value: dateInput.value } : null,
        giCardFirstInColumn: giCard && mainCol ? mainCol.firstElementChild === giCard : null,
        gstinVisible: labels.some((l) => l === 'GSTIN'),
        billingVisible: labels.some((l) => l === 'Billing Address'),
        shipToggleVisible: labels.some((l) => l.includes('Shipping address different from billing')),
        asterisks: labels.filter((l) => l.includes('*')).slice(0, 10)
      };
    })()`);
    await shot('pi-form-before');

    // ---- Select the first customer via the lookup ----
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
      return { selected: name };
    })()`);
    await shot('pi-form-after-select');

    const after = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent.trim());
      const chips = Array.from(document.querySelectorAll('div.rounded-lg.bg-slate-50')).map((c) => c.textContent.trim()).filter((c) => c !== '');
      const shipToggleLabel = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.includes('Shipping address different from billing'));
      const shipToggle = shipToggleLabel ? shipToggleLabel.querySelector('input[type=checkbox]') : null;
      const shipAddrLabel = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Shipping Address');
      const billingLabel = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Billing Address');
      return {
        labels: labels.slice(0, 20),
        chips,
        gstin: labels.some((l) => l === 'GSTIN'),
        pan: labels.some((l) => l === 'PAN'),
        email: labels.some((l) => l === 'Email'),
        phone: labels.some((l) => l === 'Phone'),
        billingVisible: billingLabel ? billingLabel.parentElement.offsetHeight > 0 : false,
        shipTogglePresent: !!shipToggle,
        shipToggleChecked: shipToggle ? shipToggle.checked : null,
        shipAddrVisible: shipAddrLabel ? shipAddrLabel.parentElement.offsetHeight > 0 : false
      };
    })()`);

    // ---- Toggle shipping-different checkbox ----
    const toggled = await evalJs(`(async () => {
      const label = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.includes('Shipping address different from billing'));
      if (!label) return { error: 'toggle not found' };
      const cb = label.querySelector('input[type=checkbox]');
      cb.click();
      await new Promise((r) => setTimeout(r, 600));
      const shipAddrLabel = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Shipping Address');
      return {
        checkedAfterClick: cb.checked,
        shipAddrVisible: shipAddrLabel ? shipAddrLabel.parentElement.offsetHeight > 0 : false
      };
    })()`);
    await shot('pi-form-after-toggle');

    console.log(JSON.stringify({ selected, before, after, toggled, errors }, null, 2));
  }
};
