/* Verify auto-generated CN number, company defaults, and totals labels. */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs } = helpers;
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');

    await navigate('http://localhost:5173/credit-notes/new');
    await sleep(2500);
    const needsLogin = await evalJs(`!!document.querySelector('input[type=email]')`);
    if (needsLogin) {
      await evalJs(`(() => {
        const setVal = (el, v) => {
          const proto = HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setVal(document.querySelector('input[type=email]'), 'admin@vishaktech.com');
        setVal(document.querySelector('input[type=password]'), 'Admin@123');
        document.querySelector('button[type=submit]').click();
      })()`);
      await waitFor(`!location.href.includes('signin')`, 20000);
      await sleep(2000);
      await navigate('http://localhost:5173/credit-notes/new');
      await sleep(2500);
    }
    await waitFor(`document.querySelectorAll('label').length > 5`, 25000);
    await sleep(1500);

    const result = await evalJs(`(() => {
      // Find inputs by walking up to a labeled div
      const labeled = (labelText) => {
        const labels = Array.from(document.querySelectorAll('label'));
        const lb = labels.find((l) => l.textContent.trim() === labelText);
        if (!lb) return null;
        let d = lb.parentElement;
        return d ? d.querySelector('input, select, textarea') : null;
      };
      const cnInput = labeled('Credit Note Number');
      const dateInput = labeled('Date');
      const companyInput = labeled('Company Name');
      const addrInput = labeled('Address');
      return {
        cnNo: cnInput ? cnInput.value : null,
        cnNoReadOnly: cnInput ? cnInput.readOnly : null,
        cnNoCls: cnInput ? cnInput.className : null,
        dateVal: dateInput ? dateInput.value : null,
        companyName: companyInput ? companyInput.value : null,
        address: addrInput ? addrInput.value : null,
        statusDefault: (labeled('Status') && Array.from(labeled('Status').options).find((o) => o.selected)) ? Array.from(labeled('Status').options).find((o) => o.selected).textContent.trim() : null,
        totalRows: Array.from(document.querySelectorAll('.so-total-row, .flex.items-center.justify-between')).slice(0, 12).map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60)),
        wordsVisible: document.body.innerText.includes('Only')
      };
    })()`);

    console.log(JSON.stringify({ result, errors }, null, 2));
  }
};
