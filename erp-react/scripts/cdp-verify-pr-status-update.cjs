/* Full dropdown round-trip on the created Payment Receipt (PR-2026-000007):
   open edit → status dropdown shows saved value → change to 'Received' →
   click Update → reopen → status dropdown shows 'Received' (real API persist). */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    await navigate('http://localhost:5173/payment-receipts/7/edit');
    await sleep(3000);

    const before = await evalJs(`(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'Received'));
      return { statusBefore: sel ? sel.value : null, statusOptions: sel ? [...sel.options].map((o) => o.value) : [] };
    })()`);
    console.log('EDIT_BEFORE: ' + JSON.stringify(before));

    // Change the status dropdown to 'Received' and read it back after a tick
    await evalJs(`(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'Received'));
      if (sel) { sel.value = 'Received'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      return !!sel;
    })()`);
    await sleep(900);
    const after = await evalJs(`(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'Received'));
      return { statusAfter: sel ? sel.value : null };
    })()`);
    console.log('EDIT_AFTER_CHANGE: ' + JSON.stringify(after));

    // Click the primary Update button
    const clicked = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /Update/i.test((b.textContent || '').trim()));
      if (btn) { btn.click(); return (btn.textContent || '').trim(); }
      return null;
    })()`);
    console.log('CLICKED: ' + JSON.stringify(clicked));
    await sleep(3500);
    const path = await evalJs(`location.pathname`);
    console.log('AFTER_UPDATE_PATH: ' + path);

    // Reopen the edit page and read the status
    await navigate('http://localhost:5173/payment-receipts/7/edit');
    await sleep(3000);
    const reopened = await evalJs(`(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'Received'));
      return { statusReopened: sel ? sel.value : null };
    })()`);
    console.log('REOPENED: ' + JSON.stringify(reopened));
    console.log('STATUS_ROUNDTRIP_DONE');
  }
};
