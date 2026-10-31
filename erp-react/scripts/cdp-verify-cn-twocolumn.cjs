/* Verify the two-column Credit Note create page:
 *   LEFT  (col-span-7): Customer & Company, Credit Note Details, Reason, Currency / Tax, Items, Settlement
 *   RIGHT (col-span-3): Totals, Status, Attachments, Terms & Conditions, Remarks, Signature
 * plus single Totals instance, status badge, collapse-preserves-values, INR default,
 * footer buttons, create → Save Draft → API persisted → edit prefill round trip, zero console errors.
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

    const cardFinder = `(t) => {
      const sp = Array.from(document.querySelectorAll('button span.text-sm.font-bold')).find((s) => s.textContent.trim().startsWith(t));
      return sp ? sp.closest('button').parentElement : null;
    }`;

    const sectionState = `(t) => {
      const card = (${cardFinder})(t);
      if (!card) return null;
      const btn = card.querySelector('button');
      const content = Array.from(card.children).find((c) => c !== btn && c.classList.contains('pb-5'));
      const labels = content ? Array.from(content.querySelectorAll('label')).map((l) => l.textContent.trim()) : [];
      const textareas = content ? Array.from(content.querySelectorAll('textarea')).map((ta) => ta.value) : [];
      const inputs = content ? Array.from(content.querySelectorAll('input')).map((i) => ({ ph: i.placeholder || '', val: i.value })) : [];
      return { open: !!content, labels, textareas, inputs };
    }`;

    // ---- Open the create page (login when needed) ----
    await navigate(base + '/credit-notes/new');
    await sleep(3000);
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
      await navigate(base + '/credit-notes/new');
      await sleep(2500);
    }
    await waitFor(`document.querySelectorAll('button span.text-sm.font-bold').length >= 12`, 25000);
    await sleep(1200);

    // ---- 1. Column structure + ordered section titles ----
    const layout = await evalJs(`(() => {
      const grid = document.querySelector('.max-w-7xl.grid');
      const left = Array.from(document.querySelectorAll('div')).find((d) => d.className && d.className.includes('lg:col-span-7') && d.className.includes('space-y-4'));
      const right = Array.from(document.querySelectorAll('div')).find((d) => d.className && d.className.includes('lg:col-span-3'));
      const colOf = (card) => {
        let p = card;
        while (p && p !== document.body) {
          if (p.className && p.className.includes && (p.className.includes('lg:col-span-7') || p.className.includes('lg:col-span-3'))) {
            return p.className.includes('lg:col-span-7') ? 'left' : 'right';
          }
          p = p.parentElement;
        }
        return null;
      };
      const cards = Array.from(document.querySelectorAll('button span.text-sm.font-bold')).map((sp) => {
        const card = sp.closest('button').parentElement;
        const content = Array.from(card.children).find((c) => c !== sp.closest('button') && c.classList.contains('pb-5'));
        return { title: sp.textContent.trim(), open: !!content, col: colOf(card) };
      });
      return {
        hasGrid: !!grid,
        hasLeft: !!left,
        hasRight: !!right,
        gridClass: grid ? grid.className : null,
        leftClass: left ? left.className : null,
        rightClass: right ? right.className : null,
        cards
      };
    })()`);

    const titles = layout.cards.map((c) => c.title);
    const leftTitles = layout.cards.filter((c) => c.col === 'left').map((c) => c.title);
    const rightTitles = layout.cards.filter((c) => c.col === 'right').map((c) => c.title);
    const totalsCount = titles.filter((t) => t === 'Totals').length;

    // ---- 2. Footer buttons ----
    const footerBtns = await evalJs(`(() => {
      return Array.from(document.querySelectorAll('button'))
        .map((b) => b.textContent.trim())
        .filter((t) => ['Back', 'Save Draft', 'Save & New', 'Submit for Approval'].includes(t));
    })()`);

    // ---- 3. Status card shows badge + select ----
    const statusState = await evalJs(`(async () => {
      const card = (${cardFinder})('Status');
      const openSection = async (btn) => {
        const hasContent = Array.from(btn.parentElement.children).some((c) => c !== btn && c.classList.contains('pb-5'));
        if (!hasContent) btn.click();
        await new Promise((r) => setTimeout(r, 400));
      };
      await openSection(card.querySelector('button'));
      const content = Array.from(card.children).find((c) => c !== card.querySelector('button') && c.classList.contains('px-5'));
      const badge = content.querySelector('span[class*=rounded-]');
      const sel = content.querySelector('select');
      return {
        badgeText: badge ? badge.textContent.trim() : null,
        selectLabel: Array.from(content.querySelectorAll('label')).map((l) => l.textContent.trim()),
        selectOptions: sel ? Array.from(sel.options).map((o) => o.textContent.trim()) : null
      };
    })()`);

    // ---- 4. Collapse / expand preserves sidebar form state (Terms + Remarks) ----
    const termsValue = 'Two-column layout goods must be returned in original packaging.';
    const remarksValue = 'Internal note for the accounts team (two-column).';
    const interaction = await evalJs(`(async () => {
      const setVal = ${setVal};
      const cardOf = ${cardFinder};
      const openSection = async (t) => {
        const btn = cardOf(t).querySelector('button');
        const hasContent = Array.from(btn.parentElement.children).some((c) => c !== btn && c.classList.contains('pb-5'));
        if (!hasContent) btn.click();
        await new Promise((r) => setTimeout(r, 400));
      };
      const contentOf = (t) => Array.from(cardOf(t).children).find((c) => c !== cardOf(t).querySelector('button') && c.classList.contains('px-5'));

      await openSection('Terms & Conditions');
      const termBtn = cardOf('Terms & Conditions').querySelector('button');
      setVal(contentOf('Terms & Conditions').querySelectorAll('textarea')[0], ${JSON.stringify(termsValue)});
      termBtn.click();
      await new Promise((r) => setTimeout(r, 400));
      const collapsedNoContent = !Array.from(termBtn.parentElement.children).some((c) => c !== termBtn && c.classList.contains('px-5'));
      termBtn.click();
      await new Promise((r) => setTimeout(r, 400));
      const termsAfter = contentOf('Terms & Conditions').querySelectorAll('textarea')[0].value;

      await openSection('Remarks');
      setVal(contentOf('Remarks').querySelectorAll('textarea')[0], ${JSON.stringify(remarksValue)});
      const remarksAfter = contentOf('Remarks').querySelectorAll('textarea')[0].value;

      return { collapsedNoContent, termsAfter, remarksAfter };
    })()`);

    // ---- 5. Currency default INR + Tax Type label ----
    const currencyState = await evalJs(`(async () => {
      const card = (${cardFinder})('Currency / Tax');
      const btn = card.querySelector('button');
      const hasContent = Array.from(card.children).some((c) => c !== btn && c.classList.contains('pb-5'));
      if (!hasContent) btn.click();
      await new Promise((r) => setTimeout(r, 500));
      const content = Array.from(card.children).find((c) => c !== btn && c.classList.contains('px-5'));
      const curInput = Array.from(content.querySelectorAll('input')).find((i) => i.placeholder && i.placeholder.toLowerCase().includes('curren'));
      return {
        hasCurrencyInput: !!curInput,
        currencyValue: curInput ? curInput.value : null,
        hasTaxTypeLabel: Array.from(content.querySelectorAll('label')).some((l) => l.textContent.includes('Tax Type'))
      };
    })()`);

    // ---- 6. CN No + Date visible in the Details card ----
    const detailsState = await evalJs(`(() => {
      const card = (${cardFinder})('Credit Note Details');
      const labels = Array.from(card.querySelectorAll('label')).map((l) => l.textContent.trim());
      const hasDate = !!card.querySelector('input[type=date]');
      const hasCnLabel = labels.some((l) => l.includes('Credit Note Number'));
      const hasSourceLabel = labels.some((l) => l.includes('Source'));
      return { hasCnLabel, hasDate, hasSourceLabel, labels };
    })()`);

    // ---- 7. Signature placeholder ----
    const signatureState = await evalJs(`(async () => {
      const card = (${cardFinder})('Signature');
      const btn = card.querySelector('button');
      const hasContent = Array.from(card.children).some((c) => c !== btn && c.classList.contains('pb-5'));
      if (!hasContent) btn.click();
      await new Promise((r) => setTimeout(r, 400));
      const content = Array.from(card.children).find((c) => c !== btn && c.classList.contains('px-5'));
      return {
        hasPlaceholder: content.textContent.includes('Signature capture is not configured'),
        hasComingSoon: content.textContent.includes('Coming Soon')
      };
    })()`);

    await shot('cn-twocolumn-create');

    // ---- 8. Save Draft → list, then API lookup ----
    const savedNo = await evalJs(`(async () => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Save Draft');
      if (!btn) return null;
      btn.click();
      await new Promise((r) => setTimeout(r, 3500));
      return location.href;
    })()`);

    let apiResult = null;
    let mineId = null;
    try {
      const login = await fetch(apiBase + '/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' })
      }).then((r) => r.json());
      const headers = { Authorization: 'Bearer ' + login.data.token };
      const listRes = await fetch(apiBase + '/v1/credit-notes?page=0&size=200', { headers }).then((r) => r.json());
      const list = listRes.content || listRes.data?.content || listRes.data || [];
      const mine = list.find((c) => c.terms === termsValue && c.remarks === remarksValue);
      apiResult = mine ? {
        id: mine.id, cnNo: mine.cnNo, status: mine.status,
        currency: mine.currency, terms: mine.terms, remarks: mine.remarks
      } : { notFound: true, total: list.length };
      if (mine) {
        mineId = mine.id;
        await navigate(base + '/credit-notes/' + mine.id + '/edit');
        await sleep(2500);
        await waitFor(`document.querySelectorAll('button span.text-sm.font-bold').length >= 12`, 25000);
        await sleep(1000);
        const editState = await evalJs(`(async () => {
          const cardOf = ${cardFinder};
          const openSection = async (t) => {
            const btn = cardOf(t).querySelector('button');
            const hasContent = Array.from(btn.parentElement.children).some((c) => c !== btn && c.classList.contains('pb-5'));
            if (!hasContent) btn.click();
            await new Promise((r) => setTimeout(r, 400));
          };
          const contentOf = (t) => Array.from(cardOf(t).children).find((c) => c !== cardOf(t).querySelector('button') && c.classList.contains('px-5'));
          await openSection('Terms & Conditions');
          await openSection('Remarks');
          await openSection('Currency / Tax');
          await openSection('Status');
          const terms = contentOf('Terms & Conditions').querySelectorAll('textarea')[0].value;
          const remarks = contentOf('Remarks').querySelectorAll('textarea')[0].value;
          const curInput = Array.from(contentOf('Currency / Tax').querySelectorAll('input')).find((i) => i.placeholder && i.placeholder.toLowerCase().includes('curren'));
          const statusContent = contentOf('Status');
          const badge = statusContent.querySelector('span[class*=rounded-]');
          return {
            terms, remarks,
            currency: curInput ? curInput.value : null,
            statusBadge: badge ? badge.textContent.trim() : null
          };
        })()`);
        apiResult.editState = editState;
        await shot('cn-twocolumn-edit');
        // cleanup test record
        try {
          await fetch(apiBase + '/v1/credit-notes/' + mine.id, { method: 'DELETE', headers });
        } catch (e) { apiResult.cleanupError = e.message; }
      }
    } catch (err) {
      apiResult = { error: err.message };
    }

    console.log(JSON.stringify({
      layout, titles, leftTitles, rightTitles, totalsCount,
      footerBtns, statusState, interaction, currencyState, detailsState,
      signatureState, savedNo, apiResult, errors
    }, null, 2));
  }
};
