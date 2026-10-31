// CDP verification for the ERP-parity Follow-up Create page.
// Checks structure + runs a real create flow with real typing (React controlled inputs).
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;

    await navigate('http://localhost:5173/followups/new');
    await sleep(4500);

    // ---- STRUCTURE CHECK ----
    const structure = await evalJs(`(() => {
      const acc = Array.from(document.querySelectorAll('button')).filter((b) => {
        const t = b.textContent.trim();
        return ['Lead Information', 'Follow-up Details', 'Discussion', 'Next Action', 'Lead Details', 'Attachments'].includes(t.split(String.fromCharCode(10))[0]) || t.startsWith('Lead Information');
      });
      const titles = Array.from(document.querySelectorAll('button span, button h3, button')).map((b) => b.textContent.trim()).filter((t) => ['Lead Information','Follow-up Details','Discussion','Next Action','Lead Details','Attachments'].includes(t));
      const accHeaders = Array.from(document.querySelectorAll('button')).filter((b) => /(Lead Information|Follow-up Details|Discussion|Next Action|Lead Details|Attachments)$/.test(b.textContent.trim()) && !b.textContent.trim().includes('Back to'));
      const sectionTitles = accHeaders.map((b) => b.textContent.trim());

      const getOpts = (label) => {
        const labels = Array.from(document.querySelectorAll('label'));
        const l = labels.find((x) => x.textContent.trim().startsWith(label));
        if (!l) return null;
        const wrap = l.closest('div');
        const sel = wrap ? wrap.querySelector('select') : null;
        return sel ? Array.from(sel.options).map((o) => o.text) : null;
      };

      const readonly = {};
      ['Customer / Company','Phone','Email','Lead Status','Source','Industry','Executive'].forEach((label) => {
        const labels = Array.from(document.querySelectorAll('label'));
        const l = labels.find((x) => x.textContent.trim().startsWith(label));
        if (!l) return;
        const wrap = l.closest('div');
        const input = wrap ? wrap.querySelector('input, textarea') : null;
        readonly[label] = input ? { readOnly: input.readOnly, placeholder: input.placeholder || null } : null;
      });

      const footerBtns = Array.from(document.querySelectorAll('button')).filter((b) => /(Cancel|Save Draft|Save & Create New|Save & Continue|Reset Form)/.test(b.textContent.trim())).map((b) => b.textContent.trim().replace(/\\s+/g, ' '));

      return {
        h1: document.querySelector('h1')?.textContent.trim() || null,
        breadcrumb: (document.querySelector('.flex.items-center.gap-2.text-xs')?.textContent.replace(/\\s+/g, ' ').trim()) || null,
        helper: (() => {
          const els = Array.from(document.querySelectorAll('p, div'));
          const h = els.find((e) => e.textContent.includes('Fields marked with'));
          return h ? h.textContent.replace(/\\s+/g, ' ').trim() : null;
        })(),
        sectionTitles,
        modeOpts: getOpts('Mode'),
        priorityOpts: getOpts('Priority'),
        statusOpts: getOpts('Current Status'),
        outcomeOpts: getOpts('Outcome'),
        reminderOpts: getOpts('Reminder'),
        reminderTypeOpts: getOpts('Reminder Type'),
        assignToOpts: getOpts('Assign To'),
        readonly,
        footerBtns,
        hasConvertCprBanner: !!document.body.textContent.includes('Lead is ready for CPR Conversion'),
        hasResetForm: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Reset Form'))
      };
    })()`);

    console.log('CDP_FU_STRUCTURE ' + JSON.stringify(structure));

    // ---- CREATE FLOW (real typing) ----
    const results = {};

    // 1. Pick a real lead (select change works for React onChange)
    const leadPicked = await evalJs(`(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const l = labels.find((x) => x.textContent.trim().startsWith('Lead'));
      if (!l) return { ok: false, reason: 'Lead label missing' };
      const wrap = l.closest('div');
      const sel = wrap ? wrap.querySelector('select') : null;
      if (!sel || sel.options.length < 2) return { ok: false, reason: 'no lead options' };
      const pickIdx = Math.min(1, sel.options.length - 1);
      sel.value = sel.options[pickIdx].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, leadLabel: sel.options[sel.selectedIndex].text };
    })()`);
    results.leadPicked = leadPicked;
    await sleep(800);

    // 2. Auto-fill check
    results.autoFill = await evalJs(`(() => {
      const get = (label) => {
        const labels = Array.from(document.querySelectorAll('label'));
        const l = labels.find((x) => x.textContent.trim().startsWith(label));
        if (!l) return null;
        const wrap = l.closest('div');
        const input = wrap ? wrap.querySelector('input, textarea') : null;
        return input ? input.value : null;
      };
      return {
        customer: get('Customer / Company'),
        contact: get('Contact Person'),
        phone: get('Phone'),
        email: get('Email'),
        source: get('Source'),
        industry: get('Industry'),
        executive: get('Executive'),
        bannerVisible: !!document.body.textContent.includes('Lead is ready for CPR Conversion')
      };
    })()`);

    // 3. Fill discussion summary via real typing
    async function typeInto(labelText, value) {
      const info = await evalJs(`(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const idx = labels.findIndex((l) => l.textContent.trim().startsWith(${JSON.stringify(labelText)}));
        if (idx < 0) return null;
        const wrap = labels[idx].closest('div');
        const input = wrap ? wrap.querySelector('input:not([type=\"hidden\"]), textarea') : null;
        if (!input) return null;
        input.focus();
        const r = input.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, tag: input.tagName };
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
        const input = wrap ? wrap.querySelector('input:not([type=\"hidden\"]), textarea') : null;
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

    results.discussion = await typeInto('Discussion Summary', 'AUDIT_FOLLOWUP_PARITY_20260808 - discussion with lead');
    await setSelect('Mode', 'Call');
    await setSelect('Current Status', 'Open');
    await setSelect('Outcome', 'Interested');
    await setSelect('Assign To', 'Self');
    await sleep(400);

    // Save & Continue
    await evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Save & Continue') && b.textContent.includes('Saving') === false);
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(6000);

    results.path = await evalJs('window.location.pathname');
    results.formError = await evalJs(`(() => {
      const errs = Array.from(document.querySelectorAll('p, span')).filter((e) => /required|valid/i.test(e.textContent) && /rose|red/.test(e.className || ''));
      return errs.map((e) => e.textContent.trim()).slice(0, 4);
    })()`);

    console.log('CDP_FU_SAVE ' + JSON.stringify(results));
  }
};
