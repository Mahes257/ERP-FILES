/* Trigger bulk (selected-quotation) export options and confirm downloads begin */
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
    cdp.on('Browser.downloadWillBegin', (p) => downloads.push({ suggestedFilename: p.suggestedFilename, guid: p.guid }));
    cdp.on('Page.downloadProgress', (p) => downloads.push({ progress: p.state, guid: p.guid }));
    await cdp.send('Runtime.enable');
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: evidenceDir });
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: evidenceDir, eventsEnabled: true });

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

    const runExport = async (label) => {
      // Open bulk Export menu
      await evalJs(`(() => {
        const bulkBar = document.querySelector('.qpo-bulk-bar.visible');
        const btn = [...bulkBar.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Export'));
        if (btn) btn.click();
        return true;
      })()`);
      await sleep(500);
      // Click the menu item whose label matches
      const clicked = await evalJs(`(() => {
        const bulkBar = document.querySelector('.qpo-bulk-bar.visible');
        const menu = bulkBar ? bulkBar.querySelector('[class*="export-menu"]') : null;
        if (!menu) return false;
        const item = [...menu.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === ${JSON.stringify(label)});
        if (item) { item.click(); return true; }
        return false;
      })()`);
      await sleep(4000);
      log(`EXPORT_${label.replace(/[^A-Za-z]/g, '_').toUpperCase()}`, { clicked, downloads: downloads.length });
    };

    await runExport('Export to CSV');
    await runExport('Export to Excel');
    await runExport('Export to PDF');

    log('CONSOLE_ERRORS', errors);
    return {};
  }
};
