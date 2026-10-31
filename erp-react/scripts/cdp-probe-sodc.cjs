module.exports = { run: async ({ cdp, sleep, helpers }) => {
  const { evalJs, navigate } = helpers;
  for (const [tag, route] of [['SO', '/sales-orders/new'], ['DC', '/delivery-challans/new']]) {
    await navigate('http://localhost:5173' + route);
    await sleep(4500);
    const dump = await evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('button')).map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const adds = btns.filter((t) => t.includes('Add'));
      const footer = document.querySelector('.sticky');
      const fb = footer ? Array.from(footer.querySelectorAll('button')).map((b) => b.textContent.replace(/\s+/g, ' ').trim()) : [];
      const primary = Array.from(document.querySelectorAll('button')).find((b) => b.className.includes('032f25'));
      return { adds: adds.slice(0, 6), footer: fb, primaryLabel: primary ? primary.textContent.replace(/\s+/g, ' ').trim() : null };
    })()`);
    console.log('SODC_' + tag + ': ' + JSON.stringify(dump));
  }
  console.log('SODC_PROBE_DONE');
}};
