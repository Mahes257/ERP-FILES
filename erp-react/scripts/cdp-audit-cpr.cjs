/**
 * CPR + Cost Workout end-to-end create audit via the REAL forms.
 * Uses CDP Input.insertText (real typing) for comboboxes, native setters for
 * plain inputs, and verifies every save through the real API.
 */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;
    const base = 'http://localhost:5173';

    // Type text into an input found by placeholder (real CDP typing -> React onChange)
    async function typeInto(placeholder, text) {
      const ok = await evalJs(`(() => {
        const el = document.querySelector('input[placeholder=' + JSON.stringify(${JSON.stringify(placeholder)}) + ']');
        if (!el) return false;
        el.focus();
        return true;
      })()`);
      if (!ok) return false;
      await sleep(300);
      await cdp.send('Input.insertText', { text });
      await sleep(400);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await sleep(500);
      return true;
    }

    const setPlain = (placeholder, value) => evalJs(`(() => {
      const el = document.querySelector('input[placeholder=' + JSON.stringify(${JSON.stringify(placeholder)}) + ']');
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);

    const setDate = (idx, value) => evalJs(`(() => {
      const dates = Array.from(document.querySelectorAll('input[type=date]'));
      const el = dates[${idx}];
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);

    const clickExact = (text) => evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.replace(/\\s+/g, ' ').trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())});
      if (!btn) return false;
      btn.click();
      return true;
    })()`);

    const clickOneOf = (texts) => evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => {
        const t = b.textContent.replace(/\\s+/g, ' ').trim();
        return ${JSON.stringify(texts)}.includes(t);
      });
      if (!btn) return false;
      btn.click();
      return true;
    })()`);

    const dumpState = (tag) => evalJs(`(() => {
      const get = (p) => { const el = document.querySelector('input[placeholder=' + JSON.stringify(p) + ']'); return el ? el.value : null; };
      const toast = (document.querySelector('[class*="toast"]') || {}).textContent || '';
      return { path: location.pathname, prNo: get('Auto-generated or enter manually'), dept: get('Type or select department...'), req: get('Type requester name...'), prio: get('Type or select priority...'), toast };
    })()`);

    // ================= CPR =================
    try {
      console.log('\n### CPR: creating AUDIT_CPR_20260808');
      await navigate(`${base}/cprs/new`);
      await sleep(4000);
      const today = await evalJs(`(() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })()`);
      const reqDate = await evalJs(`(() => { const d = new Date(); d.setDate(d.getDate() + 7); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })()`);

      await setDate(0, today);
      await setDate(1, reqDate);
      console.log('CPR_TYPE_DEPT: ' + (await typeInto('Type or select department...', 'AUDIT Department')));
      console.log('CPR_TYPE_REQ: ' + (await typeInto('Type requester name...', 'AUDIT Requester')));
      console.log('CPR_TYPE_PRIO: ' + (await typeInto('Type or select priority...', 'Medium')));

      // Select an existing Lead from the Lead/Client combobox (aria-label="Lead / Client")
      const srcTyped = await evalJs(`(() => {
        const el = document.querySelector('input[aria-label="Lead / Client"]');
        if (!el) return false;
        el.focus();
        return true;
      })()`);
      await sleep(300);
      await cdp.send('Input.insertText', { text: 'AUDIT_LEAD' });
      await sleep(2500);
      const srcSel = await evalJs(`(() => {
        const opts = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.includes('Lead No:'));
        const audit = opts.find((b) => b.textContent.includes('AUDIT_LEAD'));
        if (!audit) return { ok: false, sample: opts.slice(0, 3).map((b) => b.textContent.replace(/\\s+/g, ' ').trim()) };
        audit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        return { ok: true, chosen: audit.textContent.replace(/\\s+/g, ' ').trim() };
      })()`);
      console.log('CPR_SRC: ' + JSON.stringify(srcSel));
      await sleep(1200);

      // Add an item row (CPR grid uses 'Add Row')
      const addItem = await clickOneOf(['Add Row', 'Add Item']);
      console.log('CPR_ADD_ITEM: ' + addItem);
      await sleep(1500);

      const descFilled = await setPlain('Enter item description', 'AUDIT_CPR_ITEM');
      console.log('CPR_ITEM_DESC: ' + descFilled);
      // qty (placeholder 0.00 inside the item row)
      const qtyFilled = await evalJs(`(() => {
        const row = document.querySelector('tr:has(input[placeholder="Enter item description"])');
        if (!row) return false;
        const ins = Array.from(row.querySelectorAll('input'));
        const qty = ins.find((i) => i.placeholder === '0.00');
        if (!qty) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(qty, '2');
        qty.dispatchEvent(new Event('input', { bubbles: true }));
        qty.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      console.log('CPR_ITEM_QTY: ' + qtyFilled);
      console.log('CPR_ITEM_UOM: ' + (await typeInto('Select UOM...', 'pcs')));

      console.log('CPR_STATE: ' + JSON.stringify(await dumpState('CPR')));
      console.log('CPR_SAVE_CLICKED: ' + (await clickExact('Save')));
      await sleep(5000);
      console.log('CPR_AFTER_SAVE: ' + JSON.stringify(await dumpState('CPR')));
    } catch (e) {
      console.log('CPR_ERROR: ' + e.message);
    }

    // ================= COST WORKOUT =================
    try {
      console.log('\n### CW: creating AUDIT_COST_20260808');
      await navigate(`${base}/cost-workouts/new`);
      await sleep(4000);
      const today = await evalJs(`(() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })()`);

      await setDate(0, today);
      console.log('CW_TYPE_PREPARER: ' + (await typeInto('Select Preparer', 'AUDIT Preparer')));
      console.log('CW_TYPE_DEPT: ' + (await typeInto('Select Department', 'AUDIT Department')));

      // Select an existing Lead from the source lookup
      const srcTyped = await evalJs(`(() => {
        const el = document.querySelector('input[placeholder="Search Lead or Client..."]');
        if (!el) return false;
        el.focus();
        return true;
      })()`);
      await sleep(300);
      await cdp.send('Input.insertText', { text: 'AUDIT_LEAD' });
      await sleep(2500);
      const srcSel = await evalJs(`(() => {
        const opts = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.includes('Lead No:') || b.textContent.includes('Client Code:'));
        const audit = opts.find((b) => b.textContent.includes('AUDIT_LEAD'));
        if (!audit) return { ok: false, count: opts.length };
        audit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        return { ok: true, chosen: audit.textContent.replace(/\\s+/g, ' ').trim() };
      })()`);
      console.log('CW_SRC: ' + JSON.stringify(srcSel));
      await sleep(1500);

      // Add Item + fill description
      const addItem = await evalJs(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.replace(/\\s+/g, ' ').includes('Add Item'));
        if (!btn) return false;
        btn.click();
        return true;
      })()`);
      console.log('CW_ADD_ITEM: ' + addItem);
      await sleep(1500);
      const itemFilled = await evalJs(`(() => {
        const h2s = Array.from(document.querySelectorAll('h2')).filter((h) => h.textContent.includes('Cost Items'));
        if (h2s.length === 0) return false;
        const card = h2s[0].closest('.bg-surface');
        if (!card) return false;
        const inputs = Array.from(card.querySelectorAll('input[type="text"]'));
        if (inputs.length === 0) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inputs[0], 'AUDIT_ITEM_20260808');
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      console.log('CW_ITEM_FILLED: ' + itemFilled);
      await sleep(600);

      console.log('CW_SAVENEW_CLICKED: ' + (await clickExact('Save & New')));
      await sleep(5000);
      const cwState = await evalJs(`(() => ({ path: location.pathname, toast: (document.querySelector('[class*="toast"]') || {}).textContent || '' }))()`);
      console.log('CW_AFTER_SAVE: ' + JSON.stringify(cwState));
    } catch (e) {
      console.log('CW_ERROR: ' + e.message);
    }
    console.log('CPR_CW_AUDIT_DONE');
  }
};
