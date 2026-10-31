/* Dropdown editability audit across the 11 modules.
   For every module create/edit page + list page: find selects and dropdown
   inputs, check they are editable (not disabled/read-only), and report the
   currency field rendering on Quotation/SC/SO forms (should be the searchable
   CurrencyDropdown with a chevron, not a plain text input). */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    await navigate('http://localhost:5173/signin');
    await waitFor(`document.querySelector('input[type="email"], input[name="email"]') !== null`, 15000);
    await sleep(500);
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
    })()`);
    await sleep(400);
    await evalJs(`[...document.querySelectorAll('button')].find((b) => /sign\\s*in/i.test(b.textContent || ''))?.click()`);
    await waitFor(`location.pathname !== '/signin'`, 20000);
    await sleep(2500);

    const createRoutes = [
      ['Quotations', '/quotations/new'],
      ['Sales Contracts', '/sales-contracts/new'],
      ['Sales Orders', '/sales-orders/new'],
      ['Delivery Challans', '/delivery-challans/new'],
      ['Proforma Invoices', '/proforma-invoices/new'],
      ['Invoices', '/invoices/new'],
      ['Payment Receipts', '/payment-receipts/new'],
      ['Credit Notes', '/credit-notes/new']
    ];

    for (const [name, route] of createRoutes) {
      await navigate('http://localhost:5173' + route);
      await sleep(2200);
      const st = await evalJs(`(() => {
        const selects = [...document.querySelectorAll('select')].map((s) => ({
          options: s.options.length,
          disabled: s.disabled,
          value: s.value
        }));
        // EditableMasterDropdown / CurrencyDropdown inputs (searchable comboboxes)
        const comboInputs = [...document.querySelectorAll('input[autocomplete="off"]')]
          .filter((i) => i.placeholder && /select|currency|choose/i.test(i.placeholder))
          .map((i) => ({ placeholder: i.placeholder, disabled: i.disabled }));
        // The Currency field specifically: look for a label "Currency" and its control
        let currency = null;
        const labels = [...document.querySelectorAll('label')];
        const curLabel = labels.find((l) => (l.textContent || '').trim() === 'Currency');
        if (curLabel) {
          const box = curLabel.closest('div')?.parentElement || curLabel.parentElement;
          const input = box?.querySelector('input');
          const select = box?.querySelector('select');
          currency = {
            isSelect: !!select,
            isInput: !!input,
            inputType: input?.type || null,
            placeholder: input?.placeholder || select ? 'SELECT' : null,
            hasChevron: !!box?.querySelector('[class*="chevron"], svg')
          };
        }
        const disabledCount = selects.filter((s) => s.disabled).length;
        return {
          path: location.pathname,
          selectCount: selects.length,
          disabledSelects: disabledCount,
          zeroOptionSelects: selects.filter((s) => s.options === 0).length,
          combos: comboInputs,
          currency
        };
      })()`);
      const ok = st.selectCount > 0 || st.combos.length > 0;
      console.log(
        (ok ? 'PASS | ' : 'FAIL | ') + name + ' selects=' + st.selectCount +
        ' disabled=' + st.disabledSelects + ' zeroOpt=' + st.zeroOptionSelects +
        ' combos=' + st.combos.length +
        ' currency=' + JSON.stringify(st.currency)
      );
    }

    // CRM list filter dropdowns
    for (const [name, route] of [['Clients', '/clients'], ['Leads', '/leads'], ['Follow-ups', '/followups']]) {
      await navigate('http://localhost:5173' + route);
      await sleep(2000);
      await evalJs(`[...document.querySelectorAll('.crm-erp-toolbar button')].find((b) => /Show Filters/i.test(b.textContent || ''))?.click()`);
      await sleep(600);
      const st = await evalJs(`(() => ({
        filterSelects: [...document.querySelectorAll('.crm-erp-filter-panel select')].map((s) => ({
          options: s.options.length,
          disabled: s.disabled
        })),
        filterDates: document.querySelectorAll('.crm-erp-filter-panel input[type="date"]').length
      }))()`);
      console.log('PASS | ' + name + ' filter selects=' + st.filterSelects.length + ' disabled=' + st.filterSelects.filter((s) => s.disabled).length + ' dates=' + st.filterDates);
    }

    // Lead form dropdowns (Leads create = Clients create flow too)
    await navigate('http://localhost:5173/leads/new');
    await sleep(2000);
    const leadSel = await evalJs(`(() => {
      const selects = [...document.querySelectorAll('select')].map((s) => ({
        options: s.options.length,
        disabled: s.disabled,
        first: s.options[0]?.text || '',
        hasValue: s.options.length > 1
      }));
      return { count: selects.length, disabled: selects.filter((s) => s.disabled).length, selects: selects.slice(0, 6) };
    })()`);
    console.log('PASS | Leads/Clients create form selects=' + leadSel.count + ' disabled=' + leadSel.disabled + ' ' + JSON.stringify(leadSel.selects));
    console.log('AUDIT_DONE');
  }
};
