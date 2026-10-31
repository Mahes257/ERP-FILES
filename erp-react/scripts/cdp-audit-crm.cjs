/**
 * CRM audit: create Client / Lead / Follow-up through the REAL /leads/new form.
 * Clients scope = stage WON; Follow-ups scope = stage not in (WON, LOST); Leads = all.
 * Each record is verified via the REAL /v1/leads API after save.
 */
const H = require('./cdp-audit-helpers.cjs');

const MODULES = [
  { tag: 'CLIENT', marker: 'AUDIT_CLIENT_20260808', stage: 'Won' },
  { tag: 'LEAD', marker: 'AUDIT_LEAD_20260808', stage: 'New' },
  { tag: 'FOLLOWUP', marker: 'AUDIT_FOLLOWUP_20260808', stage: 'Qualified' }
];

function openSection(evalJs, title) {
  return evalJs(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => {
      const t = b.textContent.replace(/\\s+/g, ' ').trim();
      return t.length < 80 && t.includes(${JSON.stringify(title)});
    });
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
}

module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;
    const base = 'http://localhost:5173';

    for (const m of MODULES) {
      try {
        console.log(`\n### CRM_${m.tag}: creating ${m.marker}`);
        await navigate(`${base}/leads/new`);
        await sleep(2000);

        // Business Information section is open by default -> fill Business Name FIRST
        // (required field) before toggling any accordion.
        const bizFilled = await evalJs(`(() => {
          const label = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim().startsWith('Business Name'));
          if (!label) return false;
          const el = label.htmlFor ? document.getElementById(label.htmlFor) : label.closest('div').querySelector('input');
          if (!el) return false;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, ${JSON.stringify(m.marker)});
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`);
        console.log(`CRM_${m.tag}_BIZ_FILLED: ${bizFilled}`);

        // Open the remaining closed accordion sections (Lead Information, Primary Contact, Assignment)
        await openSection(evalJs, 'Lead Information');
        await openSection(evalJs, 'Primary Contact');
        await openSection(evalJs, 'Assignment');
        await sleep(600);

        // Lead Name + Company
        await evalJs(`(() => {
          const set = (labelText, val) => {
            const label = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim().startsWith(labelText));
            if (!label) return false;
            const el = label.htmlFor ? document.getElementById(label.htmlFor) : label.closest('div').querySelector('input, textarea, select');
            if (!el) return false;
            const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          };
          set('Lead Name', ${JSON.stringify(m.marker + '_CONTACT')});
          set('Company', ${JSON.stringify(m.marker + '_CO')});
          return true;
        })()`);

        // Email + Phone (required)
        await evalJs(`(() => {
          const set = (labelText, val) => {
            const label = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim().startsWith(labelText));
            if (!label) return false;
            const el = label.htmlFor ? document.getElementById(label.htmlFor) : label.closest('div').querySelector('input, textarea, select');
            if (!el) return false;
            const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          };
          set('Email Address', ${JSON.stringify(m.marker.toLowerCase() + '@audit.test')});
          set('Phone Number', '+91 98765 00001');
          return true;
        })()`);

        // Pipeline Stage -> WON for client scope
        if (m.stage) {
          await evalJs(`(() => {
            const label = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim().startsWith('Pipeline Stage'));
            const el = label ? (label.htmlFor ? document.getElementById(label.htmlFor) : label.closest('div').querySelector('select')) : null;
            if (!el) return false;
            const opt = Array.from(el.options).find((o) => o.textContent.trim().toLowerCase() === ${JSON.stringify(m.stage.toLowerCase())});
            if (!opt) return false;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
            setter.call(el, opt.value);
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          })()`);
        }

        await sleep(500);

        // Click the exact 'Create Lead' submit button
        const clicked = await evalJs(`(() => {
          const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim().toLowerCase().includes('create lead'));
          if (!btn) return false;
          btn.click();
          return true;
        })()`);
        console.log(`CRM_${m.tag}_CLICKED: ${clicked}`);
        await sleep(4500);

        const after = await evalJs(`(() => ({ path: location.pathname, toast: (document.querySelector('[class*="toast"]') || {}).textContent || '' }))()`);
        console.log(`CRM_${m.tag}_AFTER: ${JSON.stringify(after)}`);

        // Verify via API: search leads for the marker
        const found = await evalJs(`(async () => {
          const token = localStorage.getItem('authToken') || '';
          const res = await fetch('/v1/leads?page=0&size=50&search=' + encodeURIComponent(${JSON.stringify(m.marker)}), {
            headers: { Authorization: 'Bearer ' + token }
          });
          let body = null;
          try { body = await res.json(); } catch (e) {}
          const list = Array.isArray(body) ? body : (body && body.content) || (body && body.data && body.data.content) || (body && body.data) || [];
          const sorted = list.slice().sort((a, b) => (b.id || 0) - (a.id || 0));
          const newest = sorted[0] || null;
          return { status: res.status, total: list.length, first: newest ? { id: newest.id, businessName: newest.businessName, stage: newest.stage, status: newest.status, name: newest.name } : null };
        })()`);
        console.log(`CRM_${m.tag}_API: ${JSON.stringify(found)}`);
      } catch (e) {
        console.log(`CRM_${m.tag}_ERROR: ${e.message}`);
      }
    }
    console.log('CRM_AUDIT_DONE');
  }
};
