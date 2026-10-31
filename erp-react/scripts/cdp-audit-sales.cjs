/**
 * Sales modules end-to-end create audit (Quotation, SC, SO, DC, PI, Invoice, PR, CN)
 * Drives the REAL create forms (real typing via CDP Input.insertText) and verifies
 * each save through the real API list endpoints.
 *
 * Note: headless-Chrome textContent drops the letter "s" inside some buttons
 * ("Save & Finish" -> "Save & Fini h"), so button matching is 's'-insensitive.
 */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;
    const base = 'http://localhost:5173';

    const CLIENT_ARIA = ['Client', 'Customer', 'Select Customer'];

    const MODULES = [
      { tag: 'QUOTATION', route: '/quotations/new', api: '/quotations', client: 'Apex Industries', query: 'Ape', itemMode: 'qtn' },
      { tag: 'SC', route: '/sales-contracts/new', api: '/sales-contracts', client: 'SK Logistics', query: 'SK ', itemMode: 'lines' },
      { tag: 'SO', route: '/sales-orders/new', api: '/sales-orders', client: 'TechVision Labs', query: 'Tec', itemMode: 'lines' },
      { tag: 'DC', route: '/delivery-challans/new', api: '/delivery-challans', client: 'Prakash Exports', query: 'Pra', itemMode: 'lines' },
      { tag: 'PI', route: '/proforma-invoices/new', api: '/proforma-invoices', client: 'Subramani Pharma', query: 'Sub', itemMode: 'simple' },
      { tag: 'INVOICE', route: '/invoices/new', api: '/invoices', client: 'Apex Industries', query: 'Ape', itemMode: 'simple' },
      { tag: 'PR', route: '/payment-receipts/new', api: '/payment-receipts', client: 'SK Logistics', query: 'SK ', itemMode: 'none' },
      { tag: 'CN', route: '/credit-notes/new', api: '/credit-notes', client: 'TechVision Labs', query: 'Tec', itemMode: 'simple' }
    ];

    // 's'-insensitive + letters-only normalization for matching button labels
    const norm = (t) => String(t).replace(/s/gi, '').replace(/[^a-z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim();

    async function typeInto(selExpr, text) {
      const ok = await evalJs(`(() => {
        const el = document.querySelector(${JSON.stringify(selExpr)});
        if (!el) return false;
        el.focus();
        return true;
      })()`);
      if (!ok) return false;
      await sleep(300);
      await cdp.send('Input.insertText', { text });
      await sleep(500);
      return true;
    }

    const setPlain = (selExpr, value) => evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(selExpr)});
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);

    const setSelect = (selExpr, value) => evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(selExpr)});
      if (!el) return false;
      const opt = Array.from(el.options).find((o) => String(o.value) === String(${JSON.stringify(value)}));
      if (!opt) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(el, opt.value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);

    // click a button whose normalized label equals the target text
    const clickNorm = (text) => evalJs(`(() => {
      const target = ${JSON.stringify(norm(text))};
      const btn = Array.from(document.querySelectorAll('button')).find((b) => {
        const n = ${'(' + norm.toString() + ')(b.textContent)'};
        return n === target && !b.disabled;
      });
      if (!btn) return false;
      btn.click();
      return true;
    })()`);

    // click the primary save button (dark green #032f25, else qtn-btn-primary)
    const clickPrimary = () => evalJs(`(() => {
      let btn = Array.from(document.querySelectorAll('button')).find((b) => b.className.includes('032f25') && !b.disabled);
      if (!btn) btn = document.querySelector('.qtn-btn-primary');
      if (!btn) {
        const footer = document.querySelector('.sticky, .qtn-form-footer');
        if (footer) {
          const bs = Array.from(footer.querySelectorAll('button')).filter((b) => !b.disabled);
          btn = bs[bs.length - 1];
        }
      }
      if (!btn) return false;
      btn.click();
      return true;
    })()`);

    // Fire both mousedown (for onMouseDown-only options) and click (for onClick-only
    // options, e.g. ClientLookup commits its selection only in onClick).
    const clickOptionByText = (text) => evalJs(`(() => {
      const opts = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.includes(${JSON.stringify(text)}));
      const el = opts[0];
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.click();
      return true;
    })()`);

    for (const m of MODULES) {
      try {
        console.log(`\n### SALES_${m.tag}: ${m.client}`);
        await navigate(base + m.route);
        await sleep(4500);

        // hook fetch to capture /v1 traffic for this module
        await evalJs(`(() => {
          window.__cap = [];
          const orig = window.fetch;
          window.fetch = function (input, init) {
            const url = typeof input === 'string' ? input : input.url;
            return orig.apply(this, arguments).then(async (res) => {
              if (url.includes('/v1/') && ((init && init.method) || 'GET') !== 'GET') {
                let body = null;
                try { body = await res.clone().text(); } catch (e) {}
                window.__cap.push({ url: url.slice(0, 100), status: res.status, body: body ? body.slice(0, 250) : null });
              }
              return res;
            });
          };
          return true;
        })()`);

        // ---- Client lookup ----
        let clientPicked = false;
        for (const aria of CLIENT_ARIA) {
          const sel = `input[aria-label="${aria}"]`;
          const present = await evalJs(`!!document.querySelector(${JSON.stringify(sel)})`);
          if (present) {
            const typed = await typeInto(sel, m.query);
            await sleep(2200);
            const picked = await clickOptionByText(m.client);
            clientPicked = picked;
            console.log(`SALES_${m.tag}_CLIENT(${aria}): typed=${typed} picked=${picked}`);
            break;
          }
        }
        if (!clientPicked) console.log(`SALES_${m.tag}_CLIENT_MISS`);
        await sleep(800);

        // ---- Items ----
        if (m.itemMode === 'lines') {
          // SC/SO/DC line grid: Add New Line -> Item description | HSN | UOM | Qty | Rate | Disc | GST
          console.log('SALES_' + m.tag + '_ADDLINE: ' + (await clickNorm('Add New Line')));
          await sleep(1200);
          const desc = await setPlain('input[placeholder="Item description"]', 'AUDIT_ITEM_20260808');
          const qty = await evalJs(`(() => {
            const trs = Array.from(document.querySelectorAll('tbody tr'));
            const row = trs[trs.length - 1];
            if (!row) return false;
            const ins = Array.from(row.querySelectorAll('input'));
            const set = (el, v) => {
              if (!el) return false;
              const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              s.call(el, v);
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            };
            const a = set(ins[3], '2');
            const b = set(ins[4], '500');
            const sel = row.querySelector('select');
            let c = false;
            if (sel) {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
              setter.call(sel, '18');
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              sel.dispatchEvent(new Event('input', { bubbles: true }));
              c = true;
            }
            return { a, b, c };
          })()`);
          console.log('SALES_' + m.tag + '_ROWFILL: desc=' + desc + ' ' + JSON.stringify(qty));
          console.log('SALES_' + m.tag + '_UOM: ' + (await typeInto('input[aria-label="UOM"]', 'pcs')));
        } else if (m.itemMode === 'simple') {
          console.log('SALES_' + m.tag + '_ADDITEM: ' + (await clickNorm('Add Item')));
          await sleep(1200);
          await setPlain('input[placeholder="Product name"]', 'AUDIT_ITEM_20260808');
          const filled = await evalJs(`(() => {
            const row = document.querySelector('tr:has(input[placeholder="Product name"])');
            if (!row) return false;
            const ins = Array.from(row.querySelectorAll('input'));
            const set = (el, v) => {
              const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              s.call(el, v);
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            };
            if (ins[2]) set(ins[2], '2');
            if (ins[4]) set(ins[4], '500');
            if (ins[5]) set(ins[5], '18');
            return true;
          })()`);
          console.log('SALES_' + m.tag + '_ITEMFILL: ' + filled);
        } else if (m.itemMode === 'qtn') {
          const opened = await evalJs(`(() => {
            const btn = document.querySelectorAll('.it-btn-header')[0];
            if (!btn) return false;
            btn.click();
            return true;
          })()`);
          console.log('SALES_QUOTATION_MODAL: ' + opened);
          await sleep(1200);
          await typeInto('input[placeholder="Search products..."]', 'MS Flat');
          await sleep(2500);
          const picked = await evalJs(`(() => {
            const opts = Array.from(document.querySelectorAll('.qtn-product-item'));
            const el = opts.find((b) => b.textContent.includes('MS Flat Bar 25x3 mm'));
            if (!el) return { ok: false, count: opts.length };
            el.click();
            return { ok: true };
          })()`);
          console.log('SALES_QUOTATION_PRODUCT: ' + JSON.stringify(picked));
          await sleep(800);
        }

        // ---- PR-only: amount + payment mode ----
        if (m.tag === 'PR') {
          const amt = await evalJs(`(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const label = labels.find((l) => l.textContent.trim().toLowerCase().startsWith('amount'));
            const el = label ? (label.htmlFor ? document.getElementById(label.htmlFor) : label.closest('div').querySelector('input')) : null;
            if (!el) return false;
            const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            s.call(el, '25000');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          })()`);
          const mode = await evalJs(`(() => {
            const sel = Array.from(document.querySelectorAll('select')).find((s) => Array.from(s.options).some((o) => o.value === 'Bank Transfer'));
            if (!sel) return false;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
            setter.call(sel, 'Bank Transfer');
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          })()`);
          console.log('SALES_PR_AMOUNT: ' + amt + ' MODE: ' + mode);
        }

        // ---- CN-only: reason + reason detail ----
        if (m.tag === 'CN') {
          const reason = await evalJs(`(() => {
            const label = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim().toLowerCase().startsWith('reason'));
            const el = label ? (label.htmlFor ? document.getElementById(label.htmlFor) : label.closest('div').querySelector('select')) : null;
            if (!el) return false;
            const firstVal = Array.from(el.options).find((o) => o.value !== '');
            if (!firstVal) return false;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
            setter.call(el, firstVal.value);
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          })()`);
          const detail = await setPlain('textarea[placeholder*="reason" i]', 'AUDIT_CN_REASON');
          console.log('SALES_CN_REASON: ' + reason + ' DETAIL: ' + detail);
        }

        // ---- Pre-save state dump ----
        const pre = await evalJs(`(() => {
          const client = document.querySelector('input[aria-label="Client"], input[aria-label="Customer"], input[aria-label="Select Customer"]');
          const rows = Array.from(document.querySelectorAll('tbody tr')).length;
          const itemRows = Array.from(document.querySelectorAll('.item-table-row, tbody tr')).length;
          return { clientVal: client ? client.value : null, itemRows };
        })()`);
        console.log(`SALES_${m.tag}_PRE: ${JSON.stringify(pre)}`);

        // ---- Save (primary button) ----
        await sleep(600);
        const saved = await clickPrimary();
        console.log(`SALES_${m.tag}_SAVE: ${saved}`);
        await sleep(1200);
        const t1 = await evalJs(`(() => ({ path: location.pathname, toasts: Array.from(document.querySelectorAll('[class*="toast"]')).map((t) => t.textContent.trim()) }))()`);
        console.log(`SALES_${m.tag}_T1: ${JSON.stringify(t1)}`);
        await sleep(2500);
        const t2 = await evalJs(`(() => ({ path: location.pathname, toasts: Array.from(document.querySelectorAll('[class*="toast"]')).map((t) => t.textContent.trim()) }))()`);
        console.log(`SALES_${m.tag}_T2: ${JSON.stringify(t2)}`);
        await sleep(3000);
        const after = await evalJs(`(() => ({ path: location.pathname, toasts: Array.from(document.querySelectorAll('button[aria-label="Dismiss"]')).map((b) => b.closest('div').textContent.trim().slice(0, 120)) }))()`);
        console.log(`SALES_${m.tag}_AFTER: ${JSON.stringify(after)}`);
        const cap = await evalJs(`(() => window.__cap || [])()`);
        console.log(`SALES_${m.tag}_POSTS: ${JSON.stringify(cap)}`);

        // ---- API verify ----
        const list = await evalJs(`(async () => {
          const token = localStorage.getItem('authToken') || '';
          const res = await fetch('/v1' + ${JSON.stringify(m.api)} + '?page=0&size=5&sort=createdAt,desc', { headers: { Authorization: 'Bearer ' + token } });
          let body = null;
          try { body = await res.json(); } catch (e) {}
          const arr = Array.isArray(body) ? body : (body && body.content) || (body && body.data && body.data.content) || (body && body.data) || [];
          return { status: res.status, rows: arr.slice(0, 3).map((r) => ({ id: r.id, no: r.quotationNo || r.scNo || r.soNo || r.dcNo || r.piNo || r.invoiceNo || r.receiptNo || r.cnNo || '', client: r.clientName || r.customerName || r.deliveredTo || r.receivedFrom || '' })) };
        })()`);
        console.log(`SALES_${m.tag}_API: ${JSON.stringify(list)}`);
      } catch (e) {
        console.log(`SALES_${m.tag}_ERROR: ${e.message}`);
      }
    }
    console.log('SALES_AUDIT_DONE');
  }
};
