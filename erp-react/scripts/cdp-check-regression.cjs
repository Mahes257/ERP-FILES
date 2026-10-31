/* Regression check: the shared SalesFormPage/SalesItemGrid changes must not
 * disturb other modules. Verify the Proforma Invoice form still renders its
 * ERP-aligned sections and the Sales Order form still renders normally. */
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

    const base = 'http://localhost:5173';
    const loginIfNeeded = async () => {
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
      }
    };
    await loginIfNeeded();

    // Proforma: sections + PI Number readonly + item grid headers
    await navigate(base + '/proforma-invoices/new');
    await sleep(2500);
    const proforma = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent.trim());
      const titles = Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => t && t.length < 40);
      const ths = Array.from(document.querySelectorAll('table thead th')).map((th) => th.textContent.trim());
      return {
        labels: labels.slice(0, 12),
        hasGI: labels.includes('PI Number') && labels.includes('Customer'),
        hasSections: ['General Information', 'Reference Details', 'Bank Details'].every((t) => titles.some((x) => x.includes(t))),
        itemThs: ths.slice(0, 6)
      };
    })()`);

    // Sales Order: sections render normally
    await navigate(base + '/sales-orders/new');
    await sleep(2500);
    const so = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent.trim());
      const titles = Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).filter((t) => t && t.length < 40);
      return {
        labels: labels.slice(0, 10),
        hasSections: ['Order Details', 'Client Information', 'Notes'].every((t) => titles.some((x) => x.includes(t))),
        hasItemsInSidebar: document.body.innerText.includes('Item Details')
      };
    })()`);

    console.log(JSON.stringify({ proforma, so, errors }, null, 2));
  }
};
