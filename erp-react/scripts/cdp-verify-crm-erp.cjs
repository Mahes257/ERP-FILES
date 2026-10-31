/* Verify the rebuilt CRM list pages (Clients / Leads / Follow-ups) match the
   ERP layout: breadcrumb, header, KPI grid, segmented control, toolbar,
   filter panel, bulk bar, ERP table columns — all with real backend data. */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const errors = [];
    const badResponses = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 220)));
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        errors.push('CONSOLE: ' + (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 220));
      }
    });
    cdp.on('Network.responseReceived', (p) => {
      if (p.response && p.response.status >= 400 && !/favicon|\.js$|\.css$|sourcemap/i.test(p.response.url || '')) {
        badResponses.push(p.response.status + ' ' + (p.response.url || '').slice(0, 160));
      }
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const results = [];
    const check = (name, ok, detail = '') => {
      results.push({ name, ok, detail });
      console.log((ok ? 'PASS | ' : 'FAIL | ') + name + (detail ? '  ==> ' + detail : ''));
    };

    // ---- Sign in via the real UI ----
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
      return { email: !!email, pass: !!pass };
    })()`);
    await sleep(400);
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /sign\\s*in/i.test(b.textContent || ''));
      if (btn) btn.click();
      return !!btn;
    })()`);
    await waitFor(`location.pathname !== '/signin'`, 20000);
    await sleep(2500);

    // ---- /clients ----
    await navigate('http://localhost:5173/clients');
    await sleep(3000);
    let st = await evalJs(`(() => ({
      path: location.pathname,
      h1: (document.querySelector('h1')?.textContent || '').trim().slice(0, 40),
      breadcrumb: (document.querySelector('.crm-erp-breadcrumb')?.textContent || '').replace(/\\s+/g, ' ').trim(),
      kpiLabels: [...document.querySelectorAll('.crm-erp-kpi-card .crm-erp-kpi-label')].map((e) => e.textContent.trim()),
      kpiValues: [...document.querySelectorAll('.crm-erp-kpi-card .crm-erp-kpi-value')].map((e) => e.textContent.trim()),
      headers: [...document.querySelectorAll('.crm-erp-table-card thead th')].map((e) => e.textContent.trim().replace(/[\\u25B2\\u25BC]/g, '').trim()),
      seg: [...document.querySelectorAll('.crm-erp-seg-option')].map((e) => e.textContent.trim()),
      tab: (document.querySelector('.crm-erp-tab')?.textContent || '').replace(/\\s+/g, ' ').trim(),
      rows: document.querySelectorAll('.crm-erp-table-card tbody tr').length,
      toolbar: !!document.querySelector('.crm-erp-toolbar'),
      search: !!document.querySelector('.crm-erp-search input'),
      showFilters: [...document.querySelectorAll('.crm-erp-toolbar button')].some((b) => /Show Filters/i.test(b.textContent || '')),
      errBanner: !!document.querySelector('.crm-erp-error-banner')
    }))()`);
    const expClientCols = ['Client Code', 'Business Name', 'Contact Person', 'Phone', 'Email', 'Industry', 'Last Follow-up', 'Next Follow-up', 'Status', 'Actions'];
    check('CLIENTS title = Your Clients', st.h1 === 'Your Clients', st.h1);
    check('CLIENTS breadcrumb Dashboard>Sales>Clients', /Clients/.test(st.breadcrumb) && /Sales/.test(st.breadcrumb), st.breadcrumb);
    check('CLIENTS has 7 ERP KPI cards', st.kpiLabels.length === 7, JSON.stringify(st.kpiLabels));
    check('CLIENTS KPI labels match ERP', JSON.stringify(st.kpiLabels) === JSON.stringify(['Total Clients', 'Prospects', 'Active Clients', 'Open Quotations', 'Purchase Requests', 'Pending Payments', 'Revenue']), JSON.stringify(st.kpiLabels));
    check('CLIENTS KPI values are real (non-empty)', st.kpiValues.every((v) => v !== '0' && v !== ''), JSON.stringify(st.kpiValues));
    check('CLIENTS table headers match ERP (checkbox + 10 ERP columns)', JSON.stringify(st.headers) === JSON.stringify(['', ...expClientCols]), JSON.stringify(st.headers));
    check('CLIENTS segmented Active/Archived/Deleted', JSON.stringify(st.seg.map((s) => s.replace(/\d+$/, ''))) === JSON.stringify(['Active', 'Archived', 'Deleted']), JSON.stringify(st.seg));
    check('CLIENTS toolbar (Show Filters + search)', st.toolbar && st.search && st.showFilters, JSON.stringify(st));
    check('CLIENTS table has backend rows', st.rows > 0, 'rows=' + st.rows);
    check('CLIENTS no error banner', !st.errBanner);

    // Filter panel opens with ERP fields
    await evalJs(`[...document.querySelectorAll('.crm-erp-toolbar button')].find((b) => /Show Filters/i.test(b.textContent || ''))?.click()`);
    await sleep(600);
    const filterLabels = await evalJs(`[...document.querySelectorAll('.crm-erp-filter-panel .crm-erp-filter-label')].map((e) => e.textContent.trim())`);
    check('CLIENTS filter panel = ERP fields (Status/Industry/Sales Person/Date From/Date To)',
      JSON.stringify(filterLabels) === JSON.stringify(['Status', 'Industry', 'Sales Person', 'Date From', 'Date To']), JSON.stringify(filterLabels));
    await evalJs(`document.querySelector('.crm-erp-filter-panel.show') ? [...document.querySelectorAll('.crm-erp-toolbar button')].find((b) => /Show Filters/i.test(b.textContent || ''))?.click() : null`);
    await sleep(400);

    // Select a row → bulk bar appears
    await evalJs(`(() => {
      const cb = document.querySelector('.crm-erp-table-card tbody tr input[type="checkbox"]');
      if (cb) cb.click();
      return !!cb;
    })()`);
    await sleep(500);
    const bulk = await evalJs(`(() => ({
      visible: !!document.querySelector('.crm-erp-bulk-bar.visible'),
      text: (document.querySelector('.crm-erp-bulk-bar')?.textContent || '').replace(/\\s+/g, ' ').trim()
    }))()`);
    check('CLIENTS bulk bar appears with Export/Archive', bulk.visible && /Export/.test(bulk.text), bulk.text);
    await evalJs(`document.querySelector('.crm-erp-bulk-bar.visible tbody, .crm-erp-bulk-bar.visible') ? [...document.querySelectorAll('.crm-erp-table-card tbody tr input[type="checkbox"]')].forEach((cb) => { if (cb.checked) cb.click(); }) : null`);
    await sleep(300);

    // ---- /leads ----
    await navigate('http://localhost:5173/leads');
    await sleep(3000);
    st = await evalJs(`(() => ({
      path: location.pathname,
      h1: (document.querySelector('h1')?.textContent || '').trim().slice(0, 40),
      kpiLabels: [...document.querySelectorAll('.crm-erp-kpi-card .crm-erp-kpi-label')].map((e) => e.textContent.trim()),
      headers: [...document.querySelectorAll('.crm-erp-table-card thead th')].map((e) => e.textContent.trim().replace(/[\\u25B2\\u25BC]/g, '').trim()),
      rows: document.querySelectorAll('.crm-erp-table-card tbody tr').length,
      upload: !!document.querySelector('.crm-erp-header-actions'),
      errBanner: !!document.querySelector('.crm-erp-error-banner')
    }))()`);
    const expLeadCols = ['Lead No', 'Business Name', 'Contact Person', 'Phone', 'Email', 'Industry', 'Lead Source', 'Stage', 'Owner', 'Priority', 'Expected Value', 'Last Follow-up', 'Next Follow-up', 'Status', 'Actions'];
    check('LEADS title = Your Leads', st.h1 === 'Your Leads', st.h1);
    check('LEADS has 8 ERP KPI cards', st.kpiLabels.length === 8, JSON.stringify(st.kpiLabels));
    check('LEADS KPI labels match ERP', JSON.stringify(st.kpiLabels) === JSON.stringify(['Total Leads', 'New', 'Qualified', 'Proposal Sent', 'Won', 'Lost', "Today's Follow-ups", 'Overdue Follow-ups']), JSON.stringify(st.kpiLabels));
    check('LEADS 15 ERP columns (checkbox + 15 ERP columns)', JSON.stringify(st.headers) === JSON.stringify(['', ...expLeadCols]), JSON.stringify(st.headers));
    check('LEADS table has backend rows', st.rows > 0, 'rows=' + st.rows);
    check('LEADS no error banner', !st.errBanner);

    // Row action menu contains the real modals' actions
    await evalJs(`document.querySelector('.crm-erp-table-card tbody tr .crm-erp-row-actions-btn')?.click()`);
    await sleep(600);
    const rowActions = await evalJs(`[...document.querySelectorAll('.crm-erp-row-actions-menu .crm-erp-row-action-item')].map((e) => e.textContent.trim())`);
    check('LEADS row actions include Assign Owner + Change Stage',
      rowActions.includes('Assign Owner') && rowActions.includes('Change Stage') && rowActions.includes('View Lead'),
      JSON.stringify(rowActions));
    await evalJs(`document.querySelector('.crm-erp-row-actions-menu') ? [...document.querySelectorAll('button')].find((b) => /View Lead/i.test(b.textContent || ''))?.click() : null`);
    await sleep(800);
    const viewModal = await evalJs(`!!document.querySelector('.crm-erp-page') && [...document.querySelectorAll('.fixed, [class*="modal"]')].some((e) => e.offsetHeight > 100 && /lead|view|detail/i.test((e.textContent || '').slice(0, 200)))`);
    check('LEADS view modal opens', viewModal);
    await evalJs(`document.body.click()`);
    await sleep(300);

    // ---- /followups ----
    await navigate('http://localhost:5173/followups');
    await sleep(3000);
    st = await evalJs(`(() => ({
      path: location.pathname,
      h1: (document.querySelector('h1')?.textContent || '').trim().slice(0, 40),
      kpiLabels: [...document.querySelectorAll('.crm-erp-kpi-card .crm-erp-kpi-label')].map((e) => e.textContent.trim()),
      headers: [...document.querySelectorAll('.crm-erp-table-card thead th')].map((e) => e.textContent.trim().replace(/[\\u25B2\\u25BC]/g, '').trim()),
      rows: document.querySelectorAll('.crm-erp-table-card tbody tr').length,
      errBanner: !!document.querySelector('.crm-erp-error-banner')
    }))()`);
    const expFuCols = ['Date', 'Time', 'Lead / Client No', 'Customer', 'Lead Stage', 'Last Follow-up', 'Remarks', 'Mode', 'Priority', 'Status', 'Actions'];
    check('FOLLOWUPS title = Follow-ups', st.h1 === 'Follow-ups', st.h1);
    check('FOLLOWUPS has 6 ERP KPI cards', st.kpiLabels.length === 6, JSON.stringify(st.kpiLabels));
    check('FOLLOWUPS KPI labels match ERP', JSON.stringify(st.kpiLabels) === JSON.stringify(['Total Follow-ups', "Today's Follow-ups", 'Upcoming', 'Overdue', 'Completed', 'High Priority']), JSON.stringify(st.kpiLabels));
    check('FOLLOWUPS 11 ERP columns (checkbox + 11 ERP columns)', JSON.stringify(st.headers) === JSON.stringify(['', ...expFuCols]), JSON.stringify(st.headers));
    check('FOLLOWUPS table has backend rows', st.rows > 0, 'rows=' + st.rows);
    check('FOLLOWUPS no error banner', !st.errBanner);

    // ---- Regression: Contacts (shared CrmPage untouched) ----
    await navigate('http://localhost:5173/contacts');
    await sleep(2500);
    const contacts = await evalJs(`(() => ({
      h1: (document.querySelector('h1')?.textContent || '').trim().slice(0, 40),
      len: document.body.innerText.length,
      hasErrorBoundary: /something went wrong|error boundary/i.test(document.body.innerText.slice(0, 400))
    }))()`);
    check('CONTACTS regression: page still renders (CrmPage untouched)', !contacts.hasErrorBoundary && contacts.len > 150, contacts.h1 + ' len=' + contacts.len);

    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    console.log('CRM_SUMMARY: ' + JSON.stringify({ passed, failed, total: results.length }));
    console.log('CONSOLE_ERRORS: ' + errors.length + ' -> ' + errors.slice(0, 4).join(' | '));
    console.log('BAD_RESPONSES: ' + badResponses.slice(0, 6).join(' | '));
    console.log('CDP_SCRIPT_DONE');
  }
};
