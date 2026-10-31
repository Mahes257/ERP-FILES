/*
 * VERIFY THE NEW SALES NAVIGATION TREE IN THE BROWSER.
 *
 * Usage: node cdp-driver.cjs 9222 scripts/cdp-verify-sales-tree.cjs
 *
 * The dev server is expected on http://localhost:5173 (override with BASE env).
 * Checks, in order:
 *   1. SALES is a static heading (no toggle, no chevron).
 *   2. Exact hierarchy + exact labels of the SALES tree.
 *   3. No duplicate / missing / extra items; no forbidden labels.
 *   4. Independent open/close of CRM, CPR, Sales Execution, Customer Purchase Order.
 *   5. Opening one branch does NOT toggle another; SALES heading is inert.
 *   6. Active routes auto-reveal their ancestor chain.
 */
const BASE = process.env.BASE || 'http://localhost:5173';

module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor, shot } = helpers;
    const log = (k, v) => console.log(k + ': ' + JSON.stringify(v));
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');

    // ---------- Login ----------
    await navigate(BASE + '/signin');
    await waitFor(`document.querySelector('input[type="email"], input[name="email"]') !== null`);
    await sleep(400);
    await evalJs(`(() => {
      const setVal = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const email = document.querySelector('input[type="email"], input[name="email"]');
      const pass = document.querySelector('input[type="password"]');
      if (email) setVal(email, 'admin@vishaktech.com');
      if (pass) setVal(pass, 'Admin@123');
      return true;
    })()`);
    await sleep(300);
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /sign\\s*in/i.test(b.textContent || ''));
      if (btn) btn.click();
      return !!btn;
    })()`);
    await waitFor(`location.pathname !== '/signin'`, 30000);
    await sleep(2500);

    // ---------- 1: SALES is a static heading ----------
    const salesHeading = await evalJs(`(() => {
      const h = document.querySelector('.sb-sales-heading');
      if (!h) return 'NO_HEADING';
      const label = (h.textContent || '').replace(/\\s+/g, ' ').trim();
      const isButton = !!h.querySelector('button');
      const hasChevron = !!h.querySelector('.sb-group-chevron');
      return { label, isButton, hasChevron };
    })()`);
    log('SALES_HEADING', salesHeading);

    // ---------- 2+3: structure, labels, duplicates ----------
    const tree = await evalJs(`(() => {
      const rows = [];
      const walk = (el, depth) => {
        for (const child of el.children) {
          if (child.classList && child.classList.contains('sb-group')) {
            const btn = child.querySelector('.sb-nav-item');
            const open = child.getAttribute('data-open');
            rows.push({ depth, kind: 'group', label: (btn.textContent || '').replace(/\\s+/g, ' ').trim(), open });
            const inner = child.querySelector('.sb-group-children-inner');
            if (inner) walk(inner, depth + 1);
          } else if (child.classList && child.classList.contains('sb-subitem')) {
            rows.push({ depth, kind: 'leaf', label: (child.textContent || '').replace(/\\s+/g, ' ').trim() });
          } else if (child.children && child.children.length) {
            walk(child, depth);
          }
        }
      };
      const root = document.querySelector('.sb-sales-tree');
      if (!root) return 'NO_SALES_TREE';
      walk(root, 0);
      return rows;
    })()`);
    log('TREE', tree);

    const labels = tree === 'NO_SALES_TREE'
      ? []
      : tree.map((r) => r.label.replace(/\s*\(\d+\)\s*$/, '').replace(/\d+$/, '').trim());
    const forbidden = ['Customer Purchase Orders', 'CPO'];
    const forbidHits = labels.filter((l) => forbidden.includes(l));
    const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
    const wanted = [
      'CRM',
      'Leads', 'Clients', 'Follow-ups',
      'CPR (Customer Purchase Request)',
      'CPR', 'Cost Workout (CW)', 'Profit Workout', 'CPR Reports',
      'Sales Execution',
      'Quotations', 'Sales Contracts', 'Customer Purchase Order',
      'CPO List', 'Production Tracker', 'QC', 'Packing List',
      'Delivery Challans', 'Proforma Invoices', 'Invoices', 'Credit Notes', 'Payment Receipts'
    ];
    const missing = wanted.filter((w) => !labels.includes(w));
    const extra = labels.filter((l) => !wanted.includes(l));
    log('LABELS_CHECK', { forbiddenHits: forbidHits, duplicates: dupes, missing, extra });

    // Verify CPO children are nested under "Customer Purchase Order" (inside Sales Execution)
    const cpoNesting = await evalJs(`(() => {
      const cpoGroup = [...document.querySelectorAll('.sb-group')].find((g) =>
        (g.querySelector('.sb-nav-item')?.textContent || '').trim().startsWith('Customer Purchase Order'));
      if (!cpoGroup) return 'NO_CPO_GROUP';
      const directChildren = [...cpoGroup.querySelector('.sb-group-children').children[0].children]
        .map((el) => ((el.querySelector('.sb-subitem-label')?.textContent || el.querySelector('.sb-nav-item')?.textContent || '')).trim());
      const parentGroup = cpoGroup.parentElement.closest('.sb-group');
      const parentLabel = parentGroup ? (parentGroup.querySelector('.sb-nav-item')?.textContent || '').trim() : '';
      const salesExecChild = parentLabel.startsWith('Sales Execution');
      const cpoIsDirectSalesChild = (() => {
        const salesTree = document.querySelector('.sb-sales-tree');
        return [...salesTree.children].some(
          (el) => (el.querySelector('.sb-nav-item')?.textContent || '').trim().startsWith('Customer Purchase Order'));
      })();
      return { directChildren, cpoParentLabel: parentLabel, cpoInsideSalesExecution: salesExecChild, cpoIsDirectSalesChild };
    })()`);
    log('CPO_NESTING', cpoNesting);

    // Visual indentation: "Customer Purchase Order" must sit BELOW/INSIDE
    // Sales Execution — indented like its subitem siblings, not beside it.
    const indent = await evalJs(`(() => {
      const grp = (label) => {
        const g = [...document.querySelectorAll('.sb-group')].find((x) =>
          (x.querySelector('.sb-nav-item')?.textContent || '').trim().startsWith(label));
        const btn = g ? g.querySelector('.sb-nav-item') : null;
        return btn ? btn.getBoundingClientRect().left : null;
      };
      const sub = (label) => {
        const s = [...document.querySelectorAll('.sb-subitem')].find((x) =>
          (x.textContent || '').trim().startsWith(label));
        return s ? s.getBoundingClientRect().left : null;
      };
      const salesExecLeft = grp('Sales Execution');
      const quotationsLeft = sub('Quotations');
      const cpoLeft = grp('Customer Purchase Order');
      const deliveryLeft = sub('Delivery Challans');
      return {
        salesExecLeft, quotationsLeft, cpoLeft, deliveryLeft,
        cpoIndentedUnderSalesExec: cpoLeft > salesExecLeft,
        cpoAlignedWithSubitems: Math.abs(cpoLeft - quotationsLeft) < 2,
        cpoAboveDelivery: cpoLeft === deliveryLeft
      };
    })()`);
    log('CPO_INDENT', indent);

    await shot('salesnav-new-tree');

    // ---------- 4+5: independent open/close ----------
    const toggle = async (label) => {
      await evalJs(`(() => {
        const g = [...document.querySelectorAll('.sb-group')].find((x) =>
          (x.querySelector('.sb-nav-item')?.textContent || '').trim().startsWith(${JSON.stringify(label)}));
        if (!g) return false;
        g.querySelector('.sb-nav-item').click();
        return true;
      })()`);
      await sleep(350);
    };
    const clickHeading = async () => {
      await evalJs(`(() => {
        const h = document.querySelector('.sb-sales-heading');
        if (!h) return false;
        h.click();
        return true;
      })()`);
      await sleep(350);
    };
    const states = async () => evalJs(`(() => {
      const out = {};
      for (const key of ['sb-crm', 'sb-sales-cpr', 'sb-sales-execution', 'sb-cpo']) {
        const el = document.getElementById(key);
        out[key] = el ? el.closest('.sb-group').getAttribute('data-open') : 'missing';
      }
      return out;
    })()`);

    await navigate(BASE + '/quotations');
    await sleep(1200);
    log('TOGGLE_START', await states());

    await toggle('CRM');
    log('AFTER_CRM_TOGGLE', await states());
    await toggle('CRM');
    await toggle('CPR (Customer Purchase Request)');
    log('AFTER_CPR_TOGGLE', await states());
    await toggle('CPR (Customer Purchase Request)');
    await toggle('Sales Execution');
    log('AFTER_SALES_EXEC_TOGGLE', await states());
    await toggle('Sales Execution');
    await toggle('Customer Purchase Order');
    log('AFTER_CPO_TOGGLE', await states());
    await toggle('Customer Purchase Order');
    log('AFTER_CPO_REOPEN', await states());

    // SALES heading must be inert: click it, nothing may change.
    await clickHeading();
    log('AFTER_SALES_HEADING_CLICK', await states());

    // Mixed state example: CRM open, CPR closed, SalesExec open, CPO closed
    const setMixed = async () => {
      await navigate(BASE + '/quotations');
      await sleep(1000);
      await toggle('CPR (Customer Purchase Request)');
      await toggle('Customer Purchase Order');
    };
    await setMixed();
    log('MIXED_A', await states());
    await toggle('CPR (Customer Purchase Request)');
    log('MIXED_A_AFTER_CPR_OPEN', await states());
    await toggle('Sales Execution');
    log('MIXED_A_AFTER_SALES_EXEC_COLLAPSE', await states());

    // ---------- 6: active route reveals parents ----------
    const activeCheck = async (path) => {
      await navigate(BASE + path);
      await sleep(1200);
      return evalJs(`(() => {
        const active = document.querySelector('.sb-subitem.is-active');
        const state = {};
        for (const key of ['sb-crm', 'sb-sales-cpr', 'sb-sales-execution', 'sb-cpo']) {
          const el = document.getElementById(key);
          state[key] = el ? el.closest('.sb-group').getAttribute('data-open') : 'missing';
        }
        return { path: location.pathname, activeLeaf: active ? active.textContent.trim().replace(/\\d+$/, '') : null, state };
      })()`);
    };

    log('ACTIVE_LEADS', await activeCheck('/leads'));
    log('ACTIVE_CPR', await activeCheck('/cprs'));
    log('ACTIVE_COSTWORKOUT', await activeCheck('/cost-workouts'));
    log('ACTIVE_CPRREPORTS', await activeCheck('/cprs/reports'));
    log('ACTIVE_QUOTATIONS', await activeCheck('/quotations'));
    log('ACTIVE_CPOLIST', await activeCheck('/sales-orders/cpo-list'));
    log('ACTIVE_PRODTRACK', await activeCheck('/sales-orders/production-tracker'));
    log('ACTIVE_QC', await activeCheck('/sales-orders/qc'));
    log('ACTIVE_PACKING', await activeCheck('/sales-orders/packing-list'));
    log('ACTIVE_PROFORMA', await activeCheck('/proforma-invoices'));
    log('ACTIVE_INVOICES', await activeCheck('/invoices'));
    log('ACTIVE_DELIVERY', await activeCheck('/delivery-challans'));
    log('ACTIVE_CREDITNOTES', await activeCheck('/credit-notes'));
    log('ACTIVE_PAYRECEIPTS', await activeCheck('/payment-receipts'));

    log('CONSOLE_ERRORS', errors);
    console.log('CDP_SCRIPT_DONE');
  }
};
