module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    // ---- CREDIT NOTE: change source to 'pr' -> Source Document must populate ----
    await navigate('http://localhost:5173/credit-notes/10/edit');
    await waitFor(`document.body.innerText.length > 200`, 15000);
    await sleep(2500);

    const before = await evalJs(`(() => {
      const selects = [...document.querySelectorAll('select')];
      const src = selects.find((s) => [...s.options].some((o) => o.textContent.trim() === 'From Payment Receipt'));
      if (!src) return { error: 'source select not found' };
      return { value: src.value, text: src.options[src.selectedIndex]?.textContent.trim() };
    })()`);
    console.log('CN_BEFORE: ' + JSON.stringify(before));

    const changed = await evalJs(`(async () => {
      const selects = [...document.querySelectorAll('select')];
      const src = selects.find((s) => [...s.options].some((o) => o.textContent.trim() === 'From Payment Receipt'));
      if (!src) return { error: 'source select not found' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(src, 'pr');
      src.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 2500));
      const srcRef = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.trim().includes('PR-2026')));
      return {
        sourceValue: src.value,
        srcRefOptions: srcRef ? [...srcRef.options].map((o) => o.textContent.trim()).slice(0, 5) : [],
        srcRefSelected: srcRef ? srcRef.options[srcRef.selectedIndex]?.textContent.trim() : null
      };
    })()`);
    console.log('CN_CHANGED: ' + JSON.stringify(changed));

    // ---- INVOICE: change source to 'dc' -> Source Document must populate ----
    await navigate('http://localhost:5173/invoices/14/edit');
    await waitFor(`document.body.innerText.length > 200`, 15000);
    await sleep(2500);

    const invChanged = await evalJs(`(async () => {
      const selects = [...document.querySelectorAll('select')];
      const src = selects.find((s) => [...s.options].some((o) => o.textContent.trim() === 'From Delivery Challan'));
      if (!src) return { error: 'source select not found' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(src, 'dc');
      src.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 2500));
      const srcRef = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.trim().includes('DC-2026')));
      return {
        sourceValue: src.value,
        srcRefOptions: srcRef ? [...srcRef.options].map((o) => o.textContent.trim()).slice(0, 5) : [],
        srcRefSelected: srcRef ? srcRef.options[srcRef.selectedIndex]?.textContent.trim() : null
      };
    })()`);
    console.log('INV_CHANGED: ' + JSON.stringify(invChanged));
    console.log('SRC_ROUNDTRIP_DONE');
  }
};
