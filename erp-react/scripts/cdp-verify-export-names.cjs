/* Sign in, then trigger the three quotation bulk exports and capture download filenames + file bytes */
const path = require('node:path');
// Downloads land in <repo>/evidence (git-ignored) instead of a machine-specific
// absolute folder, so the script works from any checkout on any laptop.
const evidenceDir = path.join(__dirname, '..', 'evidence');
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const log = (k, v) => console.log(`${k}: ${JSON.stringify(v)}`);
    const errors = [];
    const downloads = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    cdp.on('Browser.downloadWillBegin', (p) =>
      downloads.push({ name: p.suggestedFilename, guid: p.guid }));
    await cdp.send('Runtime.enable');
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: evidenceDir,
      eventsEnabled: true
    });

    // ---- Sign in ----
    await navigate('http://localhost:5173/signin');
    await waitFor(`document.querySelector('input[type=\"email\"], input[name=\"email\"], input[placeholder*=\"Email\" i]') !== null`);
    await sleep(500);
    await evalJs(`(() => {
      const setVal = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const email = document.querySelector('input[type="email"], input[name="email"], input[placeholder*="Email" i]');
      const pass = document.querySelector('input[type="password"], input[name="password"], input[placeholder*="Password" i]');
      if (email) setVal(email, 'admin@vishaktech.com');
      if (pass) setVal(pass, 'Admin@123');
      return { email: !!email, pass: !!pass };
    })()`);
    await sleep(400);
    const submitClicked = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /sign\\s*in/i.test(b.textContent || ''));
      if (btn) { btn.click(); return true; }
      return false;
    })()`);
    log('SIGNIN', { submitClicked });
    await waitFor(`location.pathname !== '/signin'`, 20000);
    await sleep(2500);

    // ---- Quotations list ----
    await navigate('http://localhost:5173/quotations');
    await waitFor(`document.querySelector('.qpo-table tbody') !== null`);
    await sleep(1500);

    // Select the first row
    await evalJs(`(() => {
      const box = document.querySelector('.qpo-table tbody input[type="checkbox"]');
      if (box) box.click();
      return !!box;
    })()`);
    await sleep(800);

    const qtnNo = await evalJs(`(() => {
      const row = document.querySelector('.qpo-table tbody tr');
      return row ? (row.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120) : 'N/A';
    })()`);
    log('SELECTED_ROW', { qtnNo });

    const runExport = async (label) => {
      const before = downloads.length;
      await evalJs(`(() => {
        const bulkBar = document.querySelector('.qpo-bulk-bar.visible');
        const btn = [...bulkBar.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Export'));
        if (btn) btn.click();
        return true;
      })()`);
      await sleep(500);
      const clicked = await evalJs(`(() => {
        const bulkBar = document.querySelector('.qpo-bulk-bar.visible');
        const menu = bulkBar ? bulkBar.querySelector('[class*="export-menu"]') : null;
        if (!menu) return false;
        const item = [...menu.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === ${JSON.stringify(label)});
        if (item) { item.click(); return true; }
        return false;
      })()`);
      await sleep(4000);
      const got = downloads.slice(before);
      log(`EXPORT_${label.replace(/[^A-Za-z]/g, '_').toUpperCase()}`, { clicked, downloaded: got.map((d) => d.name) });
    };

    await runExport('Export to CSV');
    await runExport('Export to Excel');
    await runExport('Export to PDF');

    log('CONSOLE_ERRORS', errors);
    console.log('CDP_SCRIPT_DONE');
  }
};
