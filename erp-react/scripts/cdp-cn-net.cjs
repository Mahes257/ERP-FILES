/* Capture network requests + responses during the CN save to find the 404. */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs } = helpers;
    const net = [];
    await cdp.send('Network.enable');
    cdp.on('Network.responseReceived', (p) => {
      if (p.response && p.response.status >= 400) {
        net.push({ url: p.response.url, status: p.response.status });
      }
    });

    const setVal = `(el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };`;

    await navigate('http://localhost:5173/credit-notes/new');
    await sleep(2500);
    const needsLogin = await evalJs(`!!document.querySelector('input[type=email]')`);
    if (needsLogin) {
      await evalJs(`(() => {
        const setVal = ${setVal};
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

    // Select customer + add item + save (Submit for Approval)
    await evalJs(`(async () => {
      const setVal = ${setVal};
      const input = document.querySelector('input[aria-label="Select Customer"], input[placeholder^="Search customer"]');
      input.focus();
      setVal(input, 'a');
      await new Promise((r) => setTimeout(r, 900));
      const sug = Array.from(document.querySelectorAll('body > div[class*="fixed"] button'))
        .find((b) => b.className.includes('w-full text-left') && b.textContent.trim().length > 0);
      sug.click();
      await new Promise((r) => setTimeout(r, 900));
      const addBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Add Item'));
      addBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      const product = Array.from(document.querySelectorAll('input')).find((i) => i.placeholder === 'Product name');
      setVal(product, 'CN Net Item');
      await new Promise((r) => setTimeout(r, 300));
      const saveBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Submit for Approval');
      saveBtn.click();
      await new Promise((r) => setTimeout(r, 3500));
      return { url: location.href };
    })()`);

    const body = await evalJs(`document.body.innerText.slice(0, 300)`);
    console.log(JSON.stringify({ net, body, finalUrl: await evalJs('location.href') }, null, 2));
  }
};
