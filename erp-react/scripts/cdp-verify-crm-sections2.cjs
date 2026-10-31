module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;

    for (const [tag, route, expect] of [
      ['CLIENT_SECTIONS', '/clients/new', ['Business Information', 'Tax Information', 'Address', 'Linked Contacts', 'Shipping Details', 'Additional Details', 'Attachments', 'Account Details']],
      ['FOLLOWUP_SECTIONS', '/followups/new', ['Lead Information', 'Follow-up Details', 'Discussion', 'Next Action', 'Lead Details', 'Attachments']]
    ]) {
      await navigate('http://localhost:5173' + route);
      await sleep(4200);
      const titles = await evalJs(`(() => {
        const norm = (t) => t.replace(/\\s+/g, ' ').trim();
        return Array.from(document.querySelectorAll('span.text-sm.font-bold, span[class*="font-bold"]')).map((s) => norm(s.textContent)).filter(Boolean);
      })()`);
      const missing = expect.filter((e) => !titles.some((t) => t.includes(e)));
      console.log(tag + ': ' + JSON.stringify(titles));
      console.log(tag + '_MISSING: ' + (missing.length ? JSON.stringify(missing) : 'NONE'));
    }

    // Full follow-up create flow
    await navigate('http://localhost:5173/followups/new');
    await sleep(4200);

    // 1) Pick a lead (2nd option = a real lead)
    const picked = await evalJs(`(() => {
      const sel = Array.from(document.querySelectorAll('select')).find((s) => s.options.length > 1);
      if (!sel) return { ok: false };
      sel.value = sel.options[1].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, picked: sel.options[1].textContent.trim() };
    })()`);
    console.log('FU_PICK_LEAD: ' + JSON.stringify(picked));
    await sleep(1500);

    // 2) Open all accordions
    await evalJs(`(() => {
      const headers = Array.from(document.querySelectorAll('span.text-sm.font-bold'));
      for (const h of headers) {
        const btn = h.closest('button');
        if (btn) btn.click();
      }
      return headers.length;
    })()`);
    await sleep(800);

    // 3) Fill Mode + Discussion Summary
    const filled = await evalJs(`(() => {
      const norm = (t) => t.replace(/\\s+/g, ' ').trim();
      const mode = Array.from(document.querySelectorAll('select')).find((s) => Array.from(s.options).some((o) => o.textContent.trim() === 'Call'));
      if (mode) { mode.value = 'Call'; mode.dispatchEvent(new Event('change', { bubbles: true })); }
      const summary = Array.from(document.querySelectorAll('textarea')).find((t) => norm(t.placeholder).includes('discussion') || norm(t.placeholder).includes('Summary'));
      if (summary) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(summary, 'AUDIT_FOLLOWUP_PARITY_20260808 discussion summary');
        summary.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const customer = document.querySelector('input[placeholder="Customer / company"]');
      if (customer) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(customer, 'AUDIT_FOLLOWUP_PARITY_20260808');
        customer.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return { modeSet: !!mode, summarySet: !!summary };
    })()`);
    console.log('FU_FILL: ' + JSON.stringify(filled));
    await sleep(500);

    // 4) Save & Continue
    const clicked = await evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Save & Continue'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    console.log('FU_SAVE_CLICKED: ' + clicked);
    await sleep(6000);
    const fpath = await evalJs('location.pathname');
    console.log('FU_AFTER_SAVE_PATH: ' + fpath);
  }
};
