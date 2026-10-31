module.exports = {
  run: async ({ sleep, helpers }) => {
    const { navigate, waitFor, evalJs } = helpers;
    await navigate('http://localhost:5173/credit-notes/new');
    await sleep(3000);
    const needsLogin = await evalJs(`!!document.querySelector('input[type=email]')`);
    if (needsLogin) {
      await evalJs(`(() => {
        const setVal = (el, v) => {
          const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setVal(document.querySelector('input[type=email]'), 'admin@vishaktech.com');
        setVal(document.querySelector('input[type=password]'), 'Admin@123');
        document.querySelector('button[type=submit]').click();
      })()`);
      await waitFor(`!location.href.includes('signin')`, 20000);
      await sleep(2500);
      await navigate('http://localhost:5173/credit-notes/new');
      await sleep(2500);
    }
    await waitFor(`document.querySelectorAll('button span.text-sm.font-bold').length >= 11`, 25000);
    await sleep(1200);
    const out = await evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('button span.text-sm.font-bold')).map((s) => s.textContent.trim());
      const sec9 = btns.find((t) => t.startsWith('9. Terms'));
      const sp = Array.from(document.querySelectorAll('button span.text-sm.font-bold')).find((s) => s.textContent.trim() === sec9);
      const btn = sp.closest('button');
      const card = btn.parentElement;
      return {
        title: sec9,
        cardChildren: Array.from(card.children).map((c) => ({ tag: c.tagName, cls: c.className })),
        hasContent: Array.from(card.children).some((c) => c.classList.contains('px-5'))
      };
    })()`);
    // click it
    const clicked = await evalJs(`(() => {
      const sp = Array.from(document.querySelectorAll('button span.text-sm.font-bold')).find((s) => s.textContent.trim().startsWith('9. Terms'));
      sp.closest('button').click();
      return true;
    })()`);
    await sleep(800);
    const after = await evalJs(`(() => {
      const sp = Array.from(document.querySelectorAll('button span.text-sm.font-bold')).find((s) => s.textContent.trim().startsWith('9. Terms'));
      const btn = sp.closest('button');
      const card = btn.parentElement;
      const content = Array.from(card.children).find((c) => c !== btn && c.classList.contains('px-5'));
      return {
        cardChildren: Array.from(card.children).map((c) => ({ tag: c.tagName, cls: c.className })),
        hasContent: !!content,
        textareas: content ? content.querySelectorAll('textarea').length : 0,
        labels: content ? Array.from(content.querySelectorAll('label')).map((l) => l.textContent.trim()) : []
      };
    })()`);
    console.log(JSON.stringify({ out, clicked, after }, null, 2));
  }
};
