module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;
    const SECTION_TITLES = `(() => {
      const norm = (t) => t.replace(/\\s+/g, ' ').trim();
      // Accordion headers render as buttons/divs with the section title
      const candidates = Array.from(document.querySelectorAll('button, [class*="accordion"] [class*="header"], [class*="accordion"] > div > div:first-child'))
        .map((el) => norm(el.textContent))
        .filter((t) => t && t.length > 3 && t.length < 60);
      return Array.from(new Set(candidates)).slice(0, 20);
    })()`;

    // 1) Section titles on both create pages
    for (const [tag, route, expect] of [
      ['CLIENT_SECTIONS', '/clients/new', ['Business Information', 'Tax Information', 'Address', 'Linked Contacts', 'Shipping Details', 'Additional Details', 'Attachments', 'Account Details']],
      ['FOLLOWUP_SECTIONS', '/followups/new', ['Lead Information', 'Follow-up Details', 'Discussion', 'Next Action', 'Lead Details', 'Attachments']]
    ]) {
      await navigate('http://localhost:5173' + route);
      await sleep(4200);
      const titles = await evalJs(SECTION_TITLES);
      const missing = expect.filter((e) => !titles.some((t) => t.includes(e)));
      console.log(tag + ': titles=' + JSON.stringify(titles));
      console.log(tag + '_MISSING: ' + (missing.length ? JSON.stringify(missing) : 'NONE'));
    }

    // 2) End-to-end: create a client (stage WON) through the real create page
    await navigate('http://localhost:5173/clients/new');
    await sleep(4200);
    await evalJs(`(() => {
      const setVal = (selector, value) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      setVal('input[placeholder="Registered business name"]', 'AUDIT_CLIENT_PARITY_20260808');
      setVal('input[placeholder="Primary contact person"]', 'Parity Contact');
      setVal('input[placeholder="billing@company.com"]', 'parity@client.com');
      setVal('input[placeholder="+91 98765 43210"]', '+91 9876543210');
      return true;
    })()`);
    await sleep(600);
    const clicked = await evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Save & Continue'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    console.log('CLIENT_SAVE_CLICKED: ' + clicked);
    await sleep(5000);
    const path = await evalJs('location.pathname');
    console.log('CLIENT_AFTER_SAVE_PATH: ' + path);

    // 3) End-to-end: create a follow-up (stage Qualified) — needs a lead selection
    await navigate('http://localhost:5173/followups/new');
    await sleep(4200);
    await evalJs(`(() => {
      const sel = document.querySelector('select');
      if (!sel || sel.options.length < 2) return { ok: false, opts: sel ? sel.options.length : 0 };
      sel.value = sel.options[1].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, picked: sel.options[1].textContent.trim() };
    })()`);
    await sleep(1200);
    const fu = await evalJs(`(() => {
      const norm = (t) => t.replace(/\\s+/g, ' ').trim();
      const setVal = (selector, value) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      const mode = Array.from(document.querySelectorAll('select')).find((s) => s.options[1] && s.options[1].textContent.trim() === 'Call');
      if (mode) { mode.value = 'Call'; mode.dispatchEvent(new Event('change', { bubbles: true })); }
      const summary = Array.from(document.querySelectorAll('textarea')).find((t) => norm(t.placeholder).includes('discussion'));
      if (summary) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(summary, 'AUDIT_FOLLOWUP_PARITY discussion summary');
        summary.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return { hasMode: !!mode, hasSummary: !!summary };
    })()`);
    console.log('FOLLOWUP_FILL: ' + JSON.stringify(fu));
    await sleep(500);
    const fclicked = await evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Save & Continue'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    console.log('FOLLOWUP_SAVE_CLICKED: ' + fclicked);
    await sleep(5000);
    const fpath = await evalJs('location.pathname');
    console.log('FOLLOWUP_AFTER_SAVE_PATH: ' + fpath);
  }
};
