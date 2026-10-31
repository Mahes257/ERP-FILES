/* Verify KPI card click behavior is unchanged after the grid layout change. */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs } = helpers;
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');

    await navigate('http://localhost:5173/sales-orders');
    await waitFor(`document.querySelectorAll('button').length > 3`, 25000);
    await sleep(1500);

    const before = await evalJs(`(() => {
      const cards = Array.from(document.querySelectorAll('button')).filter((b) => !!b.querySelector('.text-base.font-bold'));
      return { count: cards.length, activeCount: cards.filter((c) => c.className.includes('border-[#0B4A3D]')).length };
    })()`);

    await evalJs(`(() => {
      const cards = Array.from(document.querySelectorAll('button')).filter((b) => !!b.querySelector('.text-base.font-bold'));
      const draft = cards.find((c) => c.textContent.includes('Draft'));
      if (draft) draft.click();
    })()`);
    await sleep(1500);

    const after = await evalJs(`(() => {
      const cards = Array.from(document.querySelectorAll('button')).filter((b) => !!b.querySelector('.text-base.font-bold'));
      const active = cards.find((c) => c.className.includes('border-[#0B4A3D]'));
      return {
        activeLabel: active ? active.textContent.replace(/\\s+/g, ' ').trim() : null,
        activeCount: cards.filter((c) => c.className.includes('border-[#0B4A3D]')).length,
        filterIndicator: document.body.innerText.includes('Active filter')
      };
    })()`);

    console.log(JSON.stringify({ before, after, errors }, null, 2));
  }
};
