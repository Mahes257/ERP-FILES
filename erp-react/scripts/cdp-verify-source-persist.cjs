module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    await navigate('http://localhost:5173/credit-notes/10/edit');
    await waitFor(`document.body.innerText.length > 200`, 15000);
    await sleep(2500);

    // Change source to 'pr' (From Payment Receipt)
    const setRes = await evalJs(`(async () => {
      const selects = [...document.querySelectorAll('select')];
      const src = selects.find((s) => [...s.options].some((o) => o.textContent.trim() === 'From Payment Receipt'));
      if (!src) return { error: 'source select not found' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(src, 'pr');
      src.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 2000));
      const srcRef = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.trim().includes('PR-2026')));
      if (srcRef && srcRef.options.length > 1) {
        const setter2 = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter2.call(srcRef, srcRef.options[1].value);
        srcRef.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 2000));
      }
      return { source: src.value };
    })()`);
    console.log('SET: ' + JSON.stringify(setRes));

    // Find and click the primary save button (Update / Update & Close / Save)
    const clickRes = await evalJs(`(async () => {
      const buttons = [...document.querySelectorAll('button')];
      const saveBtn = buttons.find((b) => /Update|Save Changes|Save/i.test(b.textContent.trim()) && !/Draft/i.test(b.textContent));
      if (!saveBtn) return { error: 'save button not found', buttons: buttons.map((b) => b.textContent.trim()).filter(Boolean).slice(0, 12) };
      saveBtn.click();
      await new Promise((r) => setTimeout(r, 3000));
      return { clicked: saveBtn.textContent.trim() };
    })()`);
    console.log('CLICK: ' + JSON.stringify(clickRes));

    // Re-fetch the record via API
    const after = await evalJs(`(async () => {
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch('/v1/credit-notes/10', { headers: { Authorization: 'Bearer ' + token } });
      const j = await res.json();
      const r = j.data || j || {};
      return { source: r.source, sourceRef: r.sourceRef, status: res.status };
    })()`);
    console.log('AFTER_API: ' + JSON.stringify(after));
    console.log('SRC_PERSIST_DONE');
  }
};
