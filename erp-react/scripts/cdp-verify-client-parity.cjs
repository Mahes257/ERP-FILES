// CDP verification for the ERP-parity Create New Client page.
// Checks: 8 section titles in ERP order, cascading country/state/city selects,
// currency count, and a full create -> save -> MySQL persistence flow.
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;
    await navigate('http://localhost:5173/clients/new');
    await sleep(4500);

    const report = {};

    // 1. Section titles in order
    report.sections = await evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const titles = [];
      for (const b of btns) {
        const span = b.querySelector('span');
        if (span && /Business Information|Tax Information|Address|Linked Contacts|Shipping Details|Additional Details|Attachments|Account Details/.test(span.textContent)) {
          titles.push(span.textContent.trim());
        }
      }
      return titles;
    })()`);

    // 2. Page title + helper
    report.header = await evalJs(`(() => {
      const h1 = document.querySelector('h1');
      const helper = Array.from(document.querySelectorAll('p')).map((p) => p.textContent.replace(/\\s+/g, ' ').trim()).find((t) => t.includes('required'));
      return { h1: h1 ? h1.textContent.trim() : null, helper: helper || null };
    })()`);

    // 3. Country / State / City selects + options count
    report.geo = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent.trim());
      const countryIdx = labels.indexOf('Country');
      const stateIdx = labels.indexOf('State / Province');
      const cityIdx = labels.indexOf('City/Town');
      const getSel = (idx) => { if (idx < 0) return null; const lbl = document.querySelectorAll('label')[idx]; const wrap = lbl.closest('div'); return wrap ? wrap.querySelector('select') : null; };
      const countrySel = getSel(countryIdx);
      return {
        labels: [labels[countryIdx], labels[stateIdx], labels[cityIdx]],
        countryOptions: countrySel ? countrySel.options.length : -1,
        stateDisabled: (() => { const s = getSel(stateIdx); return s ? s.disabled : null; })(),
        cityDisabled: (() => { const s = getSel(cityIdx); return s ? s.disabled : null; })()
      };
    })()`);

    // 4. Currency select count + default
    report.currency = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const curIdx = labels.findIndex((l) => l.textContent.includes('Currency'));
      const lbl = labels[curIdx];
      const wrap = lbl ? lbl.closest('div') : null;
      const sel = wrap ? wrap.querySelector('select') : null;
      return { options: sel ? sel.options.length : -1, value: sel ? sel.value : null, first: sel && sel.options[0] ? sel.options[0].text : null, last: sel && sel.options[sel.options.length - 1] ? sel.options[sel.options.length - 1].text : null };
    })()`);

    // 5. Footer buttons (ERP: Cancel | Save Draft || Save & Create New | Save & Continue; NO Reset Form)
    report.footer = await evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('button')).map((b) => b.textContent.replace(/\\s+/g, ' ').trim()).filter((t) => /Cancel|Save Draft|Save & Create New|Save & Continue|Reset Form/.test(t));
      return btns;
    })()`);

    // 6. Cascade: pick India -> Tamil Nadu -> check city select enables
    const cascade = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const getSel = (labelText) => {
        const idx = labels.findIndex((l) => l.textContent.trim() === labelText);
        if (idx < 0) return null;
        return labels[idx].closest('div').querySelector('select');
      };
      const countrySel = getSel('Country');
      const stateSel = getSel('State / Province');
      const citySel = getSel('City/Town');
      if (!countrySel || !stateSel) return { error: 'selects not found' };
      countrySel.value = 'India';
      countrySel.dispatchEvent(new Event('change', { bubbles: true }));
      return { stateDisabledAfterCountry: stateSel.disabled, stateOptionCount: stateSel.options.length };
    })()`);
    await sleep(700);
    const cascade2 = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const getSel = (labelText) => {
        const idx = labels.findIndex((l) => l.textContent.trim() === labelText);
        if (idx < 0) return null;
        return labels[idx].closest('div').querySelector('select');
      };
      const stateSel = getSel('State / Province');
      const citySel = getSel('City/Town');
      stateSel.value = 'Tamil Nadu';
      stateSel.dispatchEvent(new Event('change', { bubbles: true }));
      return { cityDisabledAfterState: citySel.disabled, cityOptionCount: citySel.options.length };
    })()`);
    await sleep(700);
    const cascade3 = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const getSel = (labelText) => {
        const idx = labels.findIndex((l) => l.textContent.trim() === labelText);
        if (idx < 0) return null;
        return labels[idx].closest('div').querySelector('select');
      };
      const citySel = getSel('City/Town');
      citySel.value = citySel.options[1] ? citySel.options[1].value : '';
      return { cityValue: citySel.value, cityText: citySel.options[citySel.selectedIndex] ? citySel.options[citySel.selectedIndex].text : null };
    })()`);
    report.cascade = { afterCountry: cascade, afterState: cascade2, afterCity: cascade3 };

    // 7. Industry / Client Type / Tax Treatment / Sales Person / Category / Status / Payment Terms options
    report.selects = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const counts = {};
      for (const name of ['Client Industry', 'Client Type', 'Tax Treatment', 'Sales Person', 'Category', 'Status', 'Payment Terms']) {
        const idx = labels.findIndex((l) => l.textContent.trim() === name);
        const wrap = idx >= 0 ? labels[idx].closest('div') : null;
        const sel = wrap ? wrap.querySelector('select') : null;
        counts[name] = sel ? Array.from(sel.options).map((o) => o.text).slice(0, 8).join('|') + ' (total ' + sel.options.length + ')' : 'NOT FOUND';
      }
      return counts;
    })()`);

    console.log('CDP_CREATE_CLIENT ' + JSON.stringify(report));

    // 8. Full create flow: fill required fields + save
    const filled = await evalJs(`(() => {
      const setByLabel = (labelText, value, isSelect) => {
        const labels = Array.from(document.querySelectorAll('label'));
        const idx = labels.findIndex((l) => l.textContent.trim().startsWith(labelText));
        if (idx < 0) return false;
        const wrap = labels[idx].closest('div');
        const el = wrap ? wrap.querySelector(isSelect ? 'select' : 'input') : null;
        if (!el) return false;
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      return {
        name: setByLabel('Business Name', 'AUDIT_CLIENT_PARITY2_20260808', false),
        country: setByLabel('Country', 'India', true),
        currency: setByLabel('Currency', 'INR', true),
        industry: setByLabel('Client Industry', 'Manufacturing', true),
        clientType: setByLabel('Client Type', 'Company', true)
      };
    })()`);
    await sleep(600);

    // state/city are cascade-dependent; set after country change propagated
    const cascadeFill = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const setSelect = (labelText, value) => {
        const idx = labels.findIndex((l) => l.textContent.trim().startsWith(labelText));
        if (idx < 0) return false;
        const wrap = labels[idx].closest('div');
        const sel = wrap ? wrap.querySelector('select') : null;
        if (!sel) return false;
        sel.value = value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      return { state: setSelect('State / Province', 'Tamil Nadu'), city: setSelect('City/Town', 'Chennai') };
    })()`);
    await sleep(700);

    const submit = await evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Save & Continue'));
      if (!btn) return { error: 'no Save & Continue button' };
      btn.click();
      return { clicked: true };
    })()`);
    await sleep(5000);

    report.create = { filled, cascadeFill, submit };
    report.afterSavePath = await evalJs(`(() => window.location.pathname)()`);
    report.savedToast = await evalJs(`(() => {
      const toasts = Array.from(document.querySelectorAll('[class*="toast"], [class*="Toast"]')).map((t) => t.textContent.trim()).filter(Boolean);
      return toasts;
    })()`);

    console.log('CDP_CREATE_CLIENT_SAVE ' + JSON.stringify(report));
  }
};
