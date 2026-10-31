/* Verify the exact document conversion chain (browser):
 *   Proforma Invoice → Invoice → Credit Note → Payment Receipt
 * - Each list Actions menu exposes ONLY its one applicable conversion.
 * - Clicking the conversion creates a real persisted record with its OWN
 *   number/date and the source relationship, then navigates to it.
 * - Duplicate protection: re-clicking returns the existing target with the
 *   required message ("An Invoice has already been created from this
 *   Proforma Invoice." / Credit Note / Payment Receipt variants).
 * - Payment Receipts expose NO conversion.
 * - After a refresh every converted document is still persisted + linked.
 * Zero console errors.
 */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs, shot } = helpers;
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry && p.entry.level === 'error') errors.push('LOG: ' + p.entry.text);
    });

    const base = 'http://localhost:5173';
    const apiBase = base.replace('5173', '8080');
    const setVal = `(el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };`;

    // ---------- API helpers ----------
    async function apiLogin() {
      const res = await fetch(apiBase + '/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' })
      }).then((r) => r.json());
      return { Authorization: 'Bearer ' + res.data.token };
    }
    const apiGet = (h, url) => fetch(apiBase + url, { headers: h }).then((r) => r.json());

    // ---------- Browser DOM helpers ----------
    const openRowMenu = (docNo) => evalJs(`(async () => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const row = rows.find((r) => r.textContent.includes(${JSON.stringify(docNo)}));
      if (!row) return 'row-not-found';
      const btn = row.querySelector('button[aria-label="Row actions"]');
      if (!btn) return 'no-trigger';
      btn.click();
      await new Promise((r) => setTimeout(r, 500));
      return 'opened';
    })()`);

    const readMenu = () => evalJs(`(() => {
      const menu = document.querySelector('[role="menu"]');
      if (!menu) return [];
      return Array.from(menu.querySelectorAll('.am-section-heading, button[role="menuitem"]')).map((el) =>
        el.classList.contains('am-section-heading') ? 'HEADING:' + el.textContent.trim() : el.textContent.trim()
      );
    })()`);

    const clickMenuItem = (label, wait = 4000) => evalJs(`(async () => {
      const menu = document.querySelector('[role="menu"]');
      const btn = menu
        ? Array.from(menu.querySelectorAll('button[role="menuitem"]')).find((b) => b.textContent.trim() === ${JSON.stringify(label)})
        : null;
      if (!btn) return 'item-not-found';
      btn.click();
      await new Promise((r) => setTimeout(r, ${wait}));
      return 'clicked';
    })()`);

    const toastText = () => evalJs(`(() =>
      Array.from(document.querySelectorAll('div.fixed.top-4.right-4 p')).map((p) => p.textContent.trim())
    )()`);

    const searchList = (text) => evalJs(`(() => {
      const setVal = ${setVal};
      const input = document.querySelector('input[placeholder*="Search"]');
      if (!input) return 'no-search-input';
      setVal(input, ${JSON.stringify(text)});
      return 'searched';
    })()`);

    const rowVisible = (docNo) => evalJs(`(async () => {
      await new Promise((r) => setTimeout(r, 400));
      return Array.from(document.querySelectorAll('tbody tr')).some((r) => r.textContent.includes(${JSON.stringify(docNo)}));
    })()`);

    // ---------- Browser login when needed ----------
    await navigate(base + '/proforma-invoices');
    await sleep(2500);
    const needsLogin = await evalJs(`!!document.querySelector('input[type=email]')`);
    if (needsLogin) {
      await evalJs(`(() => {
        const setVal = ${setVal};
        setVal(document.querySelector('input[type=email]'), 'admin@vishaktech.com');
        setVal(document.querySelector('input[type=password]'), 'Admin@123');
        document.querySelector('button[type=submit]').click();
      })()`);
      await waitFor(`!location.href.includes('signin')`, 20000);
      await sleep(2500);
    }

    const headers = await apiLogin();
    const marker = 'Chain' + Date.now().toString().slice(-7);
    const clientName = 'Chain Test ' + marker;

    // ---------- Create the source Proforma Invoice via API ----------
    let pi = null;
    let invoice = null;
    let cn = null;
    let pr = null;
    try {
      const create = await fetch(apiBase + '/v1/proforma-invoices', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piDate: '2026-08-17',
          clientName,
          contactPerson: 'Test Contact',
          gstin: '33ABCDE1234F1Z5',
          terms: 'Chain conversion terms ' + marker,
          notes: 'Chain conversion notes ' + marker,
          taxType: 'CGST + SGST',
          items: [{ description: 'Chain Test Item', hsn: '7326', uom: 'PCS', qty: 2, rate: 1500, discountPct: 5, gstRate: 18 }]
        })
      }).then((r) => r.json());
      pi = create.data;
      console.log('CREATED_PI', JSON.stringify({ id: pi.id, piNo: pi.piNo, source: pi.source, sourceRef: pi.sourceRef }));
    } catch (err) {
      console.log('PI_CREATE_ERROR', err.message);
      return;
    }

    // ---------- 1. PI list menu ----------
    await navigate(base + '/proforma-invoices');
    await sleep(2500);
    if (!(await rowVisible(pi.piNo))) { await searchList(pi.piNo); await sleep(1500); }
    await waitFor(`Array.from(document.querySelectorAll('tbody tr')).some((r) => r.textContent.includes(${JSON.stringify(pi.piNo)}))`, 20000);
    await openRowMenu(pi.piNo);
    const piMenu = await readMenu();
    await shot('chain-pi-menu');

    // ---------- 2. Convert PI → Invoice (browser click) ----------
    await clickMenuItem('Convert to Invoice', 900);
    const invUrl = await evalJs('location.href');
    await waitFor(`location.href.includes('/invoices/')`, 15000);
    const invUrlAfter = await evalJs('location.href');
    const successPiToast = await toastText();
    const invId = (invUrlAfter.match(/\/invoices\/(\d+)/) || [])[1];
    invoice = (await apiGet(headers, '/v1/invoices/' + invId)).data;
    const piAfter = (await apiGet(headers, '/v1/proforma-invoices/' + pi.id)).data;
    await shot('chain-invoice-view');

    // ---------- 3. Invoice list menu + Convert Invoice → Credit Note ----------
    await navigate(base + '/invoices');
    await sleep(2500);
    if (!(await rowVisible(invoice.invoiceNo))) { await searchList(invoice.invoiceNo); await sleep(1500); }
    await waitFor(`Array.from(document.querySelectorAll('tbody tr')).some((r) => r.textContent.includes(${JSON.stringify(invoice.invoiceNo)}))`, 20000);
    await openRowMenu(invoice.invoiceNo);
    const invMenu = await readMenu();
    await shot('chain-invoice-menu');
    await clickMenuItem('Convert to Credit Note', 900);
    await waitFor(`location.href.includes('/credit-notes/')`, 15000);
    const cnUrlAfter = await evalJs('location.href');
    const successInvToast = await toastText();
    const cnId = (cnUrlAfter.match(/\/credit-notes\/(\d+)/) || [])[1];
    cn = (await apiGet(headers, '/v1/credit-notes/' + cnId)).data;
    const invAfter = (await apiGet(headers, '/v1/invoices/' + invoice.id)).data;
    await shot('chain-cn-view');

    // ---------- 4. CN list menu + Convert CN → Payment Receipt ----------
    await navigate(base + '/credit-notes');
    await sleep(2500);
    if (!(await rowVisible(cn.cnNo))) { await searchList(cn.cnNo); await sleep(1500); }
    await waitFor(`Array.from(document.querySelectorAll('tbody tr')).some((r) => r.textContent.includes(${JSON.stringify(cn.cnNo)}))`, 20000);
    await openRowMenu(cn.cnNo);
    const cnMenu = await readMenu();
    await shot('chain-cn-menu');
    await clickMenuItem('Convert to Payment Receipt', 900);
    await waitFor(`location.href.includes('/payment-receipts/')`, 15000);
    const prUrlAfter = await evalJs('location.href');
    const successCnToast = await toastText();
    const prId = (prUrlAfter.match(/\/payment-receipts\/(\d+)/) || [])[1];
    pr = (await apiGet(headers, '/v1/payment-receipts/' + prId)).data;
    const cnAfter = (await apiGet(headers, '/v1/credit-notes/' + cn.id)).data;
    await shot('chain-pr-view');

    // ---------- 5. Payment Receipt list menu (NO conversion) ----------
    await navigate(base + '/payment-receipts');
    await sleep(2500);
    if (!(await rowVisible(pr.receiptNo))) { await searchList(pr.receiptNo); await sleep(1500); }
    await waitFor(`Array.from(document.querySelectorAll('tbody tr')).some((r) => r.textContent.includes(${JSON.stringify(pr.receiptNo)}))`, 20000);
    await openRowMenu(pr.receiptNo);
    const prMenu = await readMenu();
    await shot('chain-pr-menu');

    // ---------- 6. Duplicate protection (re-click each conversion) ----------
    // Read toasts promptly (they auto-dismiss after 4000ms).
    const clickAndToast = async (label) => {
      await clickMenuItem(label, 900);
      return { url: await evalJs('location.href'), toast: await toastText() };
    };
    // PI → Invoice again
    await navigate(base + '/proforma-invoices');
    await sleep(2500);
    if (!(await rowVisible(pi.piNo))) { await searchList(pi.piNo); await sleep(1500); }
    await openRowMenu(pi.piNo);
    const dupPi = await clickAndToast('Convert to Invoice');

    // Invoice → Credit Note again
    await navigate(base + '/invoices');
    await sleep(2500);
    if (!(await rowVisible(invoice.invoiceNo))) { await searchList(invoice.invoiceNo); await sleep(1500); }
    await openRowMenu(invoice.invoiceNo);
    const dupInv = await clickAndToast('Convert to Credit Note');

    // Credit Note → Payment Receipt again
    await navigate(base + '/credit-notes');
    await sleep(2500);
    if (!(await rowVisible(cn.cnNo))) { await searchList(cn.cnNo); await sleep(1500); }
    await openRowMenu(cn.cnNo);
    const dupCn = await clickAndToast('Convert to Payment Receipt');

    // ---------- 7. Refresh — verify persistence + linkage ----------
    const verifyAfter = {};
    for (const [label, url] of [
      ['pi', '/proforma-invoices'],
      ['invoice', '/invoices'],
      ['cn', '/credit-notes'],
      ['pr', '/payment-receipts']
    ]) {
      await navigate(base + url);
      await sleep(2000);
      const docNo = label === 'pi' ? pi.piNo : label === 'invoice' ? invoice.invoiceNo : label === 'cn' ? cn.cnNo : pr.receiptNo;
      verifyAfter[label] = await rowVisible(docNo);
    }
    const piRefreshed = (await apiGet(headers, '/v1/proforma-invoices/' + pi.id)).data;
    const invRefreshed = (await apiGet(headers, '/v1/invoices/' + invoice.id)).data;
    const cnRefreshed = (await apiGet(headers, '/v1/credit-notes/' + cn.id)).data;
    const prRefreshed = (await apiGet(headers, '/v1/payment-receipts/' + pr.id)).data;

    // ---------- 8. Cleanup ----------
    for (const [module, id] of [
      ['proforma-invoices', pi.id],
      ['invoices', invoice.id],
      ['credit-notes', cn.id],
      ['payment-receipts', pr.id]
    ]) {
      try {
        await fetch(apiBase + '/v1/' + module + '/bulk-permanent-delete', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [id] })
        });
      } catch (e) { /* ignore cleanup errors */ }
    }

    const summary = {
      piMenu,
      invMenu,
      cnMenu,
      prMenu,
      chain: {
        pi: { id: pi.id, piNo: pi.piNo },
        invoice: invoice ? { id: invoice.id, invoiceNo: invoice.invoiceNo, source: invoice.source, sourceRef: invoice.sourceRef, status: invoice.status } : null,
        cn: cn ? { id: cn.id, cnNo: cn.cnNo, source: cn.source, sourceRef: cn.sourceRef, status: cn.status } : null,
        pr: pr ? { id: pr.id, receiptNo: pr.receiptNo, source: pr.source, invoiceRef: pr.invoiceRef, status: pr.status } : null
      },
      linkage: {
        piConvertedToInvoice: piAfter ? piAfter.convertedToInvoice : piRefreshed.convertedToInvoice,
        invoiceConvertedToCreditNote: invAfter ? invAfter.convertedToCreditNote : invRefreshed.convertedToCreditNote,
        cnConvertedToPr: cnAfter ? cnAfter.convertedToPr : cnRefreshed.convertedToPr
      },
      sourceDates: {
        invoiceDate: invoice ? invoice.invoiceDate : null,
        cnDate: cn ? cn.cnDate : null,
        paymentDate: pr ? pr.paymentDate : null,
        piDate: pi.piDate
      },
      duplicateProtection: {
        successToasts: { pi: successPiToast, invoice: successInvToast, cn: successCnToast },
        piReclickUrl: dupPi.url, piToast: dupPi.toast, sameInvoice: dupPi.url.includes('/invoices/' + invoice.id),
        invoiceReclickUrl: dupInv.url, invoiceToast: dupInv.toast, sameCn: dupInv.url.includes('/credit-notes/' + cn.id),
        cnReclickUrl: dupCn.url, cnToast: dupCn.toast, samePr: dupCn.url.includes('/payment-receipts/' + pr.id)
      },
      refreshPersisted: verifyAfter,
      refreshLinkage: {
        piConvertedToInvoice: piRefreshed.convertedToInvoice,
        invoiceConvertedToCreditNote: invRefreshed.convertedToCreditNote,
        cnConvertedToPr: cnRefreshed.convertedToPr,
        prSource: prRefreshed.source,
        prInvoiceRef: prRefreshed.invoiceRef
      },
      errors
    };

    console.log(JSON.stringify(summary, null, 2));
  }
};
