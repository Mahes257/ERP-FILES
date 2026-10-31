// CDP verification for the ERP-parity Create New Lead page.
// Checks 9 sections in order, dropdown option lists, placeholders, and the
// full create -> save -> navigation flow (real typing via Input.insertText).
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;
    await navigate('http://localhost:5173/leads/new');
    await sleep(4500);

    const report = {};

    report.sections = await evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const titles = [];
      for (const b of btns) {
        const span = b.querySelector('span');
        if (span && /Business Information|Lead Information|Primary Contact|Secondary Contact|Address|Assignment|Notes|Attachments|Internal Information/.test(span.textContent)) {
          titles.push(span.textContent.trim());
        }
      }
      return titles;
    })()`);

    report.header = await evalJs(`(() => {
      const h1 = document.querySelector('h1');
      const helper = Array.from(document.querySelectorAll('p')).map((p) => p.textContent.replace(/\\s+/g, ' ').trim()).find((t) => t.includes('required'));
      return { h1: h1 ? h1.textContent.trim() : null, helper: helper || null };
    })()`);

    report.footer = await evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('button')).map((b) => b.textContent.replace(/\\s+/g, ' ').trim()).filter((t) => /Cancel|Save Draft|Save & Create New|Save & Continue|Reset Form|Create Lead/.test(t));
      return btns;
    })()`);

    report.selects = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const counts = {};
      for (const name of ['Industry', 'Lead Source', 'Country', 'State', 'City/Town', 'Lead Owner', 'Stage', 'Priority', 'Status']) {
        const idx = labels.findIndex((l) => l.textContent.trim().startsWith(name));
        const wrap = idx >= 0 ? labels[idx].closest('div') : null;
        const sel = wrap ? wrap.querySelector('select') : null;
        counts[name] = sel ? Array.from(sel.options).map((o) => o.text).slice(0, 12).join('|') + ' (total ' + sel.options.length + ')' : 'NOT FOUND';
      }
      return counts;
    })()`);

    report.placeholders = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const found = {};
      const inputs = document.querySelectorAll('input, textarea');
      for (const el of inputs) {
        const ph = el.placeholder || '';
        if (ph) found[ph] = (found[ph] || 0) + 1;
      }
      return found;
    })()`);

    console.log('CDP_LEAD_STRUCTURE ' + JSON.stringify(report));

    // ---- Full create flow with real typing ---------------------------------
    async function typeInto(labelText, value) {
      const info = await evalJs(`(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const idx = labels.findIndex((l) => l.textContent.trim().startsWith(${JSON.stringify(labelText)}));
        if (idx < 0) return null;
        const wrap = labels[idx].closest('div');
        const input = wrap ? wrap.querySelector('input:not([type="hidden"]):not([type="date"]), textarea') : null;
        if (!input) return null;
        input.focus();
        const r = input.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      })()`);
      if (!info) return { ok: false, reason: 'input not found' };
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: info.cx, y: info.cy, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: info.cx, y: info.cy, button: 'left', clickCount: 1 });
      await sleep(250);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
      await cdp.send('Input.insertText', { text: value });
      await sleep(300);
      const current = await evalJs(`(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const idx = labels.findIndex((l) => l.textContent.trim().startsWith(${JSON.stringify(labelText)}));
        const wrap = idx >= 0 ? labels[idx].closest('div') : null;
        const input = wrap ? wrap.querySelector('input:not([type="hidden"]):not([type="date"]), textarea') : null;
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

    const fill = {};
    fill.businessName = await typeInto('Business Name', 'AUDIT_LEAD_PARITY_20260808');
    fill.website = await typeInto('Website', 'https://parity-lead.example.com');
    fill.expectedValue = await typeInto('Expected Value', '750000');
    fill.contactPerson = await typeInto('Contact Person', 'Parity Contact');
    fill.phone = await typeInto('Phone', '+91-9845012345');
    fill.email = await typeInto('Email', 'leadparity@example.com');
    fill.secondaryPerson = await typeInto('Contact Person', 'Secondary Person');
    fill.pincode = await typeInto('Pincode', '600001');

    await setSelect('Industry', 'Manufacturing');
    await setSelect('Lead Source', 'Website');
    await setSelect('Country', 'India');
    await setSelect('State', 'Tamil Nadu');
    await setSelect('City/Town', 'Chennai');
    await setSelect('Lead Owner', 'Admin');
    await setSelect('Stage', 'Qualified');
    await setSelect('Priority', 'High');
    await setSelect('Status', 'Active');
    await sleep(500);

    const submit = await evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Save & Continue'));
      if (!btn) return { error: 'no Save & Continue' };
      btn.click();
      return { clicked: true };
    })()`);
    await sleep(6000);

    report.create = { fill, submit };
    report.afterSavePath = await evalJs('window.location.pathname');
    report.formErrors = await evalJs(`(() => {
      const errs = Array.from(document.querySelectorAll('p, span')).filter((e) => /required|valid/i.test(e.textContent));
      return errs.map((e) => e.textContent.trim()).slice(0, 5);
    })()`);

    console.log('CDP_LEAD_SAVE ' + JSON.stringify(report));
  }
};
