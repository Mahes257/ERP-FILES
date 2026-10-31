/* Verify the redesigned Credit Note create page — 12 collapsible accordion
 * sections (Refren structure) — and the create→draft-save→edit round trip
 * for the new currency / terms / remarks fields. Zero console errors.
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
    const setVal = `(el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };`;

    const sectionsState = () => evalJs(`(() => {
      return Array.from(document.querySelectorAll('button span.text-sm.font-bold')).map((sp) => {
        const btn = sp.closest('button');
        const card = btn.parentElement;
        const content = Array.from(card.children).find((c) => c !== btn && c.classList.contains('pb-5'));
        const open = !!content;
        const labels = content ? Array.from(content.querySelectorAll('label')).map((l) => l.textContent.trim()) : [];
        const textareas = content ? Array.from(content.querySelectorAll('textarea')).map((t) => t.placeholder || '') : [];
        return { title: sp.textContent.trim(), open, labels, textareas };
      });
    })()`);

    const clickSection = (title) => evalJs(`(() => {
      const sp = Array.from(document.querySelectorAll('button span.text-sm.font-bold'))
        .find((s) => s.textContent.trim().startsWith(${JSON.stringify(title)}));
      if (!sp) return false;
      sp.closest('button').click();
      return true;
    })()`);

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
    await waitFor(`document.querySelectorAll('button span.text-sm.font-bold').length >= 11`, 25000);
    await sleep(1200);
    await shot('cn-accordion-create');

    // ---- 1. Section titles + default open/closed states ----
    const sections = await sectionsState();
    const titles = sections.map((s) => s.title);

    // ---- 2. Footer buttons ----
    const footerBtns = await evalJs(`(() => {
      return Array.from(document.querySelectorAll('button'))
        .map((b) => b.textContent.trim())
        .filter((t) => ['Back', 'Save Draft', 'Save & New', 'Submit for Approval'].includes(t));
    })()`);

    // ---- 3. Collapse / expand preserves form state (Terms + Remarks) ----
    const termsValue = 'Goods must be returned in original packaging.';
    const remarksValue = 'Internal note for accounts team.';
    const interaction = await evalJs(`(async () => {
      const setVal = ${setVal};
      const sectionBtn = (t) => Array.from(document.querySelectorAll('button span.text-sm.font-bold')).find((s) => s.textContent.trim().startsWith(t)).closest('button');
      const openSection = async (t) => {
        const btn = sectionBtn(t);
        const hasContent = Array.from(btn.parentElement.children).some((c) => c !== btn && c.classList.contains('pb-5'));
        if (!hasContent) btn.click();
        await new Promise((r) => setTimeout(r, 400));
      };
      const sectionContent = (t) => Array.from(sectionBtn(t).parentElement.children).find((c) => c !== sectionBtn(t) && c.classList.contains('px-5'));

      // Terms (9) — fill, collapse, reopen, read back
      await openSection('9. Terms & Conditions');
      const termBtn = sectionBtn('9. Terms & Conditions');
      setVal(sectionContent('9. Terms & Conditions').querySelectorAll('textarea')[0], ${JSON.stringify(termsValue)});
      termBtn.click();
      await new Promise((r) => setTimeout(r, 400));
      const collapsedNoContent = !Array.from(termBtn.parentElement.children).some((c) => c !== termBtn && c.classList.contains('px-5'));
      termBtn.click();
      await new Promise((r) => setTimeout(r, 400));
      const termsAfter = sectionContent('9. Terms & Conditions').querySelectorAll('textarea')[0].value;

      // Remarks (10) — fill and read back
      await openSection('10. Remarks');
      setVal(sectionContent('10. Remarks').querySelectorAll('textarea')[0], ${JSON.stringify(remarksValue)});
      const remarksAfter = sectionContent('10. Remarks').querySelectorAll('textarea')[0].value;

      return { collapsedNoContent, termsAfter, remarksAfter };
    })()`);

    // ---- 4. Section 4 (Currency / Tax) present with INR default ----
    const currencyState = await evalJs(`(async () => {
      const sp = Array.from(document.querySelectorAll('button span.text-sm.font-bold')).find((s) => s.textContent.trim().startsWith('4. Currency / Tax'));
      const btn = sp.closest('button');
      const card = btn.parentElement;
      const hasContent = Array.from(card.children).some((c) => c !== btn && c.classList.contains('pb-5'));
      if (!hasContent) btn.click();
      await new Promise((r) => setTimeout(r, 500));
      const content = Array.from(btn.parentElement.children).find((c) => c !== btn && c.classList.contains('px-5'));
      const curInput = Array.from(content.querySelectorAll('input')).find((i) => i.placeholder && i.placeholder.toLowerCase().includes('curren'));
      return {
        hasCurrencyInput: !!curInput,
        currencyValue: curInput ? curInput.value : null,
        hasTaxTypeLabel: Array.from(content.querySelectorAll('label')).some((l) => l.textContent.includes('Tax Type')),
        taxTypeText: (content.textContent.match(/CGST \\+ SGST|IGST/) || [null])[0]
      };
    })()`);

    // ---- 5. Signature placeholder (section 11) ----
    const signatureState = await evalJs(`(async () => {
      const sp = Array.from(document.querySelectorAll('button span.text-sm.font-bold')).find((s) => s.textContent.trim().startsWith('11. Signature'));
      const btn = sp.closest('button');
      const card = btn.parentElement;
      const hasContent = Array.from(card.children).some((c) => c !== btn && c.classList.contains('pb-5'));
      if (!hasContent) btn.click();
      await new Promise((r) => setTimeout(r, 400));
      const content = Array.from(btn.parentElement.children).find((c) => c !== btn && c.classList.contains('px-5'));
      return {
        hasPlaceholder: content.textContent.includes('Signature capture is not configured'),
        hasComingSoon: content.textContent.includes('Coming Soon')
      };
    })()`);

    // ---- 6. Save Draft → list, then verify persisted terms/remarks via API ----
    const savedNo = await evalJs(`(async () => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Save Draft');
      if (!btn) return null;
      btn.click();
      await new Promise((r) => setTimeout(r, 3500));
      return location.href;
    })()`);

    // ---- 7. API lookup of the saved draft (unique terms/remarks) ----
    let apiResult = null;
    try {
      const login = await fetch(base.replace('5173', '8080') + '/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' })
      }).then((r) => r.json());
      const headers = { Authorization: 'Bearer ' + login.data.token };
      const listRes = await fetch(base.replace('5173', '8080') + '/v1/credit-notes?page=0&size=200', { headers }).then((r) => r.json());
      const list = listRes.content || listRes.data?.content || listRes.data || [];
      const mine = list.find((c) => c.terms === termsValue && c.remarks === remarksValue);
      apiResult = mine ? {
        id: mine.id, cnNo: mine.cnNo, status: mine.status,
        currency: mine.currency, terms: mine.terms, remarks: mine.remarks
      } : { notFound: true, total: list.length };
      if (mine) {
        // ---- 8. Edit round trip in the browser ----
        await navigate(base + '/credit-notes/' + mine.id + '/edit');
        await sleep(2500);
        await waitFor(`document.querySelectorAll('button span.text-sm.font-bold').length >= 11`, 25000);
        await sleep(1000);
        const editState = await evalJs(`(async () => {
          const sectionBtn = (t) => Array.from(document.querySelectorAll('button span.text-sm.font-bold')).find((s) => s.textContent.trim().startsWith(t)).closest('button');
          const openSection = async (t) => {
            const btn = sectionBtn(t);
            const hasContent = Array.from(btn.parentElement.children).some((c) => c !== btn && c.classList.contains('pb-5'));
            if (!hasContent) btn.click();
            await new Promise((r) => setTimeout(r, 400));
          };
          const sectionContent = (t) => Array.from(sectionBtn(t).parentElement.children).find((c) => c !== sectionBtn(t) && c.classList.contains('px-5'));
          await openSection('9. Terms & Conditions');
          await openSection('10. Remarks');
          await openSection('4. Currency / Tax');
          const terms = sectionContent('9. Terms & Conditions').querySelectorAll('textarea')[0].value;
          const remarks = sectionContent('10. Remarks').querySelectorAll('textarea')[0].value;
          const curInput = Array.from(sectionContent('4. Currency / Tax').querySelectorAll('input')).find((i) => i.placeholder && i.placeholder.toLowerCase().includes('curren'));
          return { terms, remarks, currency: curInput ? curInput.value : null };
        })()`);
        apiResult.editState = editState;
        await shot('cn-accordion-edit');
      }
    } catch (err) {
      apiResult = { error: err.message };
    }

    console.log(JSON.stringify({ sections, titles, footerBtns, interaction, currencyState, signatureState, savedNo, apiResult, errors }, null, 2));
  }
};
