// Real-typing create flow for the Create New Client page.
// Uses CDP Input.insertText (React controlled inputs need real key events).
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;

    await navigate('http://localhost:5173/clients/new');
    await sleep(4000);

    async function typeInto(labelText, value) {
      const info = await evalJs(`(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const idx = labels.findIndex((l) => l.textContent.trim().startsWith(${JSON.stringify(labelText)}));
        if (idx < 0) return null;
        const wrap = labels[idx].closest('div');
        const input = wrap ? wrap.querySelector('input:not([type="hidden"]), textarea') : null;
        if (!input) return null;
        input.focus();
        const r = input.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, tag: input.tagName };
      })()`);
      if (!info) return { ok: false, reason: 'input not found' };
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: info.cx, y: info.cy, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: info.cx, y: info.cy, button: 'left', clickCount: 1 });
      await sleep(250);
      // select all + insert
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
      await cdp.send('Input.insertText', { text: value });
      await sleep(300);
      const current = await evalJs(`(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const idx = labels.findIndex((l) => l.textContent.trim().startsWith(${JSON.stringify(labelText)}));
        const wrap = idx >= 0 ? labels[idx].closest('div') : null;
        const input = wrap ? wrap.querySelector('input:not([type="hidden"]), textarea') : null;
        return input ? input.value : null;
      })()`);
      return { ok: true, current };
    }

    async function setSelect(labelText, value) {
      return evalJs(`(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const idx = labels.findIndex((l) => l.textContent.trim().startsWith(${JSON.stringify(labelText)}));
        if (idx < 0) return false;
        const wrap = labels[idx].closest('div');
        const sel = wrap ? wrap.querySelector('select') : null;
        if (!sel) return false;
        sel.value = ${JSON.stringify(value)};
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
    }

    const results = {};
    results.businessName = await typeInto('Business Name', 'AUDIT_CLIENT_PARITY2_20260808');
    results.website = await typeInto('Website', 'https://parity2.example.com');
    results.gstin = await typeInto('Business GSTIN', '27AABCU1234D1Z5');
    results.email = await typeInto('Email', 'parity2@example.com');
    results.phone = await typeInto('Phone Number', '+91-9876543210');
    results.clientCode = await typeInto('Client Code', 'C-PARITY2');

    await setSelect('Country', 'India');
    await sleep(600);
    await setSelect('State / Province', 'Tamil Nadu');
    await sleep(600);
    await setSelect('City/Town', 'Chennai');
    await sleep(400);
    await setSelect('Client Industry', 'Manufacturing');
    await setSelect('Client Type', 'Company');
    await setSelect('Tax Treatment', 'Registered');
    await setSelect('Sales Person', 'Admin User');
    await setSelect('Category', 'Distributor');
    await setSelect('Status', 'Active');
    await setSelect('Currency', 'INR');
    await setSelect('Payment Terms', 'Net 30');

    await sleep(500);
    // Save & Continue
    await evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Save & Continue'));
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(6000);

    results.path = await evalJs('window.location.pathname');
    results.toast = await evalJs(`(() => {
      const el = document.querySelector('[class*="toast"], [class*="Toast"]');
      return el ? el.textContent.trim() : null;
    })()`);
    results.formError = await evalJs(`(() => {
      const errs = Array.from(document.querySelectorAll('p, span')).filter((e) => /required|valid/i.test(e.textContent) && /rose|red/.test(e.className || ''));
      return errs.map((e) => e.textContent.trim()).slice(0, 4);
    })()`);

    console.log('CDP_CLIENT_SAVE ' + JSON.stringify(results));
  }
};
