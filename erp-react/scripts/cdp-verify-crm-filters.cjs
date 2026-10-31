module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;
    for (const [tag, route] of [['CLIENTS', '/clients'], ['LEADS', '/leads'], ['FOLLOWUPS', '/followups']]) {
      await navigate('http://localhost:5173' + route);
      await sleep(4200);
      await evalJs(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Show Filters'));
        if (btn) btn.click();
        return true;
      })()`);
      await sleep(900);
      const out = await evalJs(`(() => {
        const norm = (t) => t.replace(/\\s+/g, ' ').trim();
        const groups = Array.from(document.querySelectorAll('[class*="filter-group"]'));
        return groups.map((g) => {
          const label = g.querySelector('[class*="filter-label"]');
          const sel = g.querySelector('select');
          return {
            label: label ? norm(label.textContent) : null,
            options: sel ? Array.from(sel.options).map((o) => norm(o.textContent)) : []
          };
        });
      })()`);
      console.log(tag + '_FILTERS: ' + JSON.stringify(out));
    }
  }
};
