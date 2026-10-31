/* Debug DOM structure: how labels and selects are related on the CN form. */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs } = helpers;
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
    await sleep(1200);

    const result = await evalJs(`(() => {
      const out = [];
      Array.from(document.querySelectorAll('label')).forEach((l) => {
        const t = l.textContent.trim();
        if (['Reason for Credit Note', 'Refund Amount', 'Source', 'Source Document', 'Status', 'Inventory Impact'].includes(t)) {
          let p = l.parentElement;
          const chain = [];
          let depth = 0;
          while (p && depth < 4) {
            chain.push(p.tagName + '.' + (typeof p.className === 'string' ? p.className.slice(0, 40) : ''));
            const sel = p.querySelector('select, input, textarea');
            if (sel) {
              out.push({ label: t, depth, el: sel.tagName + (sel.id ? '#' + sel.id : '') + (sel.placeholder ? '[' + sel.placeholder + ']' : '') });
              break;
            }
            p = p.parentElement;
            depth++;
          }
        }
      });
      return out;
    })()`);

    console.log(JSON.stringify({ result }, null, 2));
  }
};
