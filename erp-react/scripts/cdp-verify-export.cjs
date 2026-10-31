/* CDP verification of the Quotation Export fix (single Export menu + Edit PDF).
 * Usage: node scripts/cdp-driver.cjs 9222 scripts/cdp-verify-export.cjs
 * Requires: headless Chrome on :9222 (see cdp-driver.cjs) and the dev server.
 */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs, shot } = helpers;
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry?.level === 'error') errors.push('LOG: ' + p.entry.text);
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    await navigate('http://localhost:5173/quotations');

    // ----- Login if redirected -----
    const onSignin = await evalJs(`location.pathname.startsWith('/signin')`);
    if (onSignin) {
      await waitFor(`document.querySelector('input[type="email"]')`);
      await evalJs(`(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const email = document.querySelector('input[type="email"]');
        const pwd = document.querySelector('input[type="password"]');
        setter.call(email, 'admin@vishaktech.com');
        email.dispatchEvent(new Event('input', { bubbles: true }));
        setter.call(pwd, 'Admin@123');
        pwd.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await sleep(300);
      await evalJs(`document.querySelector('button[type="submit"]').click()`);
      await waitFor(`!location.pathname.startsWith('/signin')`, 20000);
    }

    // ----- Wait for quotation rows -----
    await waitFor(`document.querySelectorAll('.qpo-table tbody tr').length > 0`, 30000);

    // 1. Toolbar Export buttons
    const toolbarExportCount = await evalJs(`(() =>
      Array.from(document.querySelectorAll('.qpo-toolbar-right button'))
        .filter((b) => /^Export/i.test(b.textContent.trim())).length)()`);

    // 2. Select the first row
    await evalJs(`(() => {
      const cb = document.querySelector('.qpo-table tbody tr input[type="checkbox"]');
      if (cb) cb.click();
    })()`);
    await sleep(600);

    // 3. Bulk bar: visible? how many Export buttons inside?
    const bulkInfo = await evalJs(`(() => {
      const bar = document.querySelector('.qpo-bulk-bar');
      if (!bar || !bar.classList.contains('visible')) return { visible: false };
      const btns = Array.from(bar.querySelectorAll('button'));
      return {
        visible: true,
        exportButtons: btns.filter((b) => /^Export/i.test(b.textContent.trim())).length,
        buttons: btns.map((b) => b.textContent.replace(/\\s+/g, ' ').trim())
      };
    })()`);

    // 4. Open the bulk Export menu and list items
    await evalJs(`(() => {
      const bar = document.querySelector('.qpo-bulk-bar');
      const btn = Array.from(bar.querySelectorAll('button')).find((b) => /^Export/i.test(b.textContent.trim()));
      if (btn) btn.click();
    })()`);
    await sleep(400);
    const menuItems = await evalJs(`(() => {
      const menu = document.querySelector('.qpo-bulk-bar [class*="export-menu"]');
      if (!menu) return null;
      return Array.from(menu.querySelectorAll('button')).map((b) => b.textContent.trim());
    })()`);
    await shot('quotation-export-menu');

    // 5. Open Edit PDF
    await evalJs(`(() => {
      const menu = document.querySelector('.qpo-bulk-bar [class*="export-menu"]');
      const btn = Array.from(menu.querySelectorAll('button')).find((b) => /Edit PDF/i.test(b.textContent.trim()));
      if (btn) btn.click();
    })()`);
    await waitFor(`document.body.textContent.includes('Edit Quotation PDF')`, 15000);
    await sleep(3500); // allow pdf-lib to load + count pages
    const modalInfo = await evalJs(`(() => ({
      title: document.body.textContent.includes('Edit Quotation PDF'),
      iframe: !!document.querySelector('iframe[title^="Quotation PDF preview"]'),
      pageBadge: Array.from(document.querySelectorAll('span')).map(s=>s.textContent.trim()).find((t) => /page(s)?/.test(t)) || null,
      notesPanel: !!document.querySelector('textarea')
    }))()`);
    await shot('quotation-pdf-editor');

    console.log(JSON.stringify({ toolbarExportCount, bulkInfo, menuItems, modalInfo, errors }, null, 2));
  }
};
